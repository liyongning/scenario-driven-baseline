import { describe, expect, it } from 'vitest';
import { CreateTradePay, QueryTrade } from '../../src/generated/idl/infra/trade/v1/trade.ts';
import { discoverPaymentRoutes } from './routes.ts';

describe('discoverPaymentRoutes', () => {
  it('discovers only the two consumed HTTP methods from generated metadata', () => {
    expect(discoverPaymentRoutes()).toEqual([
      { methodName: 'CreateTradePay', httpMethod: 'POST', path: '/api/base/trade/pay', meta: CreateTradePay.meta },
      { methodName: 'QueryTrade', httpMethod: 'POST', path: '/api/base/trade/query', meta: QueryTrade.meta },
    ]);
  });

  it('rejects a generated input that is missing a consumed route', () => {
    expect(() => discoverPaymentRoutes([CreateTradePay.meta])).toThrow(/QueryTrade/);
  });

  it('does not expose unrelated generated HTTP methods', () => {
    const unrelated = { ...CreateTradePay.meta, name: 'DeleteEverything', path: '/admin/delete' };
    expect(discoverPaymentRoutes([CreateTradePay.meta, QueryTrade.meta, unrelated])).toHaveLength(2);
  });

  it('rejects consumed metadata that is not a complete HTTP method', () => {
    for (const patch of [{ path: '' }, { method: '' }, { requestCodec: undefined }]) {
      expect(() => discoverPaymentRoutes([{ ...CreateTradePay.meta, ...patch } as never, QueryTrade.meta])).toThrow(/not an HTTP method/);
    }
  });
});
