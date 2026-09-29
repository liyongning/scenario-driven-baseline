import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPaymentCase, runProtocolSuite } from '../../host/weapp/protocol-runner.ts';

const generatedRunner = new URL('../../host/weapp/.generated/protocol-runner.js', import.meta.url).pathname;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  return rm(dirname(generatedRunner), { recursive: true, force: true });
});

describe('official minimal weapp host', () => {
  it('registers the protocol runner on the App instance', async () => {
    let definition: { runProtocolCase(input: unknown): Promise<unknown>; runProtocolSuite(input: unknown): Promise<unknown>; runPaymentCase(input: unknown): Promise<unknown> } | undefined;
    const runProtocolCase = vi.fn(async (input: unknown) => ({ input }));
    const runProtocolSuite = vi.fn(async (input: unknown) => ({ suite: input }));
    const runPaymentCase = vi.fn(async (input: unknown) => ({ payment: input }));
    vi.stubGlobal('__PAYMENT_TEST_RUNNER__', { runProtocolCase, runProtocolSuite, runPaymentCase });
    vi.stubGlobal('App', (value: typeof definition) => { definition = value; });

    // @ts-expect-error 官方小程序宿主使用无声明的 JavaScript 入口。
    await import('../../host/weapp/app.js');

    await expect(definition?.runProtocolCase({ caseKey: 'omitted' })).resolves.toEqual({ input: { caseKey: 'omitted' } });
    await expect(definition?.runProtocolSuite('matrix')).resolves.toEqual({ suite: 'matrix' });
    await expect(definition?.runPaymentCase('pay')).resolves.toEqual({ payment: 'pay' });
    expect(runProtocolCase).toHaveBeenCalledOnce();
    expect(runProtocolSuite).toHaveBeenCalledOnce();
    expect(runPaymentCase).toHaveBeenCalledOnce();
  });

  it('registers an interaction-free empty page', async () => {
    const page = vi.fn();
    vi.stubGlobal('Page', page);

    // @ts-expect-error 官方小程序宿主使用无声明的 JavaScript 页面。
    await import('../../host/weapp/pages/index/index.js');

    expect(page).toHaveBeenCalledWith({});
  });

  it('loads the built runner through CommonJS when no test injection exists', async () => {
    let definition: { runProtocolCase(input: unknown): Promise<unknown> } | undefined;
    await mkdir(dirname(generatedRunner), { recursive: true });
    await writeFile(generatedRunner, 'export const runProtocolCase = async input => input;\n');
    vi.stubGlobal('__PAYMENT_TEST_RUNNER__', undefined);
    vi.stubGlobal('App', (value: typeof definition) => { definition = value; });

    // @ts-expect-error 官方小程序宿主使用无声明的 JavaScript 入口。
    await import('../../host/weapp/app.js');

    await expect(definition?.runProtocolCase('case')).resolves.toBe('case');
  });

  it('dispatches the controlled channel callback when the host has no queueMicrotask global', async () => {
    const responses = [
      {
        baseResp: { statusCode: '0', success: true },
        tradeNo: 'trade-host-callback', paymentNo: 'payment-host-callback',
        channel: 'CHANNEL_WECHAT_VIRTUAL', expireTime: '1800000000000',
        payParams: { wechatVirtual: { mode: 'short_series_goods', signData: '{}', paySig: 'sig', signature: 'signature' } },
      },
      { baseResp: { statusCode: '0', success: true }, trade: { tradeNo: 'trade-host-callback', status: 'TRADE_STATUS_PAID', expireTime: '1800000000000' } },
    ];
    const request = vi.fn((options: { success(value: unknown): void; complete?(): void }) => {
      const body = responses.shift();
      void Promise.resolve().then(() => {
        options.success({ statusCode: 200, header: {}, data: JSON.stringify(body) });
        options.complete?.();
      });
      return { abort() {} };
    });
    vi.stubGlobal('wx', { request, canIUse: () => false });
    vi.stubGlobal('queueMicrotask', undefined);

    const result = await runPaymentCase({
      gatewayBaseUrl: 'https://fixture.invalid', tradeNo: 'trade-host-callback',
      accessToken: 'fixture-token', appId: 'app-fixture', caseKey: 'explicit-undefined', channelModes: ['success'],
    });

    expect(result.outcomes[0]).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } });
    expect(result.platformCalls).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.events.map(event => event.kind === 'phase' ? `phase:${event.phase}` : event.kind === 'http-request' ? `http:${event.url?.endsWith('/pay') ? 'pay' : 'query'}` : event.kind === 'outcome' ? `outcome:${event.reason}` : event.kind)).toEqual([
      'http:pay', 'http-response', 'phase:channel_invoking', 'channel-invoke', 'channel-callback', 'phase:confirming', 'http:query', 'http-response', 'outcome:confirmed',
    ]);
  });

  it('dispatches a controlled channel failure when the host has no queueMicrotask global', async () => {
    const request = vi.fn((options: { success(value: unknown): void; complete?(): void }) => {
      void Promise.resolve().then(() => {
        options.success({ statusCode: 200, header: {}, data: JSON.stringify({
          baseResp: { statusCode: '0', success: true },
          tradeNo: 'trade-host-failure', paymentNo: 'payment-host-failure',
          channel: 'CHANNEL_WECHAT_VIRTUAL', expireTime: '1800000000000',
          payParams: { wechatVirtual: { mode: 'short_series_goods', signData: '{}', paySig: 'sig', signature: 'signature' } },
        }) });
        options.complete?.();
      });
      return { abort() {} };
    });
    vi.stubGlobal('wx', { request, canIUse: () => false });
    vi.stubGlobal('queueMicrotask', undefined);

    const result = await runPaymentCase({
      gatewayBaseUrl: 'https://fixture.invalid', tradeNo: 'trade-host-failure',
      accessToken: 'fixture-token', appId: 'app-fixture', caseKey: 'cancelled', channelModes: ['cancel'],
    });

    expect(result.outcomes[0]).toMatchObject({ reason: 'channel_cancelled', channelSignal: 'cancelled' });
    expect(result.platformCalls).toBe(1);
    expect(request).toHaveBeenCalledOnce();
  });

  it('runs successive selections as sandbox, prod, then omitted on distinct trades', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const request = vi.fn((options: { url: string; data: string; success(value: unknown): void; complete?(): void }) => {
      const body = JSON.parse(options.data) as Record<string, unknown>;
      sent.push(body);
      const tradeNo = String(body.tradeNo);
      const response = options.url.endsWith('/pay')
        ? {
            baseResp: { statusCode: '0', success: true }, tradeNo, paymentNo: `payment-${tradeNo}`,
            channel: 'CHANNEL_WECHAT_VIRTUAL', expireTime: '1800000000000',
            payParams: { wechatVirtual: { mode: 'short_series_goods', signData: '{}', paySig: 'sig', signature: 'signature' } },
          }
        : { baseResp: { statusCode: '0', success: true }, trade: { tradeNo, status: 'TRADE_STATUS_PAID', expireTime: '1800000000000' } };
      void Promise.resolve().then(() => {
        options.success({ statusCode: 200, header: {}, data: JSON.stringify(response) });
        options.complete?.();
      });
      return { abort() {} };
    });
    vi.stubGlobal('wx', { request, canIUse: () => false });

    const result = await runPaymentCase({
      gatewayBaseUrl: 'https://fixture.invalid', tradeNo: 'unused', accessToken: 'fixture-token', appId: 'app-fixture',
      caseKey: 'successive-selection', channelModes: ['success', 'success', 'success'],
      tradeNos: ['trade-sandbox', 'trade-prod', 'trade-omitted'],
    });
    const prepares = sent.filter(body => body.channel === 'CHANNEL_WECHAT_VIRTUAL');

    expect(prepares.map(body => body.tradeNo)).toEqual(['trade-sandbox', 'trade-prod', 'trade-omitted']);
    expect(prepares.map(body => body.xpayEnv)).toEqual(['XPAY_ENV_SANDBOX', 'XPAY_ENV_PROD', undefined]);
    expect(result.outcomes.map(outcome => outcome.snapshot.reference.tradeNo)).toEqual(['trade-sandbox', 'trade-prod', 'trade-omitted']);
    expect(result.outcomes).toMatchObject([
      { reason: 'confirmed' },
      { reason: 'confirmed' },
      { reason: 'confirmed' },
    ]);
    expect(new Set(result.outcomes.map(outcome => outcome.attemptId)).size).toBe(3);
    expect(result.phases.map(event => event.attemptId)).toEqual(result.outcomes.flatMap(outcome => [outcome.attemptId, outcome.attemptId]));
    expect(result.events.filter(event => event.kind === 'outcome')).toHaveLength(3);
    expect(result.channelArgumentKeys).toEqual(Array.from({ length: 3 }, () => ['mode', 'paySig', 'signData', 'signature']));
  });

  it('runs FLOW-008 omitted and explicit undefined as two absent wire fields', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const request = vi.fn((options: { url: string; data: string; success(value: unknown): void; complete?(): void }) => {
      const body = JSON.parse(options.data) as Record<string, unknown>; sent.push(body); const tradeNo = String(body.tradeNo);
      const response = options.url.endsWith('/pay')
        ? { baseResp: { statusCode: '0', success: true }, tradeNo, paymentNo: `payment-${tradeNo}`, channel: 'CHANNEL_WECHAT_VIRTUAL', expireTime: '1800000000000', payParams: { wechatVirtual: { mode: 'short_series_goods', signData: '{}', paySig: 'sig', signature: 'signature' } } }
        : { baseResp: { statusCode: '0', success: true }, trade: { tradeNo, status: 'TRADE_STATUS_PAID', expireTime: '1800000000000' } };
      void Promise.resolve().then(() => { options.success({ statusCode: 200, header: {}, data: JSON.stringify(response) }); options.complete?.(); });
      return { abort() {} };
    });
    vi.stubGlobal('wx', { request, canIUse: () => false });

    const result = await runPaymentCase({ gatewayBaseUrl: 'https://fixture.invalid', tradeNo: 'unused', accessToken: 'fixture-token', appId: 'app-fixture', caseKey: 'flow-omitted', channelModes: ['success', 'success'], tradeNos: ['trade-omitted', 'trade-explicit-undefined'] });
    const prepares = sent.filter(body => body.channel === 'CHANNEL_WECHAT_VIRTUAL');

    expect(prepares.map(body => body.tradeNo)).toEqual(['trade-omitted', 'trade-explicit-undefined']);
    expect(prepares.every(body => !Object.prototype.hasOwnProperty.call(body, 'xpayEnv'))).toBe(true);
    expect(result.outcomes).toMatchObject([{ reason: 'confirmed' }, { reason: 'confirmed' }]);
    expect(new Set(result.outcomes.map(outcome => outcome.attemptId)).size).toBe(2);
    expect(result.phases.map(event => [event.attemptId, event.phase])).toEqual(result.outcomes.flatMap(outcome => [[outcome.attemptId, 'channel_invoking'], [outcome.attemptId, 'confirming']]));
    expect(result.events.filter(event => event.kind === 'http-request').map(event => event.url?.endsWith('/pay') ? 'pay' : 'query')).toEqual(['pay', 'query', 'pay', 'query']);
    expect(result.channelArgumentKeys).toEqual(Array.from({ length: 2 }, () => ['mode', 'paySig', 'signData', 'signature']));
  });

  it('returns protocol projections without nested bigint values', async () => {
    const request = vi.fn((options: { success(value: unknown): void; complete?(): void }) => {
      void Promise.resolve().then(() => {
        options.success({ statusCode: 200, header: {}, data: JSON.stringify({ baseResp: { statusCode: '0', serverTimeMs: '1' } }) });
        options.complete?.();
      });
      return { abort() {} };
    });
    vi.stubGlobal('wx', { request });

    const result = await runProtocolSuite({
      action: 'createTradePay', gatewayBaseUrl: 'https://fixture.invalid', request: { tradeNo: 'trade-projection' },
      sparseRequest: { tradeNo: 'trade-projection' }, accessToken: 'fixture-token', requestId: 'request-projection',
      productId: 'product-projection', timeoutMs: 100, responseCount: 1, responsePaths: ['base_resp'],
    });
    const containsBigint = (value: unknown): boolean => typeof value === 'bigint'
      || Boolean(value && typeof value === 'object' && Object.values(value).some(containsBigint));

    expect(containsBigint(result)).toBe(false);
  });
});
