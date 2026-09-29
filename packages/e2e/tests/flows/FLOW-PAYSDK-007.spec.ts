import { afterEach } from 'vitest';
import type { Cancellation, PaymentClient, PaymentOutcome, PaymentPhaseEvent } from '@daqian/payment-sdk';
import { defineCase } from '../../src/cases/define-case.ts';
import { createCancellation, createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery, type PublicClientEventLog } from '../sdk/public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type CaseKey = 'first-paid' | 'first-closed' | 'observe-only' | 'stop-before-invoke' | 'stop-after-notification' | 'stop-after-platform' | 'stop-before-query' | 'handler-throw' | 'handler-reject' | 'reentrant-pay' | 'no-listener';
type Fixture = Readonly<{ tradeNo: string; state: 'TRADE_STATUS_PAID' | 'TRADE_STATUS_CLOSED' }>;
const cases: readonly CaseKey[] = ['first-paid', 'first-closed', 'observe-only', 'stop-before-invoke', 'stop-after-notification', 'stop-after-platform', 'stop-before-query', 'handler-throw', 'handler-reject', 'reentrant-pay', 'no-listener'];

function covers(caseKey: CaseKey) {
  switch (caseKey) {
    case 'first-paid': return [
      { id: 'TC-PAYSDK-CORE-018', caseKey: 'first-query-paid', checks: ['terminal-notification-order', 'phase-dedup-and-optionality'] },
      { id: 'TC-PAYSDK-CORE-018', caseKey: 'success-hint', checks: ['phase-order', 'phase-branching', 'phase-dedup-and-optionality'] },
      { id: 'TC-PAYSDK-CONTRACT-020', caseKey: 'with-listener', checks: ['public-event-shape', 'outcome-separate', 'confirming-order'] },
    ];
    case 'first-closed': return [{ id: 'TC-PAYSDK-CORE-018', caseKey: 'first-query-closed', checks: ['terminal-notification-order', 'phase-dedup-and-optionality'] }];
    case 'observe-only': return [
      { id: 'TC-PAYSDK-CORE-018', caseKey: 'observe-only', checks: ['observe-phases'] },
      { id: 'TC-PAYSDK-CONTRACT-020', caseKey: 'observe-listener', checks: ['public-event-shape', 'no-extra-phases', 'confirming-order'] },
    ];
    case 'stop-before-invoke': return [
      { id: 'TC-PAYSDK-CORE-019', caseKey: 'stop-inside-channel-invoking', checks: ['stop-inside-notification', 'attempt-isolation'] },
      { id: 'TC-PAYSDK-CORE-013', caseKey: 'stop-before-invoke', checks: ['stop-once-and-clean', 'preinvoke-stop'] },
    ];
    case 'stop-after-notification': return [{ id: 'TC-PAYSDK-CORE-019', caseKey, checks: ['stop-after-notification-before-platform', 'attempt-isolation'] }];
    case 'stop-after-platform': return [{ id: 'TC-PAYSDK-CORE-019', caseKey, checks: ['stop-after-platform', 'attempt-isolation'] }];
    case 'stop-before-query': return [{ id: 'TC-PAYSDK-CORE-019', caseKey, checks: ['stop-before-query', 'attempt-isolation'] }];
    case 'handler-throw': return [{ id: 'TC-PAYSDK-CORE-019', caseKey, checks: ['observer-errors-isolated', 'attempt-isolation'] }];
    case 'handler-reject': return [{ id: 'TC-PAYSDK-CORE-019', caseKey: 'handler-promise-reject', checks: ['observer-errors-isolated', 'attempt-isolation'] }];
    case 'reentrant-pay': return [{ id: 'TC-PAYSDK-CORE-019', caseKey, checks: ['attempt-isolation'] }];
    case 'no-listener': return [
      { id: 'TC-PAYSDK-CORE-018', caseKey, checks: ['phase-dedup-and-optionality'] },
      { id: 'TC-PAYSDK-CONTRACT-020', caseKey, checks: ['callback-optionality', 'outcome-separate'] },
    ];
  }
}

function secondCheckCancellation(): Readonly<{ cancellation: Cancellation; arm(): void }> {
  let armed = false;
  let checksAfterArm = 0;
  return { arm() { armed = true; }, cancellation: {
    isStopped() { if (!armed) return false; checksAfterArm += 1; return checksAfterArm >= 2; },
    subscribe() { return () => undefined; },
  } };
}

async function execute(client: PaymentClient, input: Readonly<{ observe: boolean; tradeNo: string; cancellation?: Cancellation; onPhase?: (event: PaymentPhaseEvent) => unknown }>, eventLog: PublicClientEventLog) {
  const options = { ...(input.cancellation ? { cancellation: input.cancellation } : {}), ...(input.onPhase ? { onPhase: input.onPhase } : {}) };
  const outcome = input.observe
    ? await client.observe({ tradeNo: input.tradeNo }, options)
    : await client.pay({ reference: { tradeNo: input.tradeNo }, method: 'wechat-miniapp-virtual-goods' }, options);
  eventLog.record({ kind: 'terminal', attemptId: outcome.attemptId, outcome });
  return outcome;
}

for (const caseKey of cases) defineCase({
  ownerId: 'FLOW-PAYSDK-007', caseId: `flow-007-${caseKey}`, fixtureCase: caseKey, environment: 'integration', flowId: 'FLOW-PAYSDK-007', flowCase: caseKey,
  covers: covers(caseKey),
}, async ({ fixture: value, checkpoint, flow, expect }) => {
  const fixture = value as Fixture;
  const eventLog = createPublicClientEventLog();
  const pendingPlatform = caseKey === 'stop-after-platform';
  const observeOnly = caseKey === 'observe-only';
  const platform = installPublicClientPlatform({ eventLog, channel: [pendingPlatform ? 'pending' : 'success'], http: [
    ...observeOnly ? [] : [{ path: '/api/base/trade/pay' as const, body: successPrepare(fixture.tradeNo) }],
    ...caseKey === 'stop-before-invoke' || caseKey === 'stop-after-notification' || caseKey === 'stop-after-platform' || caseKey === 'stop-before-query' ? [] : [{ path: '/api/base/trade/query' as const, body: successQuery(fixture.tradeNo, fixture.state) }],
  ] }); cleanup = platform.restore;
  const { client } = createPublicHarness({ policy: { observation: { intervalMs: 1, maxWaitMs: 100 } } });
  const host = createCancellation();
  const second = secondCheckCancellation();
  let nested: Promise<PaymentOutcome> | undefined;
  const observed: PaymentPhaseEvent[] = [];
  const onPhase = caseKey === 'no-listener' ? undefined : (event: PaymentPhaseEvent) => {
    observed.push(event); eventLog.record({ kind: 'phase', attemptId: event.attemptId, phase: event.phase });
    if (caseKey === 'stop-before-invoke' && event.phase === 'channel_invoking') host.stop();
    if (caseKey === 'stop-after-notification' && event.phase === 'channel_invoking') second.arm();
    if (caseKey === 'stop-before-query' && event.phase === 'confirming') host.stop();
    if (caseKey === 'handler-throw') throw new Error('fixture-handler-secret');
    if (caseKey === 'handler-reject') return Promise.reject(new Error('fixture-handler-secret'));
    if (caseKey === 'reentrant-pay' && event.phase === 'channel_invoking') nested = client.pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  };
  const cancellation = caseKey === 'stop-after-notification' ? second.cancellation
    : ['stop-before-invoke', 'stop-after-platform', 'stop-before-query'].includes(caseKey) ? host.cancellation : undefined;
  const pending = execute(client, { observe: observeOnly, tradeNo: fixture.tradeNo, ...(cancellation ? { cancellation } : {}), ...(onPhase ? { onPhase } : {}) }, eventLog);
  if (pendingPlatform) {
    while (platform.pendingChannels.length === 0) await new Promise(resolve => setTimeout(resolve, 0));
    host.stop();
  }
  const outcome = await pending;
  if (pendingPlatform) platform.pendingChannels[0]!.success();
  const phases = observed.map(event => event.phase);
  const expectedReason = caseKey.startsWith('stop-') ? 'stopped' : 'confirmed';
  const expectedSignal = observeOnly || caseKey === 'stop-before-invoke' || caseKey === 'stop-after-notification' ? 'not_invoked'
    : pendingPlatform ? 'unknown' : 'success_hint';
  expect(outcome).toMatchObject({ reason: expectedReason, channelSignal: expectedSignal });
  expect(eventLog.events.filter(event => event.kind === 'terminal')).toHaveLength(1);
  expect(observed.every(event => event.attemptId === outcome.attemptId)).toBe(true);

  for (const cover of covers(caseKey)) for (const check of cover.checks) await checkpoint(check, async () => {
    if (caseKey === 'first-paid' || caseKey === 'first-closed') {
      expect(phases).toEqual(['channel_invoking', 'confirming']);
      expect(outcome.snapshot.state).toBe(caseKey === 'first-paid' ? 'PAID' : 'CLOSED');
      expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay', '/api/base/trade/query']);
    } else if (observeOnly) {
      expect(phases).toEqual(['confirming']); expect(platform.channelRecords).toHaveLength(0); expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/query']);
    } else if (caseKey === 'stop-before-invoke' || caseKey === 'stop-after-notification') {
      expect(platform.channelRecords).toHaveLength(0); expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay']);
    } else if (pendingPlatform) {
      expect(platform.channelRecords).toHaveLength(1); expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay']);
    } else if (caseKey === 'stop-before-query') {
      expect(phases).toEqual(['channel_invoking', 'confirming']); expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay']);
    } else if (caseKey === 'reentrant-pay') {
      expect(await nested).toMatchObject({ reason: 'busy', channelSignal: 'not_invoked' }); expect(platform.channelRecords).toHaveLength(1);
    } else if (caseKey === 'no-listener') {
      expect(phases).toEqual([]); expect(outcome.snapshot.state).toBe('PAID');
    } else {
      expect(phases).toEqual(['channel_invoking', 'confirming']); expect(outcome.snapshot.state).toBe('PAID'); expect(platform.channelRecords).toHaveLength(1);
    }
  });
  await flow(outcome.attemptId, ['公共 pay/observe', '本次阶段通知', '外部渠道/HTTP', '一次最终结果；验证通知前后副作用、数据关联、回调异常与停止重入']);
}, { fixtureRoot });
