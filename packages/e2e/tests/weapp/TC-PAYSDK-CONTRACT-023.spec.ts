import automator from 'miniprogram-automator';
import { afterEach } from 'vitest';
import { createShadowServer, type RunningShadowServer } from '@payment-test/protocol';
import {
  CreateTradePayResponse,
  QueryTradeResponse,
} from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { defineCase } from '../../src/cases/define-case.ts';
import { protocolResultIssues } from '../../src/cases/protocol-result.ts';
import { runWeappFunction } from '../../src/drivers/weapp.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const projectPath = new URL('../../host/weapp', import.meta.url).pathname;
const cliPath = process.env.WECHAT_DEVTOOLS_CLI_PATH ?? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const running = new Set<RunningShadowServer>();
type WireFixture = Readonly<{ request: Record<string, unknown>; response: Record<string, unknown> }>;

afterEach(async () => {
  await Promise.all([...running].map(server => server.close()));
  running.clear();
});

for (const caseKey of ['omitted', 'sandbox', 'prod', 'query-no-env'] as const) {
  const query = caseKey === 'query-no-env';
  const method = query ? 'QueryTrade' : 'CreateTradePay';
  const checks = query ? ['query-absence', 'independent-wire-oracle'] : ['create-presence-and-enum', 'independent-wire-oracle'];
  defineCase({
    ownerId: 'TC-PAYSDK-CONTRACT-023', caseId: caseKey, fixtureCase: caseKey, environment: 'weapp',
    covers: [
      { id: 'TC-PAYSDK-CONTRACT-023', caseKey, checks },
      { id: query ? 'infra.trade.v1.QueryTrade#http-route#$' : 'infra.trade.v1.CreateTradePay#http-route#$', caseKey: method, checks: ['independent-wire-oracle'] },
      { id: query ? 'infra.trade.v1.QueryTrade#request-mapping#xpay_env' : 'infra.trade.v1.CreateTradePay#request-mapping#xpay_env', caseKey, checks: [query ? 'query-absence' : 'create-presence-and-enum'] },
    ],
  }, async ({ fixture: value, checkpoint, expect }) => {
    const fixture = value as WireFixture;
    const server = await createShadowServer({ scenarios: [{ id: `weapp-${caseKey}`, routes: { [method]: { expectedRequests: [{ body: fixture.request }], steps: [{ body: fixture.response }] } } }] }).start();
    running.add(server);
    const result = await runWeappFunction({
      automator, projectPath, cliPath, functionName: 'runProtocolCase',
      args: { action: query ? 'queryTrade' : 'createTradePay', gatewayBaseUrl: server.url, request: fixture.request, accessToken: 'fixture-token', requestId: 'pay-fixture-1', productId: 'fixture-product', timeoutMs: 10_000 },
    });
    const decoded = query
      ? QueryTradeResponse.toJSON(QueryTradeResponse.fromJSON(fixture.response))
      : CreateTradePayResponse.toJSON(CreateTradePayResponse.fromJSON(fixture.response));
    await checkpoint('independent-wire-oracle', () => {
      expect(protocolResultIssues(result, { wire: fixture.response, decoded })).toEqual([]);
      expect(server.verify()).toEqual([]);
      expect(server.records()).toHaveLength(1);
    });
    await checkpoint(query ? 'query-absence' : 'create-presence-and-enum', () => {
      expect(server.records()[0]!.headers).toMatchObject({ authorization: 'Bearer fixture-token', request_id: 'pay-fixture-1' });
      expect(Object.prototype.hasOwnProperty.call(server.records()[0]!.rawBody as object, 'xpayEnv')).toBe(!query && caseKey !== 'omitted');
      if (!query && caseKey !== 'omitted') expect((server.records()[0]!.rawBody as { xpayEnv: string }).xpayEnv).toBe(`XPAY_ENV_${caseKey.toUpperCase()}`);
    });
  }, { fixtureRoot });
}
