import { test } from 'vitest';
import type { RpcMethodMeta } from '../../src/generated/std.ts';
import { discoverDeclaredRoutes, type DeclaredOperation } from './declared-routes.ts';

const codec = { fromJSON: (value: unknown) => value, toJSON: (value: unknown) => value };

/** 合成的 generated 方法描述：不引用仓库真实生成文件，模拟来自不同 generated 文件的两个接口。 */
function method(name: string, path: string): DeclaredOperation {
  return {
    meta: {
      name,
      method: 'POST',
      path,
      requestType: `${name}Request`,
      responseType: `${name}Response`,
      requestCodec: codec,
      responseCodec: codec,
      annotations: {},
    } satisfies RpcMethodMeta<unknown, unknown>,
  };
}

test(
  'SCN-PROTOCOL-CONTRACT-002 declared-routes',
  {
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
      method('DeclaredCreate', '/api/declared/create'),
      method('DeclaredQuery', '/api/declared/query'),
    ];
    context.expect(discoverDeclaredRoutes(declaration)).toEqual([
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
