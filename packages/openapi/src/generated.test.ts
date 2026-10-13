import { test } from 'vitest';
import {
  businessCodeTable,
  cancelTrade,
  createTrade,
  getTrade,
  listTrades,
  type OperationCodes,
} from './index';

type Outcome = 'handled';

const createTradeOutcomes = {
  INVALID_REQUEST: 'handled',
  TRADE_CONFLICT: 'handled',
  TRADE_NOT_FOUND: 'handled',
} satisfies Record<OperationCodes<'createTrade'>, Outcome>;

// @ts-expect-error 缺少一个接口业务码必须编译失败。
const missingCode: Record<OperationCodes<'createTrade'>, Outcome> = {
  INVALID_REQUEST: 'handled',
};

const extraCode: Record<OperationCodes<'createTrade'>, Outcome> = {
  INVALID_REQUEST: 'handled',
  TRADE_CONFLICT: 'handled',
  // @ts-expect-error 契约之外的业务码必须编译失败。
  UNKNOWN_CODE: 'handled',
};

test(
  'SCN-OPENAPI-CONTRACT-020 code-completeness-types',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-OPENAPI-CONTRACT-020',
        caseId: 'code-completeness-types',
        fixtureCase: null,
        environment: 'openapi-unit',
        covers: [
          {
            id: 'SCN-OPENAPI-CONTRACT-020',
            caseKey: 'code-completeness-types',
            checks: ['operation-codes-match', 'exhaustive-compiles', 'missing-or-extra-fails'],
          },
        ],
      },
    },
  },
  (context) => {
    const before = context.expect.getState().assertionCalls;
    context.expect(createTrade.meta).toEqual({
      id: 'createTrade',
      method: 'post',
      path: '/api/v1/trades',
      security: [{ accessToken: [] }],
      codes: ['INVALID_REQUEST', 'TRADE_CONFLICT', 'TRADE_NOT_FOUND'],
      implemented: true,
    });
    context.expect(getTrade.meta.path).toBe('/api/v1/trades/{trade_no}');
    context.expect(listTrades.meta.security).toEqual([]);
    context.expect(cancelTrade.meta).toMatchObject({ id: 'cancelTrade', implemented: false });
    context.expect(businessCodeTable).toEqual({
      OK: 0,
      INVALID_REQUEST: 40001,
      TRADE_NOT_FOUND: 40401,
      TRADE_CONFLICT: 40901,
    });
    context
      .expect(Object.keys(createTradeOutcomes).sort())
      .toEqual(['INVALID_REQUEST', 'TRADE_CONFLICT', 'TRADE_NOT_FOUND']);
    context.expect(missingCode).toBeDefined();
    context.expect(extraCode).toBeDefined();
    context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['operation-codes-match', 'exhaustive-compiles', 'missing-or-extra-fails'],
      }),
      'scenario-evidence',
    );
  },
);
