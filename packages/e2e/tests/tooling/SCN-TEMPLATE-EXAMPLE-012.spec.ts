import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { lineInRanges, markedLineRanges } from '../../../../scripts/lib/example-markers.ts';
import { loadProjectManifest, packagesByRole } from '../../../../scripts/lib/project-manifest.ts';
// 消费接口声明不经 SDK 根入口导出：按源码读取（清单登记该模块路径，门禁同样读源码）。
import { consumedOperations } from '../../../../packages/sdk/src/consumed-operations.ts';
import { repositoryRoot } from './helpers.ts';

/** 声明模块由清单登记；用例不写死示例导出名（EX-09）。 */
const manifest = loadProjectManifest(repositoryRoot);
const product = packagesByRole(manifest, 'product').find((item) => item.form === 'sdk');
if (!product) throw new Error('template has no sdk product package');
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
        binding: 'sdk-idl-weapp',
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
    const operations = consumedOperations;
    const names = operations.map((operation) => operation.method.meta.name);

    // declaration-registered：清单登记声明模块，标记内的示例条目恰好两个 { method, requestFields } 元素
    // （标记外的使用方条目不影响判定），method 引用 generated 方法常量而非手写副本。
    context.expect(declarationModules).toEqual(['packages/sdk/src/consumed-operations.ts']);
    const declarationFile = declarationModules[0]!;
    const source = readFileSync(resolve(repositoryRoot, declarationFile), 'utf8');
    const ranges = markedLineRanges(declarationFile, source);
    const entryLine = (name: string) => {
      const index = source.indexOf(`method: ${name},`);
      return index < 0 ? -1 : source.slice(0, index).split('\n').length;
    };
    const marked = operations.filter((operation) =>
      lineInRanges(ranges, entryLine(operation.method.meta.name)),
    );
    const outside = operations.filter(
      (operation) => !lineInRanges(ranges, entryLine(operation.method.meta.name)),
    );
    context
      .expect(marked.map((operation) => operation.method.meta.name))
      .toEqual(['CreateTrade', 'QueryTrade']);
    context
      .expect(marked.map((operation) => Object.keys(operation.requestFields).length > 0))
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
    // 标记内的示例条目与 generated 方法常量逐一对应（引用同一常量，不是手写副本）。
    for (const operation of marked) {
      const meta = operation.method.meta;
      const expected = generated[meta.name]?.meta;
      context.expect(expected, meta.name).toBeDefined();
      context.expect(meta.method, meta.name).toBe(expected!.method);
      context.expect(meta.path, meta.name).toBe(expected!.path);
      context.expect(meta.requestType, meta.name).toBe(expected!.requestType);
      context.expect(meta.responseType, meta.name).toBe(expected!.responseType);
      context.expect(source).toContain(`method: ${meta.name},`);
    }
    // 标记外的使用方条目只要求 method 是 generated 方法描述（createMethod 产出的可调用常量）。
    for (const operation of outside) {
      const meta = operation.method.meta;
      context.expect(typeof (operation.method as unknown), meta.name).toBe('function');
      context.expect(meta.method.length, meta.name).toBeGreaterThan(0);
      context.expect(meta.path.length, meta.name).toBeGreaterThan(0);
    }
    // 标记块数量随示例片段移动而变：只核验存在且成对，不写死数量（示例片段可增减）。
    const begins = source.match(/\/\/ template-example:begin/g) ?? [];
    const ends = source.match(/\/\/ template-example:end/g) ?? [];
    context.expect(begins.length).toBeGreaterThan(0);
    context.expect(ends.length).toBe(begins.length);

    // declaration-matches-calls：声明与实际调用的双向检查为 0 问题。
    // 本 Scenario 只派生 SDK 包的声明义务；多包模板里其它产品包的消费接口不属于此处。
    const inventory = await buildContractInventory(repositoryRoot, { product: product.directory });
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
