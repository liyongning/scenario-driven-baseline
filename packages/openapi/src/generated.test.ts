import { expect, test } from 'vitest';
import {
  businessCodeTable,
  cancelTrade,
  createTrade,
  getTrade,
  listTrades,
  type OperationCodes,
} from './index';

test('generated operations expose contract metadata and business codes', () => {
  expect(createTrade.meta).toEqual({
    id: 'createTrade',
    method: 'post',
    path: '/api/v1/trades',
    security: [{ accessToken: [] }],
    codes: ['INVALID_REQUEST', 'TRADE_CONFLICT'],
    implemented: true,
  });
  expect(getTrade.meta.path).toBe('/api/v1/trades/{trade_no}');
  expect(listTrades.meta.security).toEqual([]);
  expect(cancelTrade.meta).toMatchObject({ id: 'cancelTrade', implemented: false });
  expect(businessCodeTable).toEqual({
    OK: 0,
    INVALID_REQUEST: 40001,
    TRADE_NOT_FOUND: 40401,
    TRADE_CONFLICT: 40901,
  });

  const createTradeCodes: Record<OperationCodes<'createTrade'>, true> = {
    INVALID_REQUEST: true,
    TRADE_CONFLICT: true,
  };
  expect(Object.keys(createTradeCodes).sort()).toEqual(['INVALID_REQUEST', 'TRADE_CONFLICT']);
});
