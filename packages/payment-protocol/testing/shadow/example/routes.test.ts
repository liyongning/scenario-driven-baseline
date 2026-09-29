import { describe, expect, it } from 'vitest';
import { CreateTrade, QueryTrade } from '../../../src/generated/idl/infra/trade/v1/trade.ts';
import { discoverExampleRoutes } from './routes.ts';

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
});
