import { afterEach } from 'vitest';
import { paymentBusinessErrors } from '@daqian/payment-protocol';
import type { PaymentOutcome } from '@daqian/payment-sdk';
import { defineCase } from '../../src/cases/define-case.ts';
import { createCancellation, createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from '../sdk/public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type Fixture = Readonly<{ tradeNo: string; xpayEnv: 'sandbox' | 'prod'; retryXpayEnv?: 'sandbox' | 'prod'; firstMarker?: string; secondMarker?: string }>;
const businessError = (code: bigint) => ({ baseResp: { statusCode: code.toString(), success: false, statusMsg: 'fixture', error: { bizCode: code.toString(), canonicalCode: 'CANONICAL_ERROR_CODE_UNAVAILABLE', retryable: false } } });

for (const caseKey of ['prepare-auth', 'query-auth', 'channel-session', 'channel-session-different-payment', 'native-stop-late-callback'] as const) defineCase({
  ownerId: 'FLOW-PAYSDK-006', caseId: caseKey, fixtureCase: caseKey, environment: 'integration', flowId: 'FLOW-PAYSDK-006', flowCase: caseKey,
  covers: caseKey === 'prepare-auth' ? [
    { id: 'TC-PAYSDK-CORE-011', caseKey: 'prepare-unauthorized', checks: ['single-prepare', 'no-implicit-recovery', 'prepare-interrupted', 'explicit-retry'] },
    { id: 'TC-PAYSDK-CONTRACT-005', caseKey: 'prepare-unauthorized', checks: ['unauthorized-preserved', 'prepare-interruption-once', 'explicit-pay-recovery'] },
    { id: 'TC-PAYSDK-CORE-020', caseKey: 'prepare-auth-retry-selection', checks: ['pay-recovery-selection', 'channel-signature-unchanged'] },
  ] : caseKey === 'query-auth' ? [
    { id: 'TC-PAYSDK-CONTRACT-006', caseKey: 'query-auth', checks: ['query-auth-result', 'context-preserved', 'query-only-recovery'] },
    { id: 'TC-PAYSDK-CORE-020', caseKey: 'query-recovery-no-env', checks: ['query-recovery-absence'] },
  ] : caseKey === 'native-stop-late-callback' ? [
    { id: 'TC-PAYSDK-CORE-013', caseKey: 'native-stop-late-callback', checks: ['stop-once-and-clean', 'new-pay-is-new-run', 'old-callback-isolated'] },
    { id: 'TC-PAYSDK-CORE-019', caseKey: 'old-callback-after-new-attempt', checks: ['attempt-isolation'] },
    { id: 'TC-PAYSDK-CONTRACT-010', caseKey: 'repay-after-stop', checks: ['stop-releases-local-record', 'old-callback-isolated'] },
  ] : [
    { id: 'TC-PAYSDK-CORE-020', caseKey: 'channel-session-retry-selection', checks: ['pay-recovery-selection', 'channel-signature-unchanged'] },
  ],
}, async ({ fixture: value, checkpoint, flow, expect }) => {
  const fixture = value as Fixture;
  const events = createPublicClientEventLog();
  const authPrepare = paymentBusinessErrors.ErrInfraTradeCreateTradePayUnauthorized.statusCode;
  const authQuery = paymentBusinessErrors.ErrInfraTradeQueryTradeUnauthorized.statusCode;
  const platform = installPublicClientPlatform({ eventLog: events,
    channel: caseKey === 'native-stop-late-callback' ? ['pending', 'success'] : caseKey.startsWith('channel-session') ? ['session', 'success'] : ['success'],
    http: caseKey === 'prepare-auth' ? [
      { path: '/api/base/trade/pay', body: businessError(authPrepare) },
      { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, fixture.secondMarker ?? 'retry') },
      { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) },
    ] : caseKey === 'query-auth' ? [
      { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, fixture.firstMarker ?? 'query') },
      { path: '/api/base/trade/query', body: businessError(authQuery) },
      { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) },
    ] : caseKey.startsWith('channel-session') ? [
      { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, fixture.firstMarker ?? 'first') },
      { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, fixture.secondMarker ?? 'second') },
      { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) },
    ] : [
      { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, 'old') },
      { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, 'new') },
      { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) },
    ],
  }); cleanup = platform.restore;
  let token = 'old-token';
  const harness = createPublicHarness({ getAccessToken: () => token, policy: { observation: { intervalMs: 1, maxWaitMs: 100 } } }, events);
  const request = (env = fixture.xpayEnv) => ({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' as const, xpayEnv: env });
  const outcomes: PaymentOutcome[] = [];
  if (caseKey === 'prepare-auth') {
    outcomes.push(await harness.pay(request())); token = 'new-token'; outcomes.push(await harness.pay(request(fixture.retryXpayEnv)));
    await checkpoint('single-prepare', () => expect(platform.httpRecords.slice(0, 1).map(record => record.path)).toEqual(['/api/base/trade/pay']));
    await checkpoint('no-implicit-recovery', () => expect(outcomes[0]).toMatchObject({ reason: 'auth_required', interruptedPhase: 'prepare', channelSignal: 'not_invoked' }));
    await checkpoint('prepare-interrupted', () => expect(outcomes[0]?.error?.originalCode).toBe(authPrepare.toString()));
    await checkpoint('unauthorized-preserved', () => expect(outcomes[0]?.snapshot.reference.tradeNo).toBe(fixture.tradeNo));
    await checkpoint('prepare-interruption-once', () => expect(events.events.filter(event => event.kind === 'terminal')).toHaveLength(2));
    await checkpoint('explicit-retry', () => expect(outcomes[1]).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } }));
    await checkpoint('explicit-pay-recovery', () => expect(platform.httpRecords.map(record => record.headers.Authorization)).toEqual(['Bearer old-token', 'Bearer new-token', 'Bearer new-token']));
    await checkpoint('pay-recovery-selection', () => expect(platform.httpRecords.filter(record => record.path.endsWith('/pay')).map(record => record.body.xpayEnv)).toEqual(['XPAY_ENV_SANDBOX', 'XPAY_ENV_SANDBOX']));
    await checkpoint('channel-signature-unchanged', () => expect(platform.channelRecords[0]?.signature).toBe(`signature-${fixture.secondMarker ?? 'retry'}`));
  } else if (caseKey === 'query-auth') {
    outcomes.push(await harness.pay(request())); token = 'new-token'; const recovered = await harness.client.observe({ tradeNo: fixture.tradeNo }, { onPhase: event => events.record({ kind: 'phase', attemptId: event.attemptId, phase: event.phase }) }); outcomes.push(recovered); events.record({ kind: 'terminal', attemptId: recovered.attemptId, outcome: recovered });
    await checkpoint('query-auth-result', () => expect(outcomes[0]).toMatchObject({ reason: 'auth_required', interruptedPhase: 'query', channelSignal: 'success_hint' }));
    await checkpoint('context-preserved', () => expect(outcomes[0]).toMatchObject({ paymentNo: expect.any(String), snapshot: { reference: { tradeNo: fixture.tradeNo }, state: 'UNKNOWN' } }));
    await checkpoint('query-only-recovery', () => expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay', '/api/base/trade/query', '/api/base/trade/query']));
    await checkpoint('query-recovery-absence', () => expect(platform.httpRecords.slice(1).every(record => !Object.prototype.hasOwnProperty.call(record.body, 'xpayEnv'))).toBe(true));
  } else if (caseKey.startsWith('channel-session')) {
    outcomes.push(await harness.pay(request())); outcomes.push(await harness.pay(request(fixture.retryXpayEnv)));
    await checkpoint('pay-recovery-selection', () => {
      expect(outcomes[0]).toMatchObject({ reason: 'channel_session_required', interruptedPhase: 'invoke', channelSignal: 'launch_failed' });
      expect(outcomes[1]).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } });
      expect(platform.httpRecords.filter(record => record.path.endsWith('/pay')).map(record => record.body.xpayEnv)).toEqual([`XPAY_ENV_${fixture.xpayEnv.toUpperCase()}`, `XPAY_ENV_${(fixture.retryXpayEnv ?? fixture.xpayEnv).toUpperCase()}`]);
    });
    await checkpoint('channel-signature-unchanged', () => expect(platform.channelRecords.map(record => record.signature)).toEqual([`signature-${fixture.firstMarker ?? 'first'}`, `signature-${fixture.secondMarker ?? 'second'}`]));
  } else {
    const host = createCancellation();
    const oldPending = harness.client.pay(request(), { cancellation: host.cancellation, onPhase: event => events.record({ kind: 'phase', attemptId: event.attemptId, phase: event.phase }) });
    while (platform.pendingChannels.length === 0) await new Promise(resolve => setTimeout(resolve, 0));
    host.stop(); const stopped = await oldPending; outcomes.push(stopped); events.record({ kind: 'terminal', attemptId: stopped.attemptId, outcome: stopped });
    const nextPending = harness.pay(request(fixture.retryXpayEnv));
    platform.pendingChannels[0]!.success();
    outcomes.push(await nextPending);
    await checkpoint('stop-once-and-clean', () => expect(outcomes[0]).toMatchObject({ reason: 'stopped', channelSignal: 'unknown' }));
    await checkpoint('new-pay-is-new-run', () => expect(outcomes[1]).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } }));
    await checkpoint('old-callback-isolated', () => {
      expect(outcomes[0]?.attemptId).not.toBe(outcomes[1]?.attemptId);
      expect(platform.httpRecords.filter(record => record.path.endsWith('/query'))).toHaveLength(1);
      expect(platform.httpRecords.filter(record => record.path.endsWith('/pay')).map(record => record.body.xpayEnv)).toEqual(['XPAY_ENV_SANDBOX', 'XPAY_ENV_PROD']);
    });
    await checkpoint('attempt-isolation', () => expect(outcomes.map(outcome => outcome.attemptId)).toEqual([...new Set(outcomes.map(outcome => outcome.attemptId))]));
    await checkpoint('stop-releases-local-record', () => expect(outcomes[1]?.reason).toBe('confirmed'));
  }
  expect(new Set(outcomes.map(outcome => outcome.attemptId)).size).toBe(outcomes.length);
  const phaseEvents = events.events.filter(event => event.kind === 'phase');
  const expectedPhases = caseKey === 'prepare-auth' ? [[], ['channel_invoking', 'confirming']]
    : caseKey === 'query-auth' ? [['channel_invoking', 'confirming'], ['confirming']]
      : [['channel_invoking'], ['channel_invoking', 'confirming']];
  expect(phaseEvents.map(event => event.phase)).toEqual(expectedPhases.flat());
  expect(phaseEvents.map(event => event.attemptId)).toEqual(expectedPhases.flatMap((phases, index) => phases.map(() => outcomes[index]!.attemptId)));
  expect(events.events.filter(event => event.kind === 'terminal').map(event => event.attemptId)).toEqual(outcomes.map(outcome => outcome.attemptId));
  await flow(outcomes.map(outcome => outcome.attemptId).join(','), ['身份失效', '原调用一次交付中断结果', '宿主恢复', '按阶段显式再次调用；另覆盖宿主停止后的旧回调隔离。具体调用顺序和次数见下表']);
}, { fixtureRoot });
