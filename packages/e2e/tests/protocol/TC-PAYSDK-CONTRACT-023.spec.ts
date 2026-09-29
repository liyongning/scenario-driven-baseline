import { afterEach } from 'vitest';
import { createProtocolClient } from '@daqian/payment-protocol';
import {
  CreateTradePay, CreateTradePayRequest, CreateTradePayResponse,
  QueryTrade, QueryTradeRequest, QueryTradeResponse,
} from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { createShadowServer, type RunningShadowServer } from '@payment-test/protocol';
import { defineCase } from '../../src/cases/define-case.ts';
import { createNodeHttpDriver } from '../../src/drivers/node.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const running = new Set<RunningShadowServer>();
type WireFixture = Readonly<{ request: Record<string, unknown>; response: Record<string, unknown> }>;

afterEach(async () => {
  await Promise.all([...running].map(server => server.close()));
  running.clear();
});

function client(url: string) {
  return createProtocolClient({
    gatewayBaseUrl: url,
    getAccessToken: () => 'fixture-token',
    http: createNodeHttpDriver(),
    requestContext: { productId: 'fixture-product' },
    runtime: { nowMs: () => 1_700_000_000_000, nextRequestId: () => 'pay-fixture-1', sleepMs: () => new Promise(() => undefined) },
  });
}

for (const caseKey of ['omitted', 'sandbox', 'prod'] as const) {
  defineCase({
    ownerId: 'TC-PAYSDK-CONTRACT-023', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
    covers: [
      { id: 'TC-PAYSDK-CONTRACT-023', caseKey, checks: ['create-presence-and-enum', 'independent-wire-oracle'] },
      { id: 'infra.trade.v1.CreateTradePay#http-route#$', caseKey: 'CreateTradePay', checks: ['independent-wire-oracle'] },
      { id: 'infra.trade.v1.CreateTradePay#request-mapping#xpay_env', caseKey, checks: ['create-presence-and-enum'] },
    ],
  }, async ({ fixture: value, checkpoint, expect }) => {
    const fixture = value as WireFixture;
    const server = await createShadowServer({ scenarios: [{ id: caseKey, routes: { CreateTradePay: { expectedRequests: [{ body: fixture.request }], steps: [{ body: fixture.response }] } } }] }).start();
    running.add(server);
    const result = await client(server.url).request(CreateTradePay.meta, CreateTradePayRequest.fromJSON(fixture.request), { deadlineAtMs: 1_700_000_001_000 });
    await checkpoint('independent-wire-oracle', () => {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.wire).toEqual(fixture.response);
        expect(result.value.data).toEqual(CreateTradePayResponse.fromJSON(fixture.response));
      }
      expect(server.verify()).toEqual([]);
      expect(server.records()).toHaveLength(1);
    });
    await checkpoint('create-presence-and-enum', () => {
      expect(Object.prototype.hasOwnProperty.call(server.records()[0]!.rawBody as object, 'xpayEnv')).toBe(caseKey !== 'omitted');
      if (caseKey !== 'omitted') expect((server.records()[0]!.rawBody as { xpayEnv: string }).xpayEnv).toBe(`XPAY_ENV_${caseKey.toUpperCase()}`);
    });
  }, { fixtureRoot });
}

defineCase({
  ownerId: 'TC-PAYSDK-CONTRACT-023', caseId: 'query-no-env', fixtureCase: 'query-no-env', environment: 'integration',
  covers: [
    { id: 'TC-PAYSDK-CONTRACT-023', caseKey: 'query-no-env', checks: ['query-absence', 'independent-wire-oracle'] },
    { id: 'infra.trade.v1.QueryTrade#http-route#$', caseKey: 'QueryTrade', checks: ['independent-wire-oracle'] },
    { id: 'infra.trade.v1.QueryTrade#request-mapping#xpay_env', caseKey: 'query-no-env', checks: ['query-absence'] },
  ],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as WireFixture;
  const server = await createShadowServer({ scenarios: [{ id: 'query-no-env', routes: { QueryTrade: { expectedRequests: [{ body: fixture.request }], steps: [{ body: fixture.response }] } } }] }).start();
  running.add(server);
  const result = await client(server.url).request(QueryTrade.meta, QueryTradeRequest.fromJSON(fixture.request), { deadlineAtMs: 1_700_000_001_000 });
  await checkpoint('independent-wire-oracle', () => {
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.wire).toEqual(fixture.response);
      expect(result.value.data).toEqual(QueryTradeResponse.fromJSON(fixture.response));
    }
    expect(server.verify()).toEqual([]);
  });
  await checkpoint('query-absence', () => {
    expect(server.records()).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(server.records()[0]!.rawBody as object, 'xpayEnv')).toBe(false);
    expect(server.records()[0]!.headers).not.toHaveProperty('xpayenv');
  });
}, { fixtureRoot });
