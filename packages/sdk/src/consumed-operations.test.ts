import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type TestContext } from 'vitest';
import { consumedOperations } from './consumed-operations';

/** 模块类证据：把手写断言登记为 scenario-evidence，交由场景门禁对账。 */
async function annotate(context: TestContext, before: number, checkpoints: string[]) {
  await context.annotate(
    JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints }),
    'scenario-evidence',
  );
}

// 标记外的断言与示例无关：声明被清空时同样成立（EX-09）。
test('每条声明的 method 都是 generated 方法描述', () => {
  for (const operation of consumedOperations) {
    expect(operation.method.meta.name.length).toBeGreaterThan(0);
    expect(operation.method.meta.requestType.length).toBeGreaterThan(0);
    expect(operation.method.meta.responseType.length).toBeGreaterThan(0);
    for (const [path, policy] of Object.entries(operation.requestFields)) {
      expect(path.length, path).toBeGreaterThan(0);
      expect(policy.cases.length, path).toBeGreaterThan(0);
      expect(policy.authority.length, path).toBeGreaterThan(0);
    }
  }
});

// template-example:begin
test(
  'SCN-TEMPLATE-EXAMPLE-012 declaration-module',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-012',
        caseId: 'declaration-module',
        environment: 'sdk-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-TEMPLATE-EXAMPLE-012',
            caseKey: 'declaration-module',
            checks: ['declaration-registered', 'example-entries-marked'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    context
      .expect(consumedOperations.map((item) => item.method.meta.name))
      .toEqual(['CreateTrade', 'QueryTrade']);
    context
      .expect(consumedOperations.map((item) => Object.keys(item.requestFields).length))
      .toEqual([21, 7]);
    const source = readFileSync(
      fileURLToPath(new URL('./consumed-operations.ts', import.meta.url)),
      {
        encoding: 'utf8',
      },
    );
    context.expect(source.match(/\/\/ template-example:begin/g)).toHaveLength(2);
    context.expect(source.match(/\/\/ template-example:end/g)).toHaveLength(2);
    const begin = source.lastIndexOf('// template-example:begin');
    const end = source.lastIndexOf('// template-example:end');
    context.expect(begin).toBeGreaterThan(-1);
    context.expect(end).toBeGreaterThan(begin);
    context.expect(source.slice(begin, end)).toContain('method: CreateTrade');
    context.expect(source.slice(begin, end)).toContain('method: QueryTrade');
    await annotate(context, before, ['declaration-registered', 'example-entries-marked']);
  },
);
// template-example:end
