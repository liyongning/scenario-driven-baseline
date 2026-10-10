// template-example:begin
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'vitest';
import { lineInRanges, markedLineRanges } from '../../../scripts/lib/example-markers.ts';
// template-example:end
import { expect, test } from 'vitest';
import { consumedOperations } from './consumed-operations';

// template-example:begin
/** 模块类证据：把手写断言登记为 scenario-evidence，交由场景门禁对账。 */
async function annotate(context: TestContext, before: number, checkpoints: string[]) {
  await context.annotate(
    JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints }),
    'scenario-evidence',
  );
}
// template-example:end

/**
 * 声明格式的结构子集：方法与请求字段策略的形状由类型定义保证，这里只做运行期可核对的非空校验。
 * 与示例无关——声明为空数组时同样成立。
 */
type DeclaredOperation = Readonly<{
  method: Readonly<{ meta: Readonly<{ name: string; requestType: string; responseType: string }> }>;
  requestFields: Readonly<
    Record<string, Readonly<{ cases: ReadonlyArray<string>; authority: string }>>
  >;
}>;

/** 收集声明格式问题：缺 meta、空字段路径、缺映射策略或缺评审依据都要报出来。 */
function declarationIssues(operations: ReadonlyArray<DeclaredOperation>): string[] {
  const issues: string[] = [];
  for (const [index, operation] of operations.entries()) {
    const meta = operation.method.meta;
    if (meta.name.length === 0) issues.push(`#${index}: method 缺少接口名`);
    if (meta.requestType.length === 0) issues.push(`#${index}: method 缺少请求类型`);
    if (meta.responseType.length === 0) issues.push(`#${index}: method 缺少响应类型`);
    for (const [path, policy] of Object.entries(operation.requestFields)) {
      if (path.length === 0) issues.push(`#${index}: 请求字段路径为空`);
      if (policy.cases.length === 0) issues.push(`#${index}: ${path} 没有映射策略`);
      if (policy.authority.length === 0) issues.push(`#${index}: ${path} 没有评审依据`);
    }
  }
  return issues;
}

/**
 * 每个元素的 `method` 都必须是 generated 中由 `createMethod` 产出的方法描述：
 * `createMethod` 产出可调用的方法常量（带 HTTP 元数据），`defineMethodSpec` 只产出普通对象。
 * 与示例无关——标记内外的条目都要满足，删除示例后仍然成立。
 */
function generatedMethodIssues(operations: ReadonlyArray<DeclaredOperation>): string[] {
  return operations.flatMap((operation, index) => {
    const method: unknown = operation.method;
    if (typeof method !== 'function') return [`#${index}: method 不是 createMethod 产出的方法常量`];
    const meta = (method as { meta?: { method?: unknown; path?: unknown } }).meta;
    if (typeof meta?.method !== 'string' || typeof meta?.path !== 'string')
      return [`#${index}: method 缺少 HTTP 元数据`];
    return [];
  });
}

/** 真实声明的每个元素都必须是 generated 方法描述：标记外的通用断言，不依赖示例。 */
test('真实声明的每个 method 都是 generated 方法描述', () => {
  expect(generatedMethodIssues(consumedOperations)).toEqual([]);
  expect(
    generatedMethodIssues([
      { method: { meta: { name: 'X', requestType: 'R', responseType: 'S' } }, requestFields: {} },
    ]),
  ).toEqual(['#0: method 不是 createMethod 产出的方法常量']);
});

/** 受控输入：格式校验对缺 meta、缺策略、空路径与缺依据都要报错，不是空转的循环。 */
test('受控输入下声明格式校验会报出缺失项', () => {
  const valid: DeclaredOperation = {
    method: { meta: { name: 'CreateTrade', requestType: 'X', responseType: 'Y' } },
    requestFields: { field: { cases: ['mapped-value'], authority: 'PC-01' } },
  };
  expect(declarationIssues([valid])).toEqual([]);
  expect(
    declarationIssues([{ ...valid, method: { meta: { ...valid.method.meta, name: '' } } }]),
  ).toEqual(['#0: method 缺少接口名']);
  expect(
    declarationIssues([{ ...valid, requestFields: { field: { cases: [], authority: 'PC-01' } } }]),
  ).toEqual(['#0: field 没有映射策略']);
  expect(
    declarationIssues([
      { ...valid, requestFields: { '': { cases: ['mapped-value'], authority: 'PC-01' } } },
    ]),
  ).toEqual(['#0: 请求字段路径为空']);
  expect(
    declarationIssues([
      { ...valid, requestFields: { field: { cases: ['mapped-value'], authority: '' } } },
    ]),
  ).toEqual(['#0: field 没有评审依据']);
});

/** 真实声明：删除示例后 `consumedOperations` 为空数组，这条断言仍然实际执行（不是循环空转）。 */
test('真实声明满足格式校验，声明为空是合法状态', () => {
  expect(declarationIssues(consumedOperations)).toEqual([]);
  if (consumedOperations.length === 0) expect(consumedOperations).toEqual([]);
});

// template-example:begin
/** 声明模块中某个条目的 `method:` 行号（1-based）；示例条目据此机械识别为"标记内"。 */
function entryLine(source: string, name: string): number {
  const index = source.indexOf(`method: ${name},`);
  return index < 0 ? -1 : source.slice(0, index).split('\n').length;
}

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
    const source = readFileSync(
      fileURLToPath(new URL('./consumed-operations.ts', import.meta.url)),
      {
        encoding: 'utf8',
      },
    );
    const ranges = markedLineRanges('consumed-operations.ts', source);
    const marked = consumedOperations.filter((item) =>
      lineInRanges(ranges, entryLine(source, item.method.meta.name)),
    );
    // 只约束标记内的示例条目：标记外的使用方条目不影响"恰好是两个示例接口"的判定（EX-09）。
    context
      .expect(marked.map((item) => item.method.meta.name))
      .toEqual(['CreateTrade', 'QueryTrade']);
    context.expect(marked.map((item) => Object.keys(item.requestFields).length)).toEqual([21, 7]);
    // 标记块数量随示例片段移动而变：只核验存在且成对，不写死数量（示例片段可增减）。
    const begins = source.match(/\/\/ template-example:begin/g) ?? [];
    const ends = source.match(/\/\/ template-example:end/g) ?? [];
    context.expect(begins.length).toBeGreaterThan(0);
    context.expect(ends.length).toBe(begins.length);
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
