import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-001', caseId: 'public-client', fixtureCase: 'public-client', environment: 'integration', covers: [
  { id: 'TC-PAYSDK-CONTRACT-001', caseKey: 'public-client', checks: ['public-assembly', 'substitute-evidence-boundary'] },
] }, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as { tradeNo: string; marker: string };
  const platform = installPublicClientPlatform({ http: [
    { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo, fixture.marker) },
    { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) },
  ] }); cleanup = platform.restore;
  const { pay } = createPublicHarness();
  const result = await pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  await checkpoint('public-assembly', () => expect(result).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } }));
  await checkpoint('substitute-evidence-boundary', () => {
    expect(platform.httpRecords).toHaveLength(2);
    expect(platform.channelRecords).toHaveLength(1);
  });
}, { fixtureRoot });
