import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import {
  discoverEntryExports,
  publicDocIssues,
  type PublicTypeRequirement,
} from '../../packages/e2e/tests/tooling/public-doc.ts';

const roots: string[] = [];
function fixture(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'template-public-doc-'));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

const entrySource = [
  "export * from './types';",
  "export type * from './more';",
  "export { GeneratedShape } from './generated/gen';",
  'export const entryValue = 1;',
  '',
].join('\n');

const typesSource = [
  '/** 说明。 */',
  'export type Alpha = Readonly<{',
  '  /** 字段。 */',
  '  field: string;',
  '}>;',
  '',
  '/** 说明。 */',
  'export interface Beta {',
  '  /** 同名第一处。 */',
  '  shared: string;',
  '  /** 同名第二处。 */',
  '  shared2: number;',
  '}',
  '',
].join('\n');

const moreSource = [
  '/** 说明。 */',
  'export type Gamma = ',
  '  /** 分支。 */',
  "  | 'branch';",
  '',
].join('\n');

const generatedSource = ['export type GeneratedShape = { uncommented: string };', ''].join('\n');

function requirementsOf(root: string): PublicTypeRequirement[] {
  return [...discoverEntryExports({ root, entry: join(root, 'pkg/index.ts') }).types];
}

test(
  'SCN-TEMPLATE-ENGINEERING-003 entry-discovery-rules',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-ENGINEERING-003',
        caseId: 'entry-discovery-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-TEMPLATE-ENGINEERING-003',
            caseKey: 'entry-discovery-rules',
            checks: ['entry-discovery', 'source-comment-structure', 'every-declaration-site'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };
    try {
      const root = fixture({
        'pkg/index.ts': entrySource,
        'pkg/types.ts': typesSource,
        'pkg/more.ts': moreSource,
        'pkg/generated/gen.ts': generatedSource,
        'outside/index.ts': "export type * from './types';\n",
        'outside/types.ts': 'export type OutsideType = { field: string };\n',
      });
      const discovery = discoverEntryExports({ root, entry: join(root, 'pkg/index.ts') });

      await check('entry-discovery', () => {
        // 入口的导出符号被追溯到各自的手写声明，重新导出与 `export type *` 都算在内。
        context
          .expect(discovery.types.map((item) => item.name).sort())
          .toEqual(['Alpha', 'Beta', 'Gamma']);
        context
          .expect([...new Set(discovery.types.map((item) => item.file))].sort())
          .toEqual(['pkg/more.ts', 'pkg/types.ts']);
        // 生成代码不在检查范围；入口导出的运行时值单独列出。
        context.expect(discovery.types.some((item) => item.name === 'GeneratedShape')).toBe(false);
        context.expect(discovery.values).toEqual(['entryValue']);
        // 入口不再导出时检查对象随之变化，不依赖固定文件列表。
        writeFileSync(join(root, 'pkg/index.ts'), "export * from './types';\n");
        context
          .expect(
            requirementsOf(root)
              .map((item) => item.name)
              .sort(),
          )
          .toEqual(['Alpha', 'Beta']);
        // 包外声明（`..` 之外）不属于本包入口的检查范围。
        context
          .expect(
            discoverEntryExports({ root: join(root, 'pkg'), entry: join(root, 'outside/index.ts') })
              .types,
          )
          .toEqual([]);
      });

      const requirements = requirementsOf(root);
      const source = [typesSource, moreSource].join('\n');
      await check('source-comment-structure', () => {
        context.expect(publicDocIssues(source, requirements)).toEqual([]);
        context
          .expect(publicDocIssues(source, [{ name: 'Missing', fields: [], values: [] }]))
          .toEqual(['Missing: missing']);
        context
          .expect(publicDocIssues(source, [{ name: 'Alpha', fields: ['absent'], values: [] }]))
          .toEqual(['Alpha.absent: missing']);
        context
          .expect(publicDocIssues('export type Alpha = { field: string };\n', requirements))
          .toContain('Alpha: missing Chinese JSDoc');
        context
          .expect(
            publicDocIssues('export type Alpha = { field: string };\n', [
              { name: 'Alpha', fields: [], values: ['gone'] },
            ]),
          )
          .toContain('Alpha.gone: missing');
        // 属性上的字面量锚到属性本身的注释，联合分支锚到分支。
        context
          .expect(
            publicDocIssues('export type Alpha = { field: true };\n', [
              { name: 'Alpha', fields: [], values: ['true'] },
            ]),
          )
          .toContain('Alpha.true: missing Chinese JSDoc');
        context
          .expect(
            publicDocIssues("export type Alpha = 'one' | 'two';\n", [
              { name: 'Alpha', fields: [], values: ['two'] },
            ]),
          )
          .toContain('Alpha.two: missing Chinese JSDoc');
        context
          .expect(
            publicDocIssues('/** 说明。 */\nexport enum Alpha { /** 已注释。 */ One, Two }\n', [
              { name: 'Alpha', fields: [], values: ['One', 'Two'] },
            ]),
          )
          .toContain('Alpha.Two: missing Chinese JSDoc');
        context
          .expect(
            publicDocIssues('/** 说明。 */\nexport enum Alpha { /** 已注释。 */ One }\n', [
              { name: 'Alpha', fields: [], values: ['One'] },
            ]),
          )
          .toEqual([]);
        context
          .expect(
            publicDocIssues('export declare class Alpha { readonly code = 1; }\n', [
              { name: 'Alpha', fields: [], values: [] },
            ]),
          )
          .toContain('Alpha: missing Chinese JSDoc');
      });

      await check('every-declaration-site', () => {
        // 同名类型在两个声明位置出现时逐位置检查。
        const merged = [
          '/** 第一处。 */',
          'export interface Gamma {',
          '  /** 字段。 */',
          '  field: string;',
          '}',
          '/** 第二处。 */',
          'export interface Gamma {',
          '  field: string;',
          '}',
          '',
        ].join('\n');
        context
          .expect(publicDocIssues(merged, [{ name: 'Gamma', fields: ['field'], values: [] }]))
          .toEqual(['Gamma.field: missing Chinese JSDoc']);
        // 同一类型里同名字段出现在两个位置时，只有第二个缺注释也要报出。
        const duplicate = [
          '/** 说明。 */',
          'export interface Gamma {',
          '  /** 第一处。 */',
          '  field: string;',
          '  field: string;',
          '}',
          '',
        ].join('\n');
        context
          .expect(publicDocIssues(duplicate, [{ name: 'Gamma', fields: ['field'], values: [] }]))
          .toEqual(['Gamma.field: missing Chinese JSDoc']);
        // 两处都有注释时不报问题。
        const both = [
          '/** 说明。 */',
          'export interface Gamma {',
          '  /** 第一处。 */',
          '  field: string;',
          '  /** 第二处。 */',
          '  field: string;',
          '}',
          '',
        ].join('\n');
        context
          .expect(publicDocIssues(both, [{ name: 'Gamma', fields: ['field'], values: [] }]))
          .toEqual([]);
      });
      context
        .expect(executed.sort())
        .toEqual(['entry-discovery', 'source-comment-structure', 'every-declaration-site'].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    } finally {
      for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    }
  },
);
