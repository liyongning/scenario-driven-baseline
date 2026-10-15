import { describe, expect, it, test } from 'vitest';
import { CreateTrade, QueryTrade } from '../../../src/generated/idl/infra/trade/v1/trade.ts';
import { discoverExampleRoutes } from './routes.ts';

describe('discoverExampleRoutes', () => {
  it('discovers CreateTrade and QueryTrade from generated metadata', { timeout: 30_000 }, () => {
    expect(
      discoverExampleRoutes().map(({ methodName, httpMethod, path }) => ({
        methodName,
        httpMethod,
        path,
      })),
    ).toEqual([
      { methodName: 'CreateTrade', httpMethod: 'POST', path: '/api/base/trade/create' },
      { methodName: 'QueryTrade', httpMethod: 'POST', path: '/api/base/trade/query' },
    ]);
  });

  it('rejects missing or incomplete generated methods', { timeout: 30_000 }, () => {
    expect(() => discoverExampleRoutes([QueryTrade.meta])).toThrow(/CreateTrade/);
    expect(() =>
      discoverExampleRoutes([{ ...CreateTrade.meta, path: '' } as never, QueryTrade.meta]),
    ).toThrow(/not an HTTP method/);
  });

  test(
    'SCN-TEMPLATE-EXAMPLE-009 shadow-create-route',
    {
      timeout: 30_000,
      meta: {
        scenarioCase: {
          ownerId: 'SCN-TEMPLATE-EXAMPLE-009',
          caseId: 'shadow-create-route',
          environment: 'protocol-unit',
          fixtureCase: null,
          covers: [
            {
              id: 'SCN-TEMPLATE-EXAMPLE-009',
              caseKey: 'shadow-create-route',
              checks: ['generated-route', 'fixture-driven'],
            },
          ],
        },
      },
    },
    async (context) => {
      const assertionsBefore = context.expect.getState().assertionCalls;
      const route = discoverExampleRoutes().find(
        (candidate) => candidate.methodName === 'CreateTrade',
      );
      context.expect(route).toMatchObject({
        httpMethod: 'POST',
        path: CreateTrade.meta.path,
      });
      context.expect(route?.validateResponse).toEqual(expect.any(Function));
      context.expect(route?.validateResponse?.({ baseResp: { statusCode: '0' } }, 200)).toEqual([]);
      context
        .expect(route?.validateResponse?.({ baseResp: { statusCode: '0' }, unknown: true }, 200))
        .toEqual(['$.unknown: 响应类型中不存在的字段']);
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - assertionsBefore,
          checkpoints: ['generated-route', 'fixture-driven'],
        }),
        'scenario-evidence',
      );
    },
  );
});
