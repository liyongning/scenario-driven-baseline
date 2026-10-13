import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defineCase } from '../../src/cases/define-case.ts';
import { loadProjectManifest, packagesByRole } from '../../../../scripts/lib/project-manifest.ts';
import { discoverEntryExports, publicDocIssues, type DocRequirement } from './public-doc.ts';

const root = resolve(import.meta.dirname, '../../../..');
const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const manifest = loadProjectManifest(root);
const sdkProduct = packagesByRole(manifest, 'product').find((item) => item.form === 'sdk');

/** 入口发现的公共类型要求：检查对象由根入口决定，删除示例后随入口变化（ENG-03）。 */
function entryRequirements(entry: string, workspaceRoot = root) {
  return discoverEntryExports({ root: workspaceRoot, entry }).types;
}

/** 逐文件检查入口追溯到的全部手写声明；类型不出现在某文件时不在该文件报缺。 */
function sourceIssues(entry: string, workspaceRoot = root): string[] {
  const requirements = entryRequirements(entry, workspaceRoot);
  const files = [...new Set(requirements.map((item) => item.file))];
  return files.flatMap((file) =>
    publicDocIssues(
      readFileSync(join(workspaceRoot, file), 'utf8'),
      requirements.filter((item) => item.file === file),
    ),
  );
}

function removeNearestComment(source: string, needle: string, after = ''): string {
  const base = after ? source.indexOf(after) : 0;
  const at = source.indexOf(needle, Math.max(base, 0));
  if (at < 0) throw new Error(`mutation target not found: ${needle}`);
  const start = source.lastIndexOf('/**', at);
  if (start < 0) throw new Error(`no JSDoc before: ${needle}`);
  const end = source.indexOf('*/', start);
  return source.slice(0, start) + source.slice(end + 2);
}

/** 受控声明源：与示例同形，示例删除后注释门禁仍可复核（ENG-06）。 */
const controlledContracts = [
  '/** 示例状态。 */',
  'export type ExampleState =',
  '  /** 尚未到达终态。 */',
  "  | 'pending'",
  '  /** 已关闭，不再变化。 */',
  "  | 'closed'",
  '  /** 服务端返回未识别的状态。 */',
  "  | 'unknown';",
  '',
  '/** 创建结果。 */',
  'export type ExampleCreateResult =',
  '  /** 创建成功。 */',
  '  | Readonly<{',
  '      /** 成功判别值。 */',
  '      ok: true;',
  '      /** 已创建资源标识。 */',
  '      reference: string;',
  '    }>',
  '  /** 创建失败。 */',
  '  | Readonly<{',
  '      /** 失败判别值。 */',
  '      ok: false;',
  '      /** 中立错误文案。 */',
  '      message: string;',
  '    }>;',
  '',
  '/** 观察最终结果。 */',
  'export type ExampleOutcome = Readonly<{',
  '  /** 观察结束原因。 */',
  '  end:',
  '    /** 资源已完成。 */',
  "    | 'completed'",
  '    /** 观察窗口用尽。 */',
  "    | 'window_elapsed'",
  '    /** 观察失败。 */',
  "    | 'failed';",
  '  /** 最后一次可信状态。 */',
  '  lastState: ExampleState;',
  '}>;',
  '',
  '/** 示例客户端公共入口。 */',
  'export interface ExampleClient {',
  '  /** 创建资源。 */',
  '  create(ownerId: string): Promise<ExampleCreateResult>;',
  '  /** 在有界窗口内观察资源状态。 */',
  '  observe(reference: string): Promise<ExampleOutcome>;',
  '}',
  '',
].join('\n');

/** 受控构建声明文本：与源码同形，用于核对产物声明的注释要求。 */
const controlledDeclaration = controlledContracts
  .replace(/export type /g, 'export declare type ')
  .replace('export interface ', 'export declare interface ');

/** 把受控声明源写进临时包并按其根入口发现注释要求。 */
function controlledEntry() {
  const directory = mkdtempSync(join(tmpdir(), 'controlled-entry-'));
  mkdirSync(join(directory, 'pkg'), { recursive: true });
  writeFileSync(
    join(directory, 'pkg/index.ts'),
    "export type * from './contracts';\nexport * from './contracts';\n",
  );
  writeFileSync(join(directory, 'pkg/contracts.ts'), controlledContracts);
  const requirements = discoverEntryExports({
    root: directory,
    entry: join(directory, 'pkg/index.ts'),
  }).types;
  return { directory, requirements };
}

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-003',
    caseId: 'source-and-dual-declarations',
    fixtureCase: 'source-and-dual-declarations',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-003',
        caseKey: 'source-and-dual-declarations',
        checks: ['source-comment-structure', 'dual-declaration-structure'],
      },
    ],
  },
  async ({ fixture: value, checkpoint, expect }) => {
    const controlled = sdkProduct ? undefined : controlledEntry();
    const workspaceRoot = sdkProduct ? root : controlled!.directory;
    const entry = sdkProduct
      ? resolve(root, 'packages', sdkProduct.directory, 'src', (value as { entry: string }).entry)
      : join(controlled!.directory, 'pkg/index.ts');
    const declarations = sdkProduct
      ? ['index.d.ts', 'index.d.cts'].map((file) =>
          readFileSync(resolve(root, 'packages', sdkProduct.directory, 'dist', file), 'utf8'),
        )
      : [controlledDeclaration, controlledDeclaration];
    try {
      const requirements = entryRequirements(entry, workspaceRoot);
      await checkpoint('source-comment-structure', () =>
        expect(sourceIssues(entry, workspaceRoot)).toEqual([]),
      );
      await checkpoint('dual-declaration-structure', () =>
        expect(declarations.map((text) => publicDocIssues(text, requirements))).toEqual([[], []]),
      );
    } finally {
      if (controlled) rmSync(controlled.directory, { recursive: true, force: true });
    }
  },
  { fixtureRoot },
);

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-003',
    caseId: 'missing-comment-rejected',
    fixtureCase: 'missing-comment-rejected',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-003',
        caseKey: 'missing-comment-rejected',
        checks: [
          'entry-discovery',
          'source-comment-structure',
          'every-declaration-site',
          'dual-declaration-structure',
        ],
      },
    ],
  },
  async ({ fixture: value, checkpoint, expect }) => {
    const mutations = (value as { mutations: string[] }).mutations;
    const controlled = controlledEntry();
    const source = controlledContracts;
    const requirements = controlled.requirements;
    // 只检查声明在本文件的要求：入口发现的要求可能落在其他文件，放到本文件里检查会误报 missing。
    const contractRequirements = requirements.filter((item) => item.file === 'pkg/contracts.ts');
    const declaration = controlledDeclaration;

    await checkpoint('entry-discovery', () => {
      // 检查对象由根入口的导出符号追溯得到，而不是固定文件列表。
      expect(mutations).toContain('entry');
      expect([...requirements.map((item) => item.name)].sort()).toEqual(
        ['ExampleOutcome', 'ExampleCreateResult', 'ExampleClient', 'ExampleState'].sort(),
      );
      expect([...new Set(requirements.map((item) => item.file))]).toEqual(['pkg/contracts.ts']);
      // 入口新导出一个缺少注释的类型时被拒绝；入口不导出时不在检查范围。
      const directory = mkdtempSync(join(tmpdir(), 'entry-discovery-'));
      try {
        mkdirSync(join(directory, 'pkg/generated'), { recursive: true });
        writeFileSync(
          join(directory, 'pkg/types.ts'),
          'export type FreshShape = { field: string };\n',
        );
        writeFileSync(
          join(directory, 'pkg/generated/gen.ts'),
          'export type GeneratedShape = { field: string };\n',
        );
        writeFileSync(
          join(directory, 'pkg/index.ts'),
          "export type * from './types';\nexport type * from './generated/gen';\n",
        );
        const discovery = discoverEntryExports({
          root: directory,
          entry: join(directory, 'pkg/index.ts'),
        });
        // 入口重新导出的生成类型不带注释，但生成代码不在检查范围。
        expect(discovery.types.map((item) => item.name)).toEqual(['FreshShape']);
        expect(
          publicDocIssues(
            readFileSync(join(directory, 'pkg/types.ts'), 'utf8'),
            discovery.types as readonly DocRequirement[],
          ),
        ).toContain('FreshShape: missing Chinese JSDoc');
        writeFileSync(join(directory, 'pkg/index.ts'), "export type * from './generated/gen';\n");
        expect(
          discoverEntryExports({ root: directory, entry: join(directory, 'pkg/index.ts') }).types,
        ).toEqual([]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    await checkpoint('source-comment-structure', () => {
      expect(mutations).toContain('type');
      expect(
        publicDocIssues(removeNearestComment(source, 'export type ExampleState'), [
          { name: 'ExampleState' },
        ]),
      ).toContain('ExampleState: missing Chinese JSDoc');
      expect(mutations).toContain('field');
      expect(
        publicDocIssues(
          removeNearestComment(source, 'lastState: ExampleState'),
          contractRequirements,
        ),
      ).toContain('ExampleOutcome.lastState: missing Chinese JSDoc');
      expect(mutations).toContain('union-value');
      expect(
        publicDocIssues(removeNearestComment(source, "| 'window_elapsed'"), contractRequirements),
      ).toContain('ExampleOutcome.window_elapsed: missing Chinese JSDoc');
      expect(mutations).toContain('boolean-value');
      expect(
        publicDocIssues(removeNearestComment(source, 'ok: true'), contractRequirements),
      ).toContain('ExampleCreateResult.true: missing Chinese JSDoc');
      expect(mutations).toContain('method');
      expect(
        publicDocIssues(removeNearestComment(source, 'observe(reference'), contractRequirements),
      ).toContain('ExampleClient.observe: missing Chinese JSDoc');
    });

    await checkpoint('every-declaration-site', () => {
      expect(mutations).toContain('shared-field');
      // 同一个类型里同名字段出现在两个声明位置：只注释第一处时，第二处仍被拒绝。
      expect(publicDocIssues(source, contractRequirements)).toEqual([]);
      expect(
        publicDocIssues(removeNearestComment(source, 'ok: false'), contractRequirements),
      ).toContain('ExampleCreateResult.ok: missing Chinese JSDoc');
      expect(
        publicDocIssues(removeNearestComment(source, 'ok: true'), contractRequirements),
      ).toContain('ExampleCreateResult.ok: missing Chinese JSDoc');
    });

    await checkpoint('dual-declaration-structure', () => {
      expect(mutations).toContain('declaration');
      expect(
        publicDocIssues(removeNearestComment(declaration, "| 'unknown'", 'ExampleState ='), [
          { name: 'ExampleState', values: ['unknown'] },
        ]),
      ).toContain('ExampleState.unknown: missing Chinese JSDoc');
    });
    rmSync(controlled.directory, { recursive: true, force: true });
  },
  { fixtureRoot },
);
