import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from '../sdk/public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type Fixture = Readonly<{ tradeNo: string; marker: string; queryStates: string[] }>;

defineCase({ ownerId: 'FLOW-PAYSDK-001', caseId: 'normal', fixtureCase: 'normal', environment: 'integration',
  flowId: 'FLOW-PAYSDK-001', flowCase: 'normal',
  covers: [
    { id: 'TC-PAYSDK-CONTRACT-001', caseKey: 'public-client', checks: ['public-assembly', 'substitute-evidence-boundary'] },
    { id: 'TC-PAYSDK-CONTRACT-002', caseKey: 'existing-trade-pay', checks: ['existing-trade-only', 'prepare-response-validation', 'no-client-order-or-signing'] },
    { id: 'TC-PAYSDK-CONTRACT-003', caseKey: 'success-hint-paying', checks: ['server-state-authoritative', 'no-paid-or-entitlement-inference'] },
    { id: 'TC-PAYSDK-CONTRACT-008', caseKey: 'paid-without-entitlement', checks: ['paid-without-entitlement', 'fulfillment-owned-by-consumer'] },
    { id: 'TC-PAYSDK-CONTRACT-011', caseKey: 'sdk-network-request', checks: ['sdk-owned-network', 'request-contract'] },
    { id: 'TC-PAYSDK-CONTRACT-018', caseKey: 'request-field-mapping', checks: ['public-field-mapping', 'server-identity-boundary'] },
  ],
}, async ({ fixture: value, checkpoint, flow, expect }) => {
  const fixture = value as Fixture;
  const eventLog = createPublicClientEventLog();
  const platform = installPublicClientPlatform({
    http: [{ path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, fixture.marker) },
      ...fixture.queryStates.map(status => ({ path: '/api/base/trade/query' as const, body: successQuery(fixture.tradeNo, status) }))],
    channel: ['success'],
    eventLog,
  }); cleanup = platform.restore;
  const { pay, phases } = createPublicHarness({ policy: { requestTimeoutMs: 100, observation: { intervalMs: 1, maxWaitMs: 100 } } }, eventLog);
  let deliveries = 0;
  const pending = pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  void pending.then(() => { deliveries += 1; });
  const outcome = await pending;
  await flow(outcome.attemptId, ['createPaymentClient', 'pay', 'CreateTradePay', '渠道', 'QueryTrade(PAYING', 'PAID)', '一次最终结果；交易引用、签名原文、先后顺序、次数贯通，初始化及渠道回调前无多余请求']);
  const prepare = platform.httpRecords[0]!;
  const queryRecords = platform.httpRecords.slice(1);
  const channel = platform.channelRecords[0]!;
  const kinds = eventLog.events.map(event => event.kind === 'phase' ? `phase:${event.phase}`
    : event.kind === 'http-request' ? `request:${event.path}`
      : event.kind === 'http-response' ? `response:${event.path}`
        : event.kind === 'channel-callback' ? `callback:${event.callback}` : event.kind);
  expect(kinds).toEqual([
    'request:/api/base/trade/pay', 'response:/api/base/trade/pay', 'phase:channel_invoking', 'channel-invoke', 'callback:success',
    'phase:confirming', 'request:/api/base/trade/query', 'response:/api/base/trade/query',
    'request:/api/base/trade/query', 'response:/api/base/trade/query', 'terminal',
  ]);
  expect(channel).toEqual({ mode: 'short_series_goods', signData: ` {"marker":"${fixture.marker}"} `, paySig: `sig-${fixture.marker}`, signature: `signature-${fixture.marker}` });
  expect(prepare.body).toMatchObject({ tradeNo: fixture.tradeNo, appId: 'app-fixture', channel: 'CHANNEL_WECHAT_VIRTUAL', clientPlatform: 'ios' });
  expect(queryRecords).toHaveLength(2);
  expect(queryRecords.every(record => record.body.tradeNo === fixture.tradeNo && !Object.prototype.hasOwnProperty.call(record.body, 'xpayEnv'))).toBe(true);
  const queryStates = eventLog.events.filter(event => event.kind === 'http-response' && event.path?.endsWith('/query'))
    .map(event => ((event.body?.trade as Record<string, unknown>).status));
  expect(queryStates).toEqual(['TRADE_STATUS_PAYING', 'TRADE_STATUS_PAID']);
  expect(phases.map(event => event.phase)).toEqual(['channel_invoking', 'confirming']);
  expect(new Set(phases.map(event => event.attemptId))).toEqual(new Set([outcome.attemptId]));
  expect(eventLog.events.filter(event => event.kind === 'terminal')).toHaveLength(1);
  await checkpoint('public-assembly', () => expect(outcome.reason).toBe('confirmed'));
  await checkpoint('substitute-evidence-boundary', () => expect(platform.channelRecords).toHaveLength(1));
  await checkpoint('public-continuity', () => expect(outcome).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' }, channelSignal: 'success_hint' }));
  await checkpoint('request-response-correlation', () => {
    expect(platform.httpRecords.every(record => record.body.tradeNo === fixture.tradeNo)).toBe(true);
    expect(channel.signData).toBe(` {"marker":"${fixture.marker}"} `);
  });
  await checkpoint('effect-order-and-counts', () => {
    expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay', '/api/base/trade/query', '/api/base/trade/query']);
    expect(phases.map(event => event.phase)).toEqual(['channel_invoking', 'confirming']);
  });
  await checkpoint('single-terminal-outcome', () => expect(deliveries).toBe(1));
  await checkpoint('sign-data-unchanged', () => expect(channel.signData).toBe(` {"marker":"${fixture.marker}"} `));
  await checkpoint('existing-trade-only', () => expect(prepare.body.tradeNo).toBe(fixture.tradeNo));
  await checkpoint('prepare-response-validation', () => expect(outcome.paymentNo).toBe(`payment-${fixture.marker}`));
  await checkpoint('no-client-order-or-signing', () => expect(Object.keys(channel).sort()).toEqual(['mode', 'paySig', 'signData', 'signature']));
  await checkpoint('server-state-authoritative', () => expect(queryStates).toEqual(['TRADE_STATUS_PAYING', 'TRADE_STATUS_PAID']));
  await checkpoint('no-paid-or-entitlement-inference', () => expect(outcome.snapshot.state).toBe('PAID'));
  await checkpoint('paid-without-entitlement', () => expect(outcome).not.toHaveProperty('entitlement'));
  await checkpoint('fulfillment-owned-by-consumer', () => expect(outcome.snapshot.source).toBe('server'));
  await checkpoint('sdk-owned-network', () => expect(platform.httpRecords).toHaveLength(3));
  await checkpoint('request-contract', () => expect(prepare.headers).toMatchObject({ Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' }));
  await checkpoint('public-field-mapping', () => expect(prepare.body).toMatchObject({ tradeNo: fixture.tradeNo, appId: 'app-fixture', channel: 'CHANNEL_WECHAT_VIRTUAL' }));
  await checkpoint('server-identity-boundary', () => { expect(prepare.body).not.toHaveProperty('openId'); expect(prepare.body).not.toHaveProperty('userId'); });
}, { fixtureRoot });
