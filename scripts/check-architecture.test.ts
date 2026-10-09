import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeTemplateGuideFixture } from '../packages/e2e/tests/tooling/helpers.ts';
import { checkArchitecture, cruiseArguments, runArchitectureCli } from './check-architecture';
import { loadProjectManifest } from './lib/project-manifest.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'template-architecture-'));
  roots.push(root);
  mkdirSync(join(root, 'packages'));
  writeFileSync(join(root, 'README.md'), '# facts');
  writeFileSync(join(root, 'AGENTS.md'), '[facts](README.md) [external](https://example.invalid)');
  writeFileSync(join(root, 'package.json'), readFileSync('package.json'));
  writeFileSync(join(root, 'project.manifest.json'), readFileSync('project.manifest.json'));
  for (const name of ['sdk', 'protocol', 'e2e']) {
    const dir = join(root, 'packages', name);
    mkdirSync(dir);
    writeFileSync(join(dir, 'AGENTS.md'), '[root](../../AGENTS.md#rules)');
    writeFileSync(join(dir, 'package.json'), readFileSync(`packages/${name}/package.json`));
  }
  writeTemplateGuideFixture(root);
  // 默认 CLI 分支调用真实 depcruise：放一个可执行替身，验证参数组装与退出码传递，不依赖真实解析。
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.bin/depcruise'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return root;
}

test('完整三包和可解析规则链接通过；依赖工具失败传递', async () => {
  const root = fixture();
  expect(await checkArchitecture(root, 0)).toEqual([]);
  expect(await checkArchitecture(root, 1)).toContain('dependency-cruiser failed');
  expect(
    await runArchitectureCli(['node', 'script', '--root', root, '--dependency-exit-code', '0']),
  ).toMatchObject({ issues: [], exitCode: 0 });
  expect(await runArchitectureCli([], root)).toMatchObject({ issues: [], exitCode: 0 });
  expect(cruiseArguments(root, loadProjectManifest(root))).toEqual([
    '--config',
    resolve(root, '.dependency-cruiser.cjs'),
    '--output-type',
    'err-long',
    'packages/sdk/src',
    'packages/protocol/src',
    'packages/protocol/testing',
  ]);
  await expect(
    runArchitectureCli(['node', 'script', '--dependency-exit-code', '-1'], root),
  ).rejects.toThrow(/non-negative integer/);
  await expect(
    runArchitectureCli(['node', 'script', '--dependency-exit-code', 'bad'], root),
  ).rejects.toThrow(/non-negative integer/);
});

test('依赖工具不可执行时按失败处理', async () => {
  const root = fixture();
  rmSync(join(root, 'node_modules/.bin/depcruise'), { force: true });
  const result = await runArchitectureCli([], root);
  expect(result.issues).toContain('dependency-cruiser failed');
  expect(result.exitCode).toBe(1);
});

test('缺失 AGENTS 和断链被拒绝', async () => {
  const root = fixture();
  rmSync(join(root, 'packages/e2e/AGENTS.md'));
  writeFileSync(join(root, 'AGENTS.md'), '[missing](missing.md)');
  expect(await checkArchitecture(root, 0)).toEqual(
    expect.arrayContaining([
      'missing packages/e2e/AGENTS.md',
      'broken link AGENTS.md -> missing.md',
    ]),
  );
});

test('缺少项目清单时直接报告清单错误', async () => {
  const root = fixture();
  rmSync(join(root, 'project.manifest.json'));
  expect((await checkArchitecture(root, 1)).join('\n')).toContain(
    'project.manifest.json cannot be read',
  );
});

test('清单登记但缺失的包目录被报告', async () => {
  const root = fixture();
  rmSync(join(root, 'packages/e2e'), { recursive: true });
  expect(await checkArchitecture(root, 0)).toContain('missing package directory packages/e2e');
});

test('第四个包、未知职责目录及产品测试导出被拒绝', async () => {
  const root = fixture();
  mkdirSync(join(root, 'packages/fourth'));
  mkdirSync(join(root, 'packages/sdk/ui'));
  const p = join(root, 'packages/sdk/package.json');
  const manifest = JSON.parse(readFileSync(p, 'utf8'));
  manifest.exports['./testing'] = './testing/index.ts';
  writeFileSync(p, JSON.stringify(manifest));
  expect(await checkArchitecture(root, 0)).toEqual(
    expect.arrayContaining([
      'unexpected package fourth',
      'unexpected directory packages/sdk/ui',
      'private entry exported by sdk',
    ]),
  );
});

test('包名、private 标识、反向依赖与必需命令错误被拒绝', async () => {
  const root = fixture();
  const p = join(root, 'packages/protocol/package.json');
  const manifest = JSON.parse(readFileSync(p, 'utf8'));
  manifest.name = 'wrong';
  manifest.dependencies = { '@daqian/template-sdk': 'workspace:*' };
  writeFileSync(p, JSON.stringify(manifest));
  writeFileSync(
    join(root, 'packages/e2e/package.json'),
    JSON.stringify({ name: '@daqian/template-e2e', private: false }),
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({}));
  const errors = await checkArchitecture(root, 0);
  expect(errors).toContain('wrong package name protocol');
  expect(errors).toContain('protocol cannot depend on SDK/E2E');
  expect(errors).toContain('e2e must be private');
  expect(errors).toContain('missing command typecheck');
});

function evidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `${id} ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: id,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id, caseKey: caseId, checks }],
        },
      },
    },
    async (context: TestContext) => {
      const before = context.expect.getState().assertionCalls;
      const executed: string[] = [];
      await body(context, async (name, assertion) => {
        await assertion();
        executed.push(name);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

evidence(
  'SCN-TEMPLATE-ENGINEERING-006',
  'example-marker-rules',
  ['example-markers-paired'],
  async (context, check) => {
    await check('example-markers-paired', async () => {
      const paired = fixture();
      mkdirSync(join(paired, 'packages/sdk/src'), { recursive: true });
      writeFileSync(join(paired, 'packages/sdk/src/data.json'), '{}\n');
      writeFileSync(
        join(paired, 'packages/sdk/src/marked.ts'),
        '// template-example:begin\n// 普通注释不算标记\nconst example = 1;\n// template-example:end\n',
      );
      context.expect(await checkArchitecture(paired, 0)).toEqual([]);

      const unclosed = fixture();
      mkdirSync(join(unclosed, 'packages/sdk/src'), { recursive: true });
      writeFileSync(
        join(unclosed, 'packages/sdk/src/marked.ts'),
        'const before = 1;\n// template-example:begin\nconst example = 1;\n',
      );
      context
        .expect(await checkArchitecture(unclosed, 0))
        .toContain('packages/sdk/src/marked.ts:2: template-example:begin 没有对应的 end');

      const extra = fixture();
      mkdirSync(join(extra, 'packages/sdk/src'), { recursive: true });
      writeFileSync(join(extra, 'packages/sdk/src/marked.ts'), '// template-example:end\n');
      context
        .expect(await checkArchitecture(extra, 0))
        .toContain('packages/sdk/src/marked.ts:1: template-example:end 没有对应的 begin');

      const nested = fixture();
      mkdirSync(join(nested, 'packages/sdk/src'), { recursive: true });
      writeFileSync(
        join(nested, 'packages/sdk/src/marked.ts'),
        '// template-example:begin\n// template-example:begin\n// template-example:end\n// template-example:end\n',
      );
      context
        .expect(await checkArchitecture(nested, 0))
        .toContain('packages/sdk/src/marked.ts:2: template-example 标记不允许嵌套');

      const markdown = fixture();
      writeFileSync(
        join(markdown, 'README.md'),
        '<!-- 说明 -->\n<!-- template-example:begin -->\n',
      );
      context
        .expect(await checkArchitecture(markdown, 0))
        .toContain('README.md:2: template-example:begin 没有对应的 end');

      // 模块根之外的文件不属于示例裁剪范围，不参与标记校验。
      const outside = fixture();
      writeFileSync(join(outside, 'packages/sdk/notes.ts'), '// template-example:begin\n');
      context.expect(await checkArchitecture(outside, 0)).toEqual([]);
    });
  },
);

evidence(
  'SCN-TEMPLATE-ENGINEERING-006',
  'guide-rules',
  ['guide-present-and-linked', 'guide-sections', 'guide-links-resolve', 'guide-facts-consistent'],
  async (context, check) => {
    await check('guide-present-and-linked', async () => {
      const missing = fixture();
      rmSync(join(missing, 'docs/template-guide.md'));
      context
        .expect(await checkArchitecture(missing, 0))
        .toContain('missing docs/template-guide.md');
      const unlinked = fixture();
      writeFileSync(join(unlinked, 'AGENTS.md'), '# facts\n');
      writeFileSync(join(unlinked, 'README.md'), '# facts\n');
      const unlinkedErrors = await checkArchitecture(unlinked, 0);
      context.expect(unlinkedErrors).toContain('AGENTS.md does not link docs/template-guide.md');
      context.expect(unlinkedErrors).toContain('README.md does not link docs/template-guide.md');
      rmSync(join(unlinked, 'README.md'));
      context
        .expect(await checkArchitecture(unlinked, 0))
        .toContain('README.md does not link docs/template-guide.md');
    });

    await check('guide-sections', async () => {
      const root = fixture();
      writeFileSync(join(root, 'docs/template-guide.md'), '# guide\n\n## 能力地图\n');
      const errors = await checkArchitecture(root, 0);
      context.expect(errors).toContain('missing guide section ## 从方案到验收');
      context.expect(errors).toContain('missing guide section ### 包发布');
    });

    await check('guide-links-resolve', async () => {
      const root = fixture();
      writeFileSync(
        join(root, 'docs/template-guide.md'),
        '# guide\n\n## 能力地图\n\n## 从方案到验收\n\n## 初始化方式\n\n## 替换点地图\n\n### 协议来源\n\n### 运行平台\n\n### 包发布\n\n[外部](https://example.invalid)、[锚点](#能力地图)、[存在](../README.md)、[缺失](missing.md)\n',
      );
      const errors = await checkArchitecture(root, 0);
      context
        .expect(errors.filter((error) => error.startsWith('broken link')))
        .toEqual(['broken link docs/template-guide.md -> missing.md']);
    });

    await check('guide-facts-consistent', async () => {
      const root = fixture();
      mkdirSync(join(root, 'openspec/specs/sample'), { recursive: true });
      writeFileSync(
        join(root, 'openspec/specs/sample/spec.md'),
        '### Requirement: sample\n\n#### Scenario: SCN-SAMPLE-001 sample\n',
      );
      writeFileSync(
        join(root, 'docs/template-guide.md'),
        [
          '# guide',
          '',
          '## 能力地图',
          '',
          '`SCN-SAMPLE-001`、`SCN-SAMPLE-999`',
          '',
          '## 从方案到验收',
          '',
          '`pnpm check:fast`、`pnpm install`、`pnpm --filter x build`、`pnpm nope`',
          '',
          '## 初始化方式',
          '',
          '`manifest.packages[].directory`、`manifest.nope.deeper`、`manifest.fingerprints.sourceRoots.x`',
          '',
          '## 替换点地图',
          '',
          '### 协议来源',
          '',
          '### 运行平台',
          '',
          '### 包发布',
          '',
        ].join('\n'),
      );
      const errors = await checkArchitecture(root, 0);
      context
        .expect(errors)
        .toEqual(
          expect.arrayContaining([
            'unregistered Scenario ID SCN-SAMPLE-999',
            'unknown pnpm command nope',
            'unknown manifest field manifest.nope.deeper',
            'unknown manifest field manifest.fingerprints.sourceRoots.x',
          ]),
        );
      context.expect(errors).not.toContain('unregistered Scenario ID SCN-SAMPLE-001');
      context.expect(errors).not.toContain('unknown pnpm command check:fast');
      context.expect(errors).not.toContain('unknown pnpm command install');
      context.expect(errors.some((error) => error.includes('--filter'))).toBe(false);
      context.expect(errors).not.toContain('unknown manifest field manifest.packages[].directory');
    });
  },
);

// 运行真实 dependency-cruiser CLI；不以手造依赖图代替解析/退出码验证。
function importFixture(source: string) {
  const root = fixture();
  writeFileSync(join(root, '.dependency-cruiser.cjs'), readFileSync('.dependency-cruiser.cjs'));
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  writeFileSync(
    join(root, 'scripts/lib/dependency-rules.cjs'),
    readFileSync('scripts/lib/dependency-rules.cjs'),
  );
  writeFileSync(join(root, 'tsconfig.base.json'), readFileSync('tsconfig.base.json'));
  for (const name of ['sdk', 'protocol'])
    mkdirSync(join(root, 'packages', name, 'src'), { recursive: true });
  const protocol = join(root, 'packages/protocol');
  mkdirSync(join(protocol, 'src/generated'));
  writeFileSync(join(protocol, 'src/index.ts'), 'export type PublicType = string;');
  writeFileSync(join(protocol, 'src/generated/std.ts'), 'export const config = 1;');
  // 保留真实 package exports，模拟构建后的公开文件，覆盖源码别名与 dist 两条解析路径。
  mkdirSync(join(protocol, 'dist/generated'), { recursive: true });
  writeFileSync(join(protocol, 'dist/index.d.ts'), 'export type PublicType = string;');
  writeFileSync(join(protocol, 'dist/generated/std.d.ts'), 'export declare const config: number;');
  const modules = join(root, 'packages/sdk/node_modules/@daqian');
  mkdirSync(modules, { recursive: true });
  symlinkSync(protocol, join(modules, 'template-protocol'), 'dir');
  writeFileSync(join(root, 'packages/sdk/src/export-bypass.ts'), source);
  return spawnSync(
    resolve('node_modules/.bin/depcruise'),
    [
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'err-long',
      'packages/sdk/src/export-bypass.ts',
    ],
    { cwd: root, encoding: 'utf8' },
  );
}

test.each([
  "export { config } from '../../protocol/src/generated/std';",
  "export type { PublicType } from '../../protocol/src/index';",
  "export const load = () => import('../../protocol/src/generated/std');",
  "export { config } from '../../protocol/dist/generated/std.d.ts';",
  "export { config } from 'packages/protocol/src/generated/std';",
])('真实 CLI 拒绝绕过 exports 的跨包源文件导入：%s', (source) => {
  const result = importFixture(source);
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain('cross-workspace-no-direct-files');
});

test('真实 CLI 接受完整 npm 名称的 root 和 generated 公开子入口', () => {
  const result = importFixture(
    "export type { PublicType } from '@daqian/template-protocol';\nexport { config } from '@daqian/template-protocol/generated/std';",
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
