import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  writeProjectMapFixture,
  writeTemplateGuideFixture,
} from '../packages/e2e/tests/tooling/helpers.ts';
import { checkArchitecture, cruiseArguments, runArchitectureCli } from './check-architecture';
import {
  testPackage,
  type ManifestPackage,
  type ProjectManifest,
  loadProjectManifest,
} from './lib/project-manifest.ts';
import { coreTsconfigInclude } from './lib/web-app-checks.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
type FixtureOptions = Readonly<{ additionalWebApp?: boolean }>;

function expectedCruiseTargets(manifest: ProjectManifest): string[] {
  return manifest.packages
    .filter((pkg) => pkg.role !== 'test')
    .flatMap((pkg) => {
      const roots = pkg.moduleRoots?.length ? pkg.moduleRoots : ['src'];
      return roots.map((root) => `packages/${pkg.directory}/${root}`);
    })
    .concat(`packages/${testPackage(manifest).directory}/src/shadow`);
}

function writePackageFixture(root: string, pkg: ManifestPackage, manifest: ProjectManifest): void {
  const directory = join(root, 'packages', pkg.directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'AGENTS.md'), '[root](../../AGENTS.md#rules)');
  const sourceManifest = join('packages', pkg.directory, 'package.json');
  if (existsSync(sourceManifest)) {
    writeFileSync(join(directory, 'package.json'), readFileSync(sourceManifest));
  } else {
    const binding = manifest.bindings.find((item) => item.product === pkg.directory);
    const protocol = manifest.packages.find((item) => item.directory === binding?.protocol);
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        version: '0.0.0',
        ...(pkg.private ? { private: true } : {}),
        dependencies: {
          ...(protocol ? { [protocol.name]: 'workspace:*' } : {}),
          ...(pkg.form === 'web-app' ? { '@vue/devtools-api': '1.0.0' } : {}),
        },
      }),
    );
  }
  if (pkg.form === 'web-app') {
    writeFileSync(
      join(directory, 'tsconfig.core.json'),
      JSON.stringify(
        {
          compilerOptions: { composite: true, lib: ['ES2022'], types: [] },
          include: coreTsconfigInclude(pkg),
        },
        null,
        2,
      ),
    );
  }
}

function fixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'template-architecture-'));
  roots.push(root);
  mkdirSync(join(root, 'packages'));
  writeFileSync(join(root, 'README.md'), '# facts');
  writeFileSync(join(root, 'AGENTS.md'), '[facts](README.md) [external](https://example.invalid)');
  writeFileSync(join(root, 'package.json'), readFileSync('package.json'));
  const manifest = JSON.parse(readFileSync('project.manifest.json', 'utf8')) as Omit<
    ProjectManifest,
    'packages' | 'bindings'
  > & {
    packages: ManifestPackage[];
    bindings: Array<ProjectManifest['bindings'][number]>;
  };
  if (options.additionalWebApp) {
    const protocol = manifest.packages.find((pkg) => pkg.protocolKind === 'idl')!;
    manifest.packages = [
      ...manifest.packages,
      {
        directory: 'web-idl',
        name: '@sample/web-idl',
        role: 'product',
        form: 'web-app',
        private: true,
        allowedDirectories: ['src'],
        moduleRoots: ['src'],
        globalStore: 'src/store/index.ts',
        consumedOperations: ['src/app/consumed-operations.ts'],
      },
    ];
    manifest.bindings = [
      ...manifest.bindings,
      {
        name: 'web-idl-browser',
        product: 'web-idl',
        protocol: protocol.directory,
        platforms: ['browser'],
      },
    ];
    for (const module of ['trade-create', 'trade-list', 'trade-status']) {
      mkdirSync(join(root, 'packages/web-idl/src', module), { recursive: true });
    }
  }
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  for (const pkg of manifest.packages) writePackageFixture(root, pkg, manifest);
  writeTemplateGuideFixture(root);
  writeProjectMapFixture(root);
  // 默认 CLI 分支调用真实 depcruise：放一个可执行替身，验证参数组装与退出码传递，不依赖真实解析。
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.bin/depcruise'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return root;
}

test('完整多包和可解析规则链接通过；依赖工具失败传递', async () => {
  const root = fixture();
  expect(await checkArchitecture(root, 0)).toEqual([]);
  expect(await checkArchitecture(root, 1)).toContain('dependency-cruiser failed');
  expect(
    await runArchitectureCli(['node', 'script', '--root', root, '--dependency-exit-code', '0']),
  ).toMatchObject({ issues: [], exitCode: 0 });
  expect(await runArchitectureCli([], root)).toMatchObject({ issues: [], exitCode: 0 });
  const manifest = loadProjectManifest(root);
  expect(cruiseArguments(root, manifest)).toEqual([
    '--config',
    resolve(root, '.dependency-cruiser.cjs'),
    '--output-type',
    'err-long',
    ...expectedCruiseTargets(manifest),
  ]);
  await expect(
    runArchitectureCli(['node', 'script', '--dependency-exit-code', '-1'], root),
  ).rejects.toThrow(/non-negative integer/);
  await expect(
    runArchitectureCli(['node', 'script', '--dependency-exit-code', 'bad'], root),
  ).rejects.toThrow(/non-negative integer/);
});

test('新增 web-app 包与绑定后，架构检查和 cruise 参数继续按清单派生', async () => {
  const root = fixture({ additionalWebApp: true });
  const manifest = loadProjectManifest(root);
  expect(await checkArchitecture(root, 0)).toEqual([]);
  expect(cruiseArguments(root, manifest)).toEqual([
    '--config',
    resolve(root, '.dependency-cruiser.cjs'),
    '--output-type',
    'err-long',
    ...expectedCruiseTargets(manifest),
  ]);
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
  expect(errors).toContain('protocol cannot depend on products or E2E');
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
      context.expect(errors).toContain('missing guide section ## 移除模板示例');
      context.expect(errors).toContain('missing guide section ## 归档已知限制');
      context.expect(errors).toContain('missing guide section ## 版本对齐');
      context.expect(errors).toContain('missing guide section ## 使用方约定');
      context.expect(errors).toContain('missing guide section ## 复刻验收');
      context.expect(errors).toContain('missing guide section ## 移除一条绑定');
      context.expect(errors).toContain('missing guide section ## 跨源部署');
      context.expect(errors).toContain('missing guide section ### 产品形态');
      context.expect(errors).toContain('missing guide section ### 本地预览');
      context.expect(errors).toContain('missing guide section ### 包发布');
      const partial = fixture();
      const guide = readFileSync(join(partial, 'docs/template-guide.md'), 'utf8');
      writeFileSync(
        join(partial, 'docs/template-guide.md'),
        guide.replace('`openspec/specs/template-example/`', ''),
      );
      context
        .expect(await checkArchitecture(partial, 0))
        .toContain('missing removal whitelist entry openspec/specs/template-example/');

      const missingWebExample = fixture();
      writeFileSync(
        join(missingWebExample, 'docs/template-guide.md'),
        readFileSync(join(missingWebExample, 'docs/template-guide.md'), 'utf8').replace(
          'openspec/specs/web-example/',
          '',
        ),
      );
      context
        .expect(await checkArchitecture(missingWebExample, 0))
        .toContain('missing removal whitelist entry openspec/specs/web-example/');

      const fixtureDriven = fixture();
      const removalFixture = join(
        fixtureDriven,
        'packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008',
      );
      mkdirSync(removalFixture, { recursive: true });
      writeFileSync(
        join(removalFixture, 'example-removal.json'),
        JSON.stringify({
          removal: {
            directories: ['packages/sdk/src/fixture-directory'],
            files: ['packages/web/src/fixture-only.ts'],
            globs: [
              {
                directory: 'packages/sdk/src',
                prefixes: ['fixture-glob-'],
              },
            ],
            matrices: [
              {
                fixture: 'packages/e2e/tests/fixtures/SCN-OPENAPI-CONTRACT-021/fixture-matrix.json',
                owner: 'SCN-OPENAPI-CONTRACT-021',
                kind: 'openapi-plans',
                declaration: 'packages/web/src/app/consumed-operations.ts',
              },
            ],
          },
        }),
      );
      context
        .expect(await checkArchitecture(fixtureDriven, 0))
        .toContain('missing removal whitelist entry packages/web/src/fixture-only.ts');
      context
        .expect(await checkArchitecture(fixtureDriven, 0))
        .toEqual(
          expect.arrayContaining([
            'missing removal whitelist entry packages/sdk/src/fixture-directory/',
            'missing removal whitelist entry packages/sdk/src/fixture-glob-*',
            'missing removal whitelist entry packages/e2e/tests/fixtures/SCN-OPENAPI-CONTRACT-021/fixture-matrix.json',
          ]),
        );
      rmSync(removalFixture, { recursive: true, force: true });
      context.expect(await checkArchitecture(fixtureDriven, 0)).toEqual([]);
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
          '路径里的 ID 不算引用：`packages/e2e/tests/fixtures/SCN-SAMPLE-998/evidence.json`、`packages/e2e/tests/tooling/SCN-SAMPLE-997.spec.ts`',
          '路径末尾的 ID 仍算引用：`packages/e2e/tests/fixtures/SCN-SAMPLE-996`',
          '后面跟中文标点 SCN-SAMPLE-995。',
          '后面跟空格 SCN-SAMPLE-994 的引用',
          'SCN-SAMPLE-993',
          '',
          '## 从方案到验收',
          '',
          '`pnpm check:fast`、`pnpm install`、`pnpm --filter x build`、`pnpm nope`',
          '',
          '`VERIFY_RUN_ID=<run-id> pnpm check:fast`、`SCN-SCENARIO_GATE_CHANGES=... pnpm check:fast`',
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
          'SCN-SAMPLE-992',
        ].join('\n'),
      );
      const errors = await checkArchitecture(root, 0);
      context
        .expect(errors)
        .toEqual(
          expect.arrayContaining([
            'unregistered Scenario ID SCN-SAMPLE-999',
            'unknown pnpm command nope',
            'unknown environment variable SCN-SCENARIO_GATE_CHANGES',
            'unknown manifest field manifest.nope.deeper',
            'unknown manifest field manifest.fingerprints.sourceRoots.x',
          ]),
        );
      context.expect(errors).not.toContain('unknown environment variable VERIFY_RUN_ID');
      context.expect(errors).not.toContain('unregistered Scenario ID SCN-SAMPLE-001');
      context.expect(errors).not.toContain('unregistered Scenario ID SCN-SAMPLE-998');
      context.expect(errors).not.toContain('unregistered Scenario ID SCN-SAMPLE-997');
      context.expect(errors).toContain('unregistered Scenario ID SCN-SAMPLE-996');
      context.expect(errors).toContain('unregistered Scenario ID SCN-SAMPLE-995');
      context.expect(errors).toContain('unregistered Scenario ID SCN-SAMPLE-994');
      context.expect(errors).toContain('unregistered Scenario ID SCN-SAMPLE-993');
      context.expect(errors).toContain('unregistered Scenario ID SCN-SAMPLE-992');
      context.expect(errors).not.toContain('unknown pnpm command check:fast');
      context.expect(errors).not.toContain('unknown pnpm command install');
      context.expect(errors.some((error) => error.includes('--filter'))).toBe(false);
      context.expect(errors).not.toContain('unknown manifest field manifest.packages[].directory');
      // 技术架构文档里的 Scenario ID 同样要在有效 Spec 中登记（ENG-06 的路径口径）。
      const architecturePath = join(root, 'docs/architecture.md');
      const architecture = readFileSync(architecturePath, 'utf8');
      writeFileSync(
        architecturePath,
        `${architecture}\n未登记的引用：SCN-SAMPLE-991\n路径里的不算：packages/e2e/tests/fixtures/SCN-SAMPLE-990/evidence.json\n`,
      );
      const withArchitecture = await checkArchitecture(root, 0);
      context
        .expect(withArchitecture)
        .toContain('unregistered Scenario ID SCN-SAMPLE-991 (docs/architecture.md)');
      context
        .expect(withArchitecture)
        .not.toContain('unregistered Scenario ID SCN-SAMPLE-990 (docs/architecture.md)');
      writeFileSync(architecturePath, architecture);
      context
        .expect(await checkArchitecture(root, 0))
        .not.toContain('unregistered Scenario ID SCN-SAMPLE-991 (docs/architecture.md)');
    });
  },
);

evidence(
  'SCN-TEMPLATE-ENGINEERING-012',
  'architecture-doc-rules',
  ['architecture-present-and-linked', 'capability-sections', 'architecture-links-resolve'],
  async (context, check) => {
    await check('architecture-present-and-linked', async () => {
      const missing = fixture();
      rmSync(join(missing, 'docs/architecture.md'));
      context.expect(await checkArchitecture(missing, 0)).toContain('missing docs/architecture.md');

      const unlinked = fixture();
      writeFileSync(join(unlinked, 'AGENTS.md'), '# facts\n');
      writeFileSync(join(unlinked, 'README.md'), '# facts\n');
      const errors = await checkArchitecture(unlinked, 0);
      context.expect(errors).toContain('AGENTS.md does not link docs/architecture.md');
      context.expect(errors).toContain('README.md does not link docs/architecture.md');
    });

    await check('capability-sections', async () => {
      const root = fixture();
      const guide = readFileSync(join(root, 'docs/template-guide.md'), 'utf8');
      writeFileSync(
        join(root, 'docs/template-guide.md'),
        guide.replace(
          '| Web 示例 | 临时根占位 | 无 |',
          '| Web 示例 | 临时根占位 | 无 |\n| 未登记能力 | 临时根占位 | 无 |',
        ),
      );
      context
        .expect(await checkArchitecture(root, 0))
        .toContain('docs/architecture.md: missing capability section 未登记能力');

      const noTable = fixture();
      writeFileSync(
        join(noTable, 'docs/template-guide.md'),
        '# 指南\n\n## 能力地图\n\n（缺表格）\n',
      );
      context
        .expect(await checkArchitecture(noTable, 0))
        .toContain('docs/template-guide.md: capability map table not found');
    });

    await check('architecture-links-resolve', async () => {
      const root = fixture();
      writeFileSync(
        join(root, 'docs/architecture.md'),
        `${readFileSync(join(root, 'docs/architecture.md'), 'utf8')}\n[存在](template-guide.md)、[缺失](missing.md)\n`,
      );
      const errors = await checkArchitecture(root, 0);
      context
        .expect(errors.filter((error) => error.startsWith('broken link')))
        .toEqual(['broken link docs/architecture.md -> missing.md']);
    });
  },
);
