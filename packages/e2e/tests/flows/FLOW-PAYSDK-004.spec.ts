import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from '../sdk/public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type Fixture = Readonly<{ tradeNo: string; expireTime: string; queryDelayMs?: number }>;
for (const caseKey of ['slow-query', 'expired-but-paying'] as const) defineCase({
  ownerId: 'FLOW-PAYSDK-004', caseId: caseKey, fixtureCase: caseKey, environment: 'integration', flowId: 'FLOW-PAYSDK-004', flowCase: caseKey,
  covers: caseKey === 'slow-query' ? [
    { id: 'TC-PAYSDK-CORE-006', caseKey: 'slow-query', checks: ['no-overlap', 'single-timeout-result'] },
    { id: 'TC-PAYSDK-CORE-006', caseKey: 'late-query-after-timeout', checks: ['single-timeout-result', 'late-result-isolated'] },
  ] : [{ id: 'TC-PAYSDK-CONTRACT-004', caseKey: 'expired-but-paying', checks: ['expiry-not-terminal', 'continue-with-budget', 'later-paid-accepted'] }],
}, async ({ fixture: value, checkpoint, flow, expect }) => {
  const fixture = value as Fixture;
  const prepare = { ...successPrepare(fixture.tradeNo), expireTime: fixture.expireTime };
  const events = createPublicClientEventLog();
  const platform = installPublicClientPlatform({ http: [
    { path: '/api/base/trade/pay', body: prepare },
    { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo, 'TRADE_STATUS_PAYING'), ...(fixture.queryDelayMs ? { delayMs: fixture.queryDelayMs } : {}) },
    ...(caseKey === 'slow-query' ? Array.from({ length: 4 }, () => ({ path: '/api/base/trade/query' as const, body: successQuery(fixture.tradeNo, 'TRADE_STATUS_PAYING'), delayMs: fixture.queryDelayMs! })) : []),
    ...(caseKey === 'expired-but-paying' ? [{ path: '/api/base/trade/query' as const, body: successQuery(fixture.tradeNo) }] : []),
  ], channel: ['unknown'], eventLog: events });
  cleanup = platform.restore;
  const outcome = await createPublicHarness({ policy: { requestTimeoutMs: 50, observation: { intervalMs: 1, maxWaitMs: caseKey === 'slow-query' ? 12 : 50 } } }, events)
    .pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  const phases = events.events.filter(event => event.kind === 'phase');
  expect(phases.map(event => event.phase)).toEqual(['channel_invoking', 'confirming']);
  expect(phases.map(event => event.attemptId)).toEqual([outcome.attemptId, outcome.attemptId]);
  expect(events.events.filter(event => event.kind === 'terminal').map(event => event.attemptId)).toEqual([outcome.attemptId]);
  if (caseKey === 'slow-query') {
    await checkpoint('no-overlap', () => expect(platform.peakHttpInFlight()).toBe(1));
    await checkpoint('single-timeout-result', () => expect(outcome).toMatchObject({ reason: 'timed_out', snapshot: { state: 'UNKNOWN' }, channelSignal: 'unknown' }));
    await checkpoint('late-result-isolated', async () => { await new Promise(resolve => setTimeout(resolve, 25)); expect(events.events.filter(event => event.kind === 'terminal')).toHaveLength(1); });
  } else {
    await checkpoint('expiry-not-terminal', () => expect(outcome.snapshot.state).toBe('PAID'));
    await checkpoint('continue-with-budget', () => expect(platform.httpRecords.filter(record => record.path.endsWith('/query'))).toHaveLength(2));
    await checkpoint('later-paid-accepted', () => expect(outcome.reason).toBe('confirmed'));
  }
  await flow(outcome.attemptId, ['pay', '准备', '渠道 unknown', '查询仍 PAYING', '查询预算耗尽', 'timed_out；查询不重叠，迟到响应不二次交付，交易到期不合成 CLOSED']);
}, { fixtureRoot });
