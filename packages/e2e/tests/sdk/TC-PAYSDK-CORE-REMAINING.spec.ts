import { afterEach } from 'vitest';
import type { DiagnosticEvent, PaymentOutcome } from '@daqian/payment-sdk';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicHarness, installPublicClientPlatform, successPrepare, successQuery, type HttpPlan } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type Fixture = Readonly<{ tradeNo: string; variant?: string }>;
type Definition = Readonly<{ ownerId: string; caseKey: string; checks: readonly string[] }>;
const definitions: readonly Definition[] = [
  { ownerId: 'TC-PAYSDK-CORE-001', caseKey: 'runtime-assembly', checks: ['production-runtime-assembly'] },
  { ownerId: 'TC-PAYSDK-CORE-008', caseKey: 'invalid-param-log', checks: ['diagnostic-allowlist','sensitive-data-absent'] },
  { ownerId: 'TC-PAYSDK-CORE-008', caseKey: 'network-failure-log', checks: ['diagnostic-allowlist','sensitive-data-absent'] },
];

const request = (tradeNo: string) => ({ reference: { tradeNo }, method: 'wechat-miniapp-virtual-goods' as const });

for (const definition of definitions) defineCase({
  ownerId: definition.ownerId, caseId: definition.caseKey, fixtureCase: definition.caseKey, environment: 'integration',
  covers: [{ id: definition.ownerId, caseKey: definition.caseKey, checks: definition.checks }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as Fixture;
  const key = definition.caseKey;
  const diagnostics: DiagnosticEvent[] = [];
  const providerCase = key.startsWith('provider-') || key === 'late-provider-result';
  let releaseProvider: (() => void) | undefined;
  const provider = providerCase ? () => new Promise<string>(resolve => { releaseProvider = () => resolve('fixture-token'); setTimeout(() => resolve('fixture-token'), key === 'provider-partial-budget' ? 5 : 30); }) : undefined;
  const http: HttpPlan[] = key === 'network-failure-log' ? [{ path: '/api/base/trade/pay', failure: true }]
    : [{ path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo) }, { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) }];
  const channel = ['duplicate-pay','duplicate-channel-callback'].includes(key) ? ['pending' as const] : ['success' as const];
  const platform = installPublicClientPlatform({ http, channel }); cleanup = platform.restore;
  const requestTimeoutMs = key === 'provider-partial-budget' ? 1000 : providerCase ? 10 : 100;
  const harness = createPublicHarness({ ...(provider ? { getAccessToken: provider } : {}), policy: { requestTimeoutMs, observation: { intervalMs: 1, maxWaitMs: 100 } }, onDiagnostic: event => diagnostics.push(event) });
  const outcomes: PaymentOutcome[] = [];

  if (key === 'invalid-param-log') {
    const outcome = await harness.client.pay({ ...request(fixture.tradeNo), xpayEnv: 'secret-invalid' as never }); outcomes.push(outcome);
  } else if (key === 'duplicate-pay') {
    const first = harness.client.pay(request(fixture.tradeNo)); while (!platform.pendingChannels.length) await new Promise(resolve => setTimeout(resolve, 0));
    outcomes.push(await harness.client.pay(request(fixture.tradeNo))); platform.pendingChannels[0]!.success(); outcomes.push(await first);
  } else if (key === 'duplicate-channel-callback') {
    const pending = harness.client.pay(request(fixture.tradeNo)); while (!platform.pendingChannels.length) await new Promise(resolve => setTimeout(resolve, 0));
    platform.pendingChannels[0]!.success(); platform.pendingChannels[0]!.success(); outcomes.push(await pending);
  } else {
    outcomes.push(await harness.client.pay(request(fixture.tradeNo)));
    if (providerCase && key !== 'provider-partial-budget') { releaseProvider?.(); await new Promise(resolve => setTimeout(resolve, 35)); }
  }

  for (const check of definition.checks) await checkpoint(check, () => {
    const outcome = outcomes[0]!;
    if (key === 'runtime-assembly') expect(outcome).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } });
    else if (key === 'duplicate-pay') { expect(outcomes[0]).toMatchObject({ reason: 'busy' }); expect(outcomes[1]).toMatchObject({ reason: 'confirmed' }); expect(platform.channelRecords).toHaveLength(1); }
    else if (key === 'duplicate-channel-callback') { expect(outcome.reason).toBe('confirmed'); expect(platform.httpRecords.filter(record => record.path.endsWith('/query'))).toHaveLength(1); }
    else if (key.includes('network')) { expect(outcome.reason).toBe('error'); expect(platform.httpRecords).toHaveLength(1); expect(platform.channelRecords).toHaveLength(0); }
    else if (providerCase) {
      if (key === 'provider-partial-budget') { expect(outcome.reason).toBe('confirmed'); expect(platform.httpRecords[0]!.timeout).toBeLessThan(requestTimeoutMs); }
      else { expect(outcome).toMatchObject({ reason: 'timed_out', channelSignal: 'not_invoked' }); expect(platform.httpRecords).toHaveLength(0); }
    }
    else if (key === 'invalid-param-log' || key === 'network-failure-log') expect(JSON.stringify(diagnostics)).not.toMatch(/secret|fixture-token|tradeNo|signData/i);
    else expect(outcome.reason).toBe('confirmed');
    if (definition.ownerId === 'TC-PAYSDK-CORE-008') { expect(diagnostics.every(event => Object.keys(event).every(field => ['attemptId','phase','code','originalCode'].includes(field)))).toBe(true); }
  });
}, { fixtureRoot });
