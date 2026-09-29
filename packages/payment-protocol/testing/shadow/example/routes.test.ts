import { describe, expect, it } from 'vitest';
import { CreateTrade, QueryTrade } from '../../../src/generated/idl/infra/trade/v1/trade.ts';
import { discoverExampleRoutes } from './routes.ts';
import { createShadowServer } from '../server.ts';

describe('discoverExampleRoutes', () => {
  it('discovers CreateTrade and QueryTrade from generated metadata', () => {
    expect(discoverExampleRoutes()).toEqual([
      { methodName: 'CreateTrade', httpMethod: 'POST', path: '/api/base/trade/create', meta: CreateTrade.meta },
      { methodName: 'QueryTrade', httpMethod: 'POST', path: '/api/base/trade/query', meta: QueryTrade.meta },
    ]);
  });

  it('rejects missing or incomplete generated methods', () => {
    expect(() => discoverExampleRoutes([QueryTrade.meta])).toThrow(/CreateTrade/);
    expect(() => discoverExampleRoutes([{ ...CreateTrade.meta, path: '' } as never, QueryTrade.meta])).toThrow(/not an HTTP method/);
  });

  it('runs generated CreateTrade route with business, delay, and disconnect steps', async () => {
    const server = await createShadowServer({ routes: discoverExampleRoutes(), scenarios: [{ id: 'example-route-faults', routes: {
      CreateTrade: { expectedRequests: [{ recordOnly: true }, { recordOnly: true }, { recordOnly: true }], steps: [
        { body: { baseResp: { statusCode: '10100801003070' } } },
        { delayMs: 10, body: { tradeNo: 'created', baseResp: { statusCode: '0' } } },
        { disconnect: true },
      ] },
    } }] }).start();
    try {
      const post = () => fetch(`${server.url}/api/base/trade/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(await (await post()).json()).toMatchObject({ baseResp: { statusCode: '10100801003070' } });
      const before = Date.now();
      expect(await (await post()).json()).toMatchObject({ tradeNo: 'created' });
      expect(Date.now() - before).toBeGreaterThanOrEqual(8);
      await expect(post()).rejects.toThrow();
      expect(server.records().map(record => record.methodName)).toEqual(['CreateTrade', 'CreateTrade', 'CreateTrade']);
      expect(server.verify()).toEqual([]);
    } finally { await server.close(); }
  });
});
