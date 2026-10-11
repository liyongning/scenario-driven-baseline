import { test } from 'vitest';
import { CreateTrade, QueryTrade } from '../../src/generated/idl/infra/trade/v1/trade.ts';
import type { RpcMethodMeta } from '../../src/generated/std.ts';
import { discoverDeclaredRoutes, type DeclaredOperation } from './declared-routes.ts';

/**
 * 合成的声明条目：方法名与路径来自声明，响应类型复用真实 generated 类型，
 * 使响应结构校验器可派生（PC-04），同时证明路由字段只从 `meta` 读取。
 */
function method(
  name: string,
  path: string,
  source: RpcMethodMeta<unknown, unknown>,
): DeclaredOperation {
  return { meta: { ...source, name, path } satisfies RpcMethodMeta<unknown, unknown> };
}

test(
  'SCN-PROTOCOL-CONTRACT-002 declared-routes',
  {
    // 用例加载 generated 方法常量：副本/负载下默认 5s 易误判超时。
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-002',
        caseId: 'declared-routes',
        fixtureCase: null,
        environment: 'protocol-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-002',
            caseKey: 'declared-routes',
            checks: ['routes-from-declaration', 'empty-declaration-routes'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const declaration = [
      method('DeclaredCreate', '/api/declared/create', CreateTrade.meta),
      method('DeclaredQuery', '/api/declared/query', QueryTrade.meta),
    ];
    context
      .expect(
        discoverDeclaredRoutes(declaration).map(({ methodName, httpMethod, path }) => ({
          methodName,
          httpMethod,
          path,
        })),
      )
      .toEqual([
        { methodName: 'DeclaredCreate', httpMethod: 'POST', path: '/api/declared/create' },
        { methodName: 'DeclaredQuery', httpMethod: 'POST', path: '/api/declared/query' },
      ]);
    context.expect(discoverDeclaredRoutes([])).toEqual([]);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['routes-from-declaration', 'empty-declaration-routes'],
      }),
      'scenario-evidence',
    );
  },
);
