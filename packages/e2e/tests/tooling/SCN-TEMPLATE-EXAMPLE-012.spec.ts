import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { loadProjectManifest, packageByRole } from '../../../../scripts/lib/project-manifest.ts';
import { repositoryRoot } from './helpers.ts';

/** 声明模块由清单登记；用例不写死示例导出名（EX-09）。 */
const manifest = loadProjectManifest(repositoryRoot);
const product = packageByRole(manifest, 'product');
const declarationModules = product.consumedOperations ?? [];

test(
  'SCN-TEMPLATE-EXAMPLE-012 declared-obligations',
  {
    timeout: 120_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-012',
        caseId: 'declared-obligations',
        environment: 'integration',
        fixtureCase: 'declared-obligations',
        covers: [
          {
            id: 'SCN-TEMPLATE-EXAMPLE-012',
            caseKey: 'declared-obligations',
            checks: [
              'declaration-registered',
              'declaration-matches-calls',
              'obligations-from-declaration',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const sdk = (await import('@daqian/template-sdk')) as {
      consumedOperations: ReadonlyArray<{
        readonly method: {
          readonly meta: {
            readonly name: string;
            readonly method: string;
            readonly path: string;
            readonly requestType: string;
            readonly responseType: string;
          };
        };
        readonly requestFields: Readonly<Record<string, unknown>>;
      }>;
    };
    const operations = sdk.consumedOperations;
    const names = operations.map((operation) => operation.method.meta.name);

    // declaration-registered：清单登记声明模块，模块恰好两个 { method, requestFields } 元素，
    // method 引用 generated 方法常量而非手写副本，示例条目位于 template-example 标记内。
    context.expect(declarationModules).toEqual(['packages/sdk/src/consumed-operations.ts']);
    const declarationFile = declarationModules[0]!;
    const source = readFileSync(resolve(repositoryRoot, declarationFile), 'utf8');
    context.expect(operations.length).toBe(2);
    context
      .expect(operations.map((operation) => Object.keys(operation.requestFields).length > 0))
      .toEqual([true, true]);
    const specifier = /from '([^']*generated\/idl\/[^']+)'/.exec(source)?.[1];
    context.expect(specifier).toBeDefined();
    const generated = (await import(specifier!)) as Record<
      string,
      {
        meta: {
          name: string;
          method: string;
          path: string;
          requestType: string;
          responseType: string;
        };
      }
    >;
    for (const operation of operations) {
      const meta = operation.method.meta;
      const expected = generated[meta.name]?.meta;
      // 声明直接引用 generated 方法常量并传入其 meta，不是手写副本。
      context.expect(expected, meta.name).toBeDefined();
      context.expect(meta.method, meta.name).toBe(expected!.method);
      context.expect(meta.path, meta.name).toBe(expected!.path);
      context.expect(meta.requestType, meta.name).toBe(expected!.requestType);
      context.expect(meta.responseType, meta.name).toBe(expected!.responseType);
      context.expect(source).toContain(`method: ${meta.name},`);
    }
    context.expect(source.match(/\/\/ template-example:begin/g)).toHaveLength(2);
    context.expect(source.match(/\/\/ template-example:end/g)).toHaveLength(2);

    // declaration-matches-calls：声明与实际调用的双向检查为 0 问题。
    const inventory = await buildContractInventory(repositoryRoot);
    context.expect(inventory.issues).toEqual([]);
    context
      .expect(inventory.methods.map((method) => method.name).sort())
      .toEqual([...names].sort());

    // obligations-from-declaration：接口义务恰好覆盖声明接口，请求字段义务取自 requestFields。
    const interfaceObligations = inventory.obligations.filter((item) =>
      item.id.startsWith('infra.'),
    );
    // 义务 ID 由声明文件的 generated 目录推导出 infra.trade.v1 前缀，且只覆盖声明接口。
    context
      .expect(interfaceObligations.every((item) => item.id.startsWith('infra.trade.v1.')))
      .toBe(true);
    context
      .expect(
        [
          ...new Set(interfaceObligations.map((item) => item.id.slice(0, item.id.indexOf('#')))),
        ].sort(),
      )
      .toEqual(names.map((name) => `infra.trade.v1.${name}`).sort());
    context
      .expect(inventory.obligations.map((item) => item.id))
      .toContain('idl.error-contract#business-error#$');
    for (const operation of operations) {
      const name = operation.method.meta.name;
      const mapping = inventory.obligations
        .filter((item) => item.id.startsWith(`infra.trade.v1.${name}#request-mapping#`))
        .map((item) =>
          item.id.slice(item.id.indexOf('#request-mapping#') + '#request-mapping#'.length),
        )
        .sort();
      context.expect(mapping, name).toEqual(Object.keys(operation.requestFields).sort());
    }

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: [
          'declaration-registered',
          'declaration-matches-calls',
          'obligations-from-declaration',
        ],
      }),
      'scenario-evidence',
    );
  },
);
