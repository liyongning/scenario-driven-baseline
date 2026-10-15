import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  cleanupArchitectureFixtures,
  createArchitectureFixture as fixture,
  expectedCruiseTargets,
  firstProductDirectory,
  writeRemovalFixture,
} from '../packages/e2e/tests/tooling/check-architecture-fixture.ts';
import { checkArchitecture, cruiseArguments, runArchitectureCli } from './check-architecture';
import { testPackage, loadProjectManifest } from './lib/project-manifest.ts';

afterEach(cleanupArchitectureFixtures);

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
  const test = testPackage(loadProjectManifest(root));
  rmSync(join(root, 'packages', test.directory, 'AGENTS.md'));
  writeFileSync(join(root, 'AGENTS.md'), '[missing](missing.md)');
  expect(await checkArchitecture(root, 0)).toEqual(
    expect.arrayContaining([
      `missing packages/${test.directory}/AGENTS.md`,
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
  const test = testPackage(loadProjectManifest(root));
  rmSync(join(root, 'packages', test.directory), { recursive: true });
  expect(await checkArchitecture(root, 0)).toContain(
    `missing package directory packages/${test.directory}`,
  );
});

test('第四个包、未知职责目录及产品测试导出被拒绝', async () => {
  const root = fixture();
  const manifest = loadProjectManifest(root);
  const product = manifest.packages.find((pkg) => pkg.role === 'product')!;
  mkdirSync(join(root, 'packages/fourth'));
  mkdirSync(join(root, 'packages', product.directory, 'ui'));
  const p = join(root, 'packages', product.directory, 'package.json');
  const packageManifest = JSON.parse(readFileSync(p, 'utf8'));
  packageManifest.exports = { './testing': './testing/index.ts' };
  writeFileSync(p, JSON.stringify(packageManifest));
  expect(await checkArchitecture(root, 0)).toEqual(
    expect.arrayContaining([
      'unexpected package fourth',
      `unexpected directory packages/${product.directory}/ui`,
      `private entry exported by ${product.directory}`,
    ]),
  );
});

test('包名、private 标识、反向依赖与必需命令错误被拒绝', async () => {
  const root = fixture();
  const projectManifest = loadProjectManifest(root);
  const protocol = projectManifest.packages.find((pkg) => pkg.role === 'protocol')!;
  const product = projectManifest.packages.find((pkg) => pkg.role === 'product')!;
  const testPackage = projectManifest.packages.find((pkg) => pkg.role === 'test')!;
  const p = join(root, 'packages', protocol.directory, 'package.json');
  const packageManifest = JSON.parse(readFileSync(p, 'utf8'));
  packageManifest.name = 'wrong';
  packageManifest.dependencies = { [product.name]: 'workspace:*' };
  writeFileSync(p, JSON.stringify(packageManifest));
  writeFileSync(
    join(root, 'packages', testPackage.directory, 'package.json'),
    JSON.stringify({ name: testPackage.name, private: false }),
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({}));
  const errors = await checkArchitecture(root, 0);
  expect(errors).toContain(`wrong package name ${protocol.directory}`);
  expect(errors).toContain(`${protocol.directory} cannot depend on products or E2E`);
  expect(errors).toContain(`${testPackage.directory} must be private`);
  expect(errors).toContain(`missing command ${projectManifest.requiredCommands[0]}`);
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
      const pairedProduct = firstProductDirectory(paired);
      mkdirSync(join(paired, 'packages', pairedProduct, 'src'), { recursive: true });
      writeFileSync(join(paired, 'packages', pairedProduct, 'src/data.json'), '{}\n');
      writeFileSync(
        join(paired, 'packages', pairedProduct, 'src/marked.ts'),
        '// template-example:begin\n// 普通注释不算标记\nconst example = 1;\n// template-example:end\n',
      );
      context.expect(await checkArchitecture(paired, 0)).toEqual([]);

      const unclosed = fixture();
      const unclosedProduct = firstProductDirectory(unclosed);
      mkdirSync(join(unclosed, 'packages', unclosedProduct, 'src'), { recursive: true });
      writeFileSync(
        join(unclosed, 'packages', unclosedProduct, 'src/marked.ts'),
        'const before = 1;\n// template-example:begin\nconst example = 1;\n',
      );
      context
        .expect(await checkArchitecture(unclosed, 0))
        .toContain(
          `packages/${unclosedProduct}/src/marked.ts:2: template-example:begin 没有对应的 end`,
        );

      const extra = fixture();
      const extraProduct = firstProductDirectory(extra);
      mkdirSync(join(extra, 'packages', extraProduct, 'src'), { recursive: true });
      writeFileSync(
        join(extra, 'packages', extraProduct, 'src/marked.ts'),
        '// template-example:end\n',
      );
      context
        .expect(await checkArchitecture(extra, 0))
        .toContain(
          `packages/${extraProduct}/src/marked.ts:1: template-example:end 没有对应的 begin`,
        );

      const nested = fixture();
      const nestedProduct = firstProductDirectory(nested);
      mkdirSync(join(nested, 'packages', nestedProduct, 'src'), { recursive: true });
      writeFileSync(
        join(nested, 'packages', nestedProduct, 'src/marked.ts'),
        '// template-example:begin\n// template-example:begin\n// template-example:end\n// template-example:end\n',
      );
      context
        .expect(await checkArchitecture(nested, 0))
        .toContain(`packages/${nestedProduct}/src/marked.ts:2: template-example 标记不允许嵌套`);

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
      writeFileSync(
        join(outside, 'packages', firstProductDirectory(outside), 'notes.ts'),
        '// template-example:begin\n',
      );
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
      writeRemovalFixture(partial, {
        directories: ['openspec/specs/template-example'],
      });
      const guide = readFileSync(join(partial, 'docs/template-guide.md'), 'utf8');
      writeFileSync(
        join(partial, 'docs/template-guide.md'),
        guide.replace('`openspec/specs/template-example/`', ''),
      );
      context
        .expect(await checkArchitecture(partial, 0))
        .toContain('missing removal whitelist entry openspec/specs/template-example/');

      const missingWebExample = fixture();
      writeRemovalFixture(missingWebExample, {
        directories: ['openspec/specs/web-example'],
      });
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
      const fixtureManifest = loadProjectManifest(fixtureDriven);
      const fixtureProduct = fixtureManifest.packages.find((pkg) => pkg.role === 'product')!;
      const fixtureTest = testPackage(fixtureManifest);
      const fixtureGeneratedPath = `packages/${fixtureTest.directory}/tests/fixtures/SCN-OPENAPI-CONTRACT-021/fixture-matrix.json`;
      writeRemovalFixture(fixtureDriven, {
        directories: [`packages/${fixtureProduct.directory}/src/fixture-directory`],
        files: ['packages/web/src/fixture-only.ts'],
        globs: [
          { directory: `packages/${fixtureProduct.directory}/src`, prefixes: ['fixture-glob-'] },
        ],
        matrices: [
          {
            fixture: fixtureGeneratedPath,
            declaration: 'packages/web/src/app/consumed-operations.ts',
          },
        ],
      });
      context
        .expect(await checkArchitecture(fixtureDriven, 0))
        .toContain('missing removal whitelist entry packages/web/src/fixture-only.ts');
      context
        .expect(await checkArchitecture(fixtureDriven, 0))
        .toEqual(
          expect.arrayContaining([
            `missing removal whitelist entry packages/${fixtureProduct.directory}/src/fixture-directory/`,
            `missing removal whitelist entry packages/${fixtureProduct.directory}/src/fixture-glob-*`,
            `missing removal whitelist entry ${fixtureGeneratedPath}`,
          ]),
        );
      rmSync(
        join(
          fixtureDriven,
          'packages',
          fixtureTest.directory,
          'tests/fixtures/SCN-TEMPLATE-ENGINEERING-008',
        ),
        { recursive: true, force: true },
      );
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
          '`VERIFY_RUN_ID=<run-id> pnpm check:fast`、`SCN-SCENARIO_GATE_CHANGES=... pnpm check:fast`、`TEMPLATE_UNIT_MAX_WORKERS=<n> pnpm check:fast`',
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
      context
        .expect(errors)
        .not.toContain('unknown environment variable TEMPLATE_UNIT_MAX_WORKERS');
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
