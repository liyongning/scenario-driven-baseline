import { describe, expect, it, test } from 'vitest';
import { CreateTrade, QueryTrade } from '../../../src/generated/idl/infra/trade/v1/trade.ts';
import { discoverExampleRoutes } from './routes.ts';
import { createShadowServer } from '../server.ts';

describe('discoverExampleRoutes', () => {
  it('discovers CreateTrade and QueryTrade from generated metadata', () => {
    expect(discoverExampleRoutes()).toEqual([
      { methodName: 'CreateTrade', httpMethod: 'POST', path: '/api/base/trade/create' },
      { methodName: 'QueryTrade', httpMethod: 'POST', path: '/api/base/trade/query' },
    ]);
  });

  it('rejects missing or incomplete generated methods', () => {
    expect(() => discoverExampleRoutes([QueryTrade.meta])).toThrow(/CreateTrade/);
    expect(() => discoverExampleRoutes([{ ...CreateTrade.meta, path: '' } as never, QueryTrade.meta])).toThrow(/not an HTTP method/);
  });

  test('SCN-TEMPLATE-EXAMPLE-009 shadow-create-route', { meta: { scenarioCase: {
    ownerId: 'SCN-TEMPLATE-EXAMPLE-009', caseId: 'shadow-create-route', environment: 'protocol-unit', fixtureCase: null,
    covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-009', caseKey: 'shadow-create-route', checks: ['generated-route', 'fixture-driven'] }],
  } } }, async context => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    context.expect(discoverExampleRoutes().find(route => route.methodName === 'CreateTrade')).toMatchObject({
      httpMethod: 'POST', path: CreateTrade.meta.path,
    });
    const server = await createShadowServer({ routes: discoverExampleRoutes(), scenarios: [{ id: 'example-route-faults', routes: {
      CreateTrade: { expectedRequests: [{ recordOnly: true }, { recordOnly: true }, { recordOnly: true }], steps: [
        { body: { baseResp: { statusCode: '10100801003070' } } },
        { delayMs: 10, body: { tradeNo: 'created', baseResp: { statusCode: '0' } } },
        { disconnect: true },
      ] },
    } }] }).start();
    try {
      const post = () => fetch(`${server.url}/api/base/trade/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      context.expect(await (await post()).json()).toMatchObject({ baseResp: { statusCode: '10100801003070' } });
      const before = Date.now();
      context.expect(await (await post()).json()).toMatchObject({ tradeNo: 'created' });
      context.expect(Date.now() - before).toBeGreaterThanOrEqual(8);
      await context.expect(post()).rejects.toThrow();
      context.expect(server.records().map(record => record.methodName)).toEqual(['CreateTrade', 'CreateTrade', 'CreateTrade']);
      context.expect(server.verify()).toEqual([]);
      await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - assertionsBefore, checkpoints: ['generated-route', 'fixture-driven'] }), 'scenario-evidence');
    } finally { await server.close(); }
  });
});
