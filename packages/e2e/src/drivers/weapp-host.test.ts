import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodedProjection, runProtocolSuite } from '../../host/weapp/protocol-runner.ts';
// template-example:begin
import { runExampleCase } from '../../host/weapp/example-runner.ts';
// template-example:end

const generatedRunner = new URL('../../host/weapp/.generated/protocol-runner.js', import.meta.url)
  .pathname;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  return rm(dirname(generatedRunner), { recursive: true, force: true });
});

describe('official minimal weapp host', () => {
  it('registers the protocol runner on the App instance', async () => {
    let definition:
      | {
          runProtocolCase(input: unknown): Promise<unknown>;
          runProtocolSuite(input: unknown): Promise<unknown>;
          // template-example:begin
          runExampleCase(input: unknown): Promise<unknown>;
          // template-example:end
        }
      | undefined;
    const runProtocolCase = vi.fn(async (input: unknown) => ({ input }));
    const runProtocolSuite = vi.fn(async (input: unknown) => ({ suite: input }));
    // template-example:begin
    const runExampleCase = vi.fn(async (input: unknown) => ({ example: input }));
    // template-example:end
    vi.stubGlobal('__TEMPLATE_TEST_RUNNER__', { runProtocolCase, runProtocolSuite });
    // template-example:begin
    vi.stubGlobal('__EXAMPLE_TEST_RUNNER__', { runExampleCase });
    // template-example:end
    vi.stubGlobal('App', (value: typeof definition) => {
      definition = value;
    });

    // @ts-expect-error 官方小程序宿主使用无声明的 JavaScript 入口。
    await import('../../host/weapp/app.js');

    await expect(definition?.runProtocolCase({ caseKey: 'omitted' })).resolves.toEqual({
      input: { caseKey: 'omitted' },
    });
    await expect(definition?.runProtocolSuite('matrix')).resolves.toEqual({ suite: 'matrix' });
    // template-example:begin
    await expect(definition?.runExampleCase('example')).resolves.toEqual({ example: 'example' });
    // template-example:end
    expect(runProtocolCase).toHaveBeenCalledOnce();
    expect(runProtocolSuite).toHaveBeenCalledOnce();
    // template-example:begin
    expect(runExampleCase).toHaveBeenCalledOnce();
    // template-example:end
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
    // template-example:begin
    await writeFile(
      new URL('../../host/weapp/.generated/example-runner.js', import.meta.url),
      'export const runExampleCase = async input => input;\n',
    );
    // template-example:end
    vi.stubGlobal('__TEMPLATE_TEST_RUNNER__', undefined);
    // template-example:begin
    vi.stubGlobal('__EXAMPLE_TEST_RUNNER__', undefined);
    // template-example:end
    vi.stubGlobal('App', (value: typeof definition) => {
      definition = value;
    });

    // @ts-expect-error 官方小程序宿主使用无声明的 JavaScript 入口。
    await import('../../host/weapp/app.js');

    await expect(definition?.runProtocolCase('case')).resolves.toBe('case');
  });

  // template-example:begin
  it('runs the example create, observation, flow, and input-failure branches through the SDK', async () => {
    const requests: string[] = [];
    const request = vi.fn(
      (options: { url: string; success(value: unknown): void; complete?(): void }) => {
        requests.push(options.url);
        const response = options.url.endsWith('/create')
          ? { tradeNo: 'example-host-1', baseResp: { statusCode: '0' } }
          : {
              trade: { tradeNo: 'example-host-1', status: 'TRADE_STATUS_PAID' },
              baseResp: { statusCode: '0' },
            };
        void Promise.resolve().then(() => {
          options.success({ statusCode: 200, header: {}, data: JSON.stringify(response) });
          options.complete?.();
        });
        return { abort() {} };
      },
    );
    vi.stubGlobal('wx', { request });
    const base = {
      gatewayBaseUrl: 'https://fixture.invalid',
      accessToken: 'token',
      ownerId: '42',
      externalRef: 'host-ref',
      units: 1,
    };
    expect(await runExampleCase({ action: 'create-success', ...base })).toMatchObject({
      created: { ok: true, reference: { id: 'example-host-1' } },
    });
    expect(
      await runExampleCase({ action: 'observe-completed', ...base, resourceId: 'example-host-1' }),
    ).toMatchObject({ outcome: { end: 'completed' } });
    expect(await runExampleCase({ action: 'normal', ...base })).toMatchObject({
      created: { ok: true },
      outcome: { end: 'completed' },
    });
    expect(await runExampleCase({ action: 'normal', ...base, ownerId: '' })).toMatchObject({
      created: { ok: false, error: { category: 'invalid_input' } },
    });
    expect(requests.map((url) => (url.endsWith('/create') ? 'create' : 'query'))).toEqual([
      'create',
      'query',
      'create',
      'query',
    ]);
  });
  // template-example:end

  // I-1：weapp 矩阵的 decoded-default 证据必须比较真实解码值。旧口径对两边都调用
  // `codec.toJSON`，它会省略缺省值，于是"缺省值是 ''"这类断言两边都取到 undefined、恒真。
  it('keeps proto defaults in the decoded projection used by matrix evidence', () => {
    expect(
      decodedProjection({ tradeNo: '', orderNos: [], status: 0, baseResp: undefined }),
    ).toEqual({ tradeNo: '', orderNos: [], status: 0 });
    // 反例：解码把缺省值解成 undefined 时，投影结果与默认消息的投影不再相等，缺省类检查判失败。
    expect(decodedProjection({ tradeNo: undefined, orderNos: [], status: 0 })).not.toEqual(
      decodedProjection({ tradeNo: '', orderNos: [], status: 0 }),
    );
    // 自动化通道只传 JSON：int64 的 bigint 转成十进制字符串，投影里不残留 bigint。
    expect(decodedProjection({ amount: 0n, nested: { total: 12n } })).toEqual({
      amount: '0',
      nested: { total: '12' },
    });
  });

  it('returns decoded results without nested bigint values', async () => {
    const request = vi.fn((options: { success(value: unknown): void; complete?(): void }) => {
      void Promise.resolve().then(() => {
        options.success({
          statusCode: 200,
          header: {},
          data: JSON.stringify({ baseResp: { statusCode: '0', serverTimeMs: '1' } }),
        });
        options.complete?.();
      });
      return { abort() {} };
    });
    vi.stubGlobal('wx', { request });

    const result = await runProtocolSuite({
      gatewayBaseUrl: 'https://fixture.invalid',
      accessToken: 'fixture-token',
      requestContext: { productId: 'product-projection' },
      timeoutMs: 100,
      methods: [
        {
          name: 'CreateTrade',
          request: { bizType: 'projection' },
          samples: [{ request: { bizType: 'projection' }, context: { productId: 'projection' } }],
        },
      ],
    });
    const containsBigint = (value: unknown): boolean =>
      typeof value === 'bigint' ||
      Boolean(value && typeof value === 'object' && Object.values(value).some(containsBigint));

    expect(containsBigint(result)).toBe(false);
  });
});
