import { afterEach } from 'vitest';
import { paymentBusinessErrors } from '@daqian/payment-protocol';
import type { DiagnosticEvent, PaymentOutcome } from '@daqian/payment-sdk';
import { defineCase } from '../../src/cases/define-case.ts';
import { createCancellation, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery, type HttpPlan } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type Fixture = Readonly<{ tradeNo: string; variant?: string }>;
type Definition = Readonly<{ ownerId: string; caseKey: string; checks: readonly string[] }>;
const definitions: readonly Definition[] = [
  { ownerId: 'TC-PAYSDK-CORE-001', caseKey: 'runtime-assembly', checks: ['production-runtime-assembly'] },
  ...['missing-mode','missing-pay-sig','missing-signature','invalid-oneof','multiple-oneof'].map(caseKey => ({ ownerId: 'TC-PAYSDK-CORE-004', caseKey, checks: ['invalid-params-rejected','no-channel-or-resign'] })),
  { ownerId: 'TC-PAYSDK-CORE-005', caseKey: 'expired-during-channel-wait', checks: ['channel-wait-unbounded','query-after-callback','wait-not-failure'] },
  { ownerId: 'TC-PAYSDK-CORE-007', caseKey: 'duplicate-pay', checks: ['single-invocation','one-outcome-per-run'] },
  { ownerId: 'TC-PAYSDK-CORE-007', caseKey: 'duplicate-channel-callback', checks: ['single-invocation','one-outcome-per-run','server-idempotency-boundary'] },
  { ownerId: 'TC-PAYSDK-CORE-008', caseKey: 'invalid-param-log', checks: ['diagnostic-allowlist','sensitive-data-absent'] },
  { ownerId: 'TC-PAYSDK-CORE-008', caseKey: 'network-failure-log', checks: ['diagnostic-allowlist','sensitive-data-absent'] },
  { ownerId: 'TC-PAYSDK-CORE-011', caseKey: 'prepare-retryable-error', checks: ['single-prepare','no-implicit-recovery'] },
  { ownerId: 'TC-PAYSDK-CORE-011', caseKey: 'prepare-network-interruption', checks: ['single-prepare','no-implicit-recovery'] },
  { ownerId: 'TC-PAYSDK-CORE-012', caseKey: 'provider-partial-budget', checks: ['remaining-budget'] },
  { ownerId: 'TC-PAYSDK-CORE-012', caseKey: 'provider-exhausts-budget', checks: ['no-send-after-exhaustion'] },
  { ownerId: 'TC-PAYSDK-CORE-012', caseKey: 'late-provider-result', checks: ['no-send-after-exhaustion','late-provider-isolated'] },
  { ownerId: 'TC-PAYSDK-CORE-013', caseKey: 'no-callback-no-stop', checks: ['active-until-explicit-stop'] },
  { ownerId: 'TC-PAYSDK-CORE-013', caseKey: 'stop-callback-race', checks: ['stop-once-and-clean','preinvoke-stop','old-callback-isolated'] },
  { ownerId: 'TC-PAYSDK-CORE-018', caseKey: 'channel-unknown', checks: ['phase-order','phase-branching','phase-dedup-and-optionality'] },
  { ownerId: 'TC-PAYSDK-CORE-018', caseKey: 'channel-session-expired', checks: ['phase-branching'] },
  { ownerId: 'TC-PAYSDK-CORE-018', caseKey: 'prepare-failed', checks: ['phase-branching'] },
  { ownerId: 'TC-PAYSDK-CORE-018', caseKey: 'preinvoke-validation-failed', checks: ['phase-branching'] },
  { ownerId: 'TC-PAYSDK-CORE-019', caseKey: 'handler-thenable-reject', checks: ['observer-errors-isolated','attempt-isolation'] },
  { ownerId: 'TC-PAYSDK-CORE-019', caseKey: 'late-handler-reject', checks: ['observer-errors-isolated','attempt-isolation'] },
  { ownerId: 'TC-PAYSDK-CORE-019', caseKey: 'no-callback-host-stop', checks: ['no-callback-needs-host-stop','attempt-isolation'] },
];

function invalidPrepare(tradeNo: string, variant: string) {
  const response = successPrepare(tradeNo) as Record<string, unknown>;
  const payParams = (response.payParams as Record<string, unknown>);
  const virtual = { ...(payParams.wechatVirtual as Record<string, unknown>) };
  if (variant === 'missing-mode') delete virtual.mode;
  if (variant === 'missing-pay-sig') delete virtual.paySig;
  if (variant === 'missing-signature') delete virtual.signature;
  if (variant === 'invalid-oneof') return { ...response, payParams: { wechatVirtual: 'legacy' } };
  if (variant === 'multiple-oneof') return { ...response, payParams: { wechatVirtual: virtual, wechatNative: { codeUrl: 'fixture' } } };
  return { ...response, payParams: { wechatVirtual: virtual } };
}
function businessError(code: bigint, retryable = false) { return { baseResp: { statusCode: code.toString(), success: false, statusMsg: 'fixture', error: { bizCode: code.toString(), canonicalCode: 'CANONICAL_ERROR_CODE_UNAVAILABLE', retryable } } }; }
const request = (tradeNo: string) => ({ reference: { tradeNo }, method: 'wechat-miniapp-virtual-goods' as const });

for (const definition of definitions) defineCase({
  ownerId: definition.ownerId, caseId: definition.caseKey, fixtureCase: definition.caseKey, environment: 'integration',
  covers: [{ id: definition.ownerId, caseKey: definition.caseKey, checks: definition.checks }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as Fixture;
  const key = definition.caseKey;
  const diagnostics: DiagnosticEvent[] = [];
  const invalid = key.startsWith('missing-') || key === 'invalid-oneof' || key === 'multiple-oneof' || key === 'preinvoke-validation-failed';
  const providerCase = key.startsWith('provider-') || key === 'late-provider-result';
  let releaseProvider: (() => void) | undefined;
  const provider = providerCase ? () => new Promise<string>(resolve => { releaseProvider = () => resolve('fixture-token'); setTimeout(() => resolve('fixture-token'), key === 'provider-partial-budget' ? 5 : 30); }) : undefined;
  const http: HttpPlan[] = key === 'stop-callback-race' ? [
    { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, 'stop-first') },
    { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, 'callback-first') },
    { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) },
  ] : invalid ? [{ path: '/api/base/trade/pay', body: invalidPrepare(fixture.tradeNo, key === 'preinvoke-validation-failed' ? 'missing-mode' : key) }]
    : key === 'network-failure-log' || key === 'prepare-network-interruption' ? [{ path: '/api/base/trade/pay', failure: true }]
      : key === 'prepare-retryable-error' || key === 'prepare-failed' ? [{ path: '/api/base/trade/pay', body: businessError(paymentBusinessErrors.ErrInfraTradeCreateTradePayUnavailable.statusCode, true) }]
        : key === 'channel-session-expired' ? [{ path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo) }]
          : [{ path: '/api/base/trade/pay', body: { ...successPrepare(fixture.tradeNo), ...(key === 'expired-during-channel-wait' ? { expireTime: '1' } : {}) } }, { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) }];
  const channel = key === 'channel-unknown' ? ['unknown' as const]
    : key === 'channel-session-expired' ? ['session' as const]
      : ['duplicate-pay','duplicate-channel-callback','expired-during-channel-wait','no-callback-no-stop','no-callback-host-stop'].includes(key) ? ['pending' as const]
        : key === 'stop-callback-race' ? ['pending' as const, 'pending' as const] : ['success' as const];
  const platform = installPublicClientPlatform({ http, channel }); cleanup = platform.restore;
  const requestTimeoutMs = key === 'provider-partial-budget' ? 1000 : providerCase ? 10 : 100;
  const harness = createPublicHarness({ ...(provider ? { getAccessToken: provider } : {}), policy: { requestTimeoutMs, observation: { intervalMs: 1, maxWaitMs: 100 } }, onDiagnostic: event => diagnostics.push(event) });
  const outcomes: PaymentOutcome[] = [];
  let deliveries = 0;

  if (key === 'invalid-param-log') {
    const outcome = await harness.client.pay({ ...request(fixture.tradeNo), xpayEnv: 'secret-invalid' as never }); outcomes.push(outcome);
  } else if (key === 'duplicate-pay') {
    const first = harness.client.pay(request(fixture.tradeNo)); while (!platform.pendingChannels.length) await new Promise(resolve => setTimeout(resolve, 0));
    outcomes.push(await harness.client.pay(request(fixture.tradeNo))); platform.pendingChannels[0]!.success(); outcomes.push(await first);
  } else if (key === 'duplicate-channel-callback') {
    const pending = harness.client.pay(request(fixture.tradeNo)); while (!platform.pendingChannels.length) await new Promise(resolve => setTimeout(resolve, 0));
    platform.pendingChannels[0]!.success(); platform.pendingChannels[0]!.success(); outcomes.push(await pending);
  } else if (key === 'stop-callback-race') {
    const preinvoke = createCancellation(); preinvoke.stop(); outcomes.push(await harness.client.pay(request(fixture.tradeNo), { cancellation: preinvoke.cancellation }));
    const stopFirst = createCancellation(); const stopped = harness.client.pay(request(fixture.tradeNo), { cancellation: stopFirst.cancellation }); while (platform.pendingChannels.length < 1) await new Promise(resolve => setTimeout(resolve, 0)); stopFirst.stop(); platform.pendingChannels[0]!.success(); outcomes.push(await stopped);
    const callbackFirst = createCancellation(); const completed = harness.client.pay(request(fixture.tradeNo), { cancellation: callbackFirst.cancellation }); while (platform.pendingChannels.length < 2) await new Promise(resolve => setTimeout(resolve, 0)); platform.pendingChannels[1]!.success(); await new Promise(resolve => setTimeout(resolve, 0)); callbackFirst.stop(); outcomes.push(await completed);
  } else if (['expired-during-channel-wait','no-callback-no-stop','no-callback-host-stop'].includes(key)) {
    const host = createCancellation(); const pending = harness.client.pay(request(fixture.tradeNo), { cancellation: host.cancellation }); void pending.then(() => { deliveries += 1; });
    while (!platform.pendingChannels.length) await new Promise(resolve => setTimeout(resolve, 0));
    if (key === 'expired-during-channel-wait') { await new Promise(resolve => setTimeout(resolve, 5)); platform.pendingChannels[0]!.success(); }
    else { await new Promise(resolve => setTimeout(resolve, 2)); expect(deliveries).toBe(0); host.stop(); platform.pendingChannels[0]!.success(); }
    outcomes.push(await pending);
  } else {
    outcomes.push(await harness.client.pay(request(fixture.tradeNo), key === 'handler-thenable-reject' ? { onPhase: () => ({ then: (_: unknown, reject: (reason: unknown) => void) => reject(new Error('secret')) }) as never }
      : key === 'late-handler-reject' ? { onPhase: () => new Promise((_, reject) => setTimeout(() => reject(new Error('secret')), 10)) } : undefined));
    if (providerCase && key !== 'provider-partial-budget') { releaseProvider?.(); await new Promise(resolve => setTimeout(resolve, 35)); }
  }

  for (const check of definition.checks) await checkpoint(check, () => {
    const outcome = outcomes[0]!;
    if (invalid) { expect(outcome).toMatchObject({ reason: 'error', channelSignal: 'not_invoked', error: { code: 'PROTOCOL_ERROR' } }); expect(platform.channelRecords).toHaveLength(0); }
    else if (key === 'runtime-assembly') expect(outcome).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } });
    else if (key === 'duplicate-pay') { expect(outcomes[0]).toMatchObject({ reason: 'busy' }); expect(outcomes[1]).toMatchObject({ reason: 'confirmed' }); expect(platform.channelRecords).toHaveLength(1); }
    else if (key === 'duplicate-channel-callback') { expect(outcome.reason).toBe('confirmed'); expect(platform.httpRecords.filter(record => record.path.endsWith('/query'))).toHaveLength(1); }
    else if (key.includes('network') || key === 'prepare-retryable-error' || key === 'prepare-failed') { expect(outcome.reason).toBe('error'); expect(platform.httpRecords).toHaveLength(1); expect(platform.channelRecords).toHaveLength(0); }
    else if (providerCase) {
      if (key === 'provider-partial-budget') { expect(outcome.reason).toBe('confirmed'); expect(platform.httpRecords[0]!.timeout).toBeLessThan(requestTimeoutMs); }
      else { expect(outcome).toMatchObject({ reason: 'timed_out', channelSignal: 'not_invoked' }); expect(platform.httpRecords).toHaveLength(0); }
    } else if (key === 'expired-during-channel-wait') { expect(outcome.reason).toBe('confirmed'); expect(platform.httpRecords.filter(record => record.path.endsWith('/query'))).toHaveLength(1); }
    else if (key === 'stop-callback-race') { expect(outcomes[0]).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked' }); expect(outcomes[1]).toMatchObject({ reason: 'stopped', channelSignal: 'unknown' }); expect(outcomes[2]).toMatchObject({ reason: 'confirmed', channelSignal: 'success_hint', snapshot: { state: 'PAID' } }); expect(platform.channelRecords).toHaveLength(2); expect(platform.httpRecords.filter(record => record.path.endsWith('/pay'))).toHaveLength(2); expect(platform.httpRecords.filter(record => record.path.endsWith('/query'))).toHaveLength(1); }
    else if (['no-callback-no-stop','no-callback-host-stop'].includes(key)) { expect(outcome).toMatchObject({ reason: 'stopped', channelSignal: 'unknown' }); expect(deliveries).toBe(1); expect(platform.httpRecords.filter(record => record.path.endsWith('/query'))).toHaveLength(0); }
    else if (key === 'channel-unknown') expect(outcome).toMatchObject({ reason: 'confirmed', channelSignal: 'unknown', snapshot: { state: 'PAID' } });
    else if (key === 'channel-session-expired') expect(outcome).toMatchObject({ reason: 'channel_session_required', interruptedPhase: 'invoke', channelSignal: 'launch_failed' });
    else if (key === 'invalid-param-log' || key === 'network-failure-log') expect(JSON.stringify(diagnostics)).not.toMatch(/secret|fixture-token|tradeNo|signData/i);
    else expect(outcome.reason).toBe('confirmed');
    if (definition.ownerId === 'TC-PAYSDK-CORE-008') { expect(diagnostics.every(event => Object.keys(event).every(field => ['attemptId','phase','code','originalCode'].includes(field)))).toBe(true); }
  });
}, { fixtureRoot });
