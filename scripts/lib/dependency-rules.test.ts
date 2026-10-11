import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { minimalManifest } from '../../packages/e2e/tests/tooling/controlled-root.ts';
import { loadProjectManifest, type ProjectManifest } from './project-manifest.ts';

/** 模板自身事实核验：只读真实仓库的清单与契约，不读取门禁实时状态。 */
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** 临时清单根：只写入一份清单，用于清单 schema 的接受/拒绝判据。 */
function manifestRoot(manifest: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'dependency-rules-'));
  roots.push(root);
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  const packages =
    (manifest as { packages?: ReadonlyArray<Record<string, unknown>> }).packages ?? [];
  const protocols = packages.filter(
    (pkg): pkg is Record<string, unknown> & { name: string } =>
      pkg.role === 'protocol' && typeof pkg.name === 'string',
  );
  for (const pkg of packages) {
    if (typeof pkg.directory !== 'string' || typeof pkg.name !== 'string') continue;
    const directory = join(root, 'packages', pkg.directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        private: pkg.private,
        ...(pkg.role === 'product'
          ? {
              dependencies: Object.fromEntries(
                protocols.map((protocol) => [protocol.name, 'workspace:*']),
              ),
            }
          : {}),
      }),
    );
  }
  return root;
}

/** 取配置块；块缺失属于夹具事实错误，直接抛出而不是静默跳过。 */
function blockAt(config: ReadonlyArray<MaxLinesBlock>, index: number): MaxLinesBlock {
  const block = config[index];
  if (!block) throw new Error(`missing max-lines block ${index}`);
  return block;
}

/** 把清单里的测试包改名，用来证明测试文件模式随清单派生而不是写死。 */
function renamedTestManifest(): ProjectManifest {
  const manifest = loadProjectManifest(repositoryRoot);
  return {
    ...manifest,
    packages: manifest.packages.map((pkg) =>
      pkg.role === 'test' ? { ...pkg, directory: 'renamed-e2e', name: '@sample/renamed-e2e' } : pkg,
    ),
  };
}

/** 依赖规则生成函数在 CJS 中实现，供 dependency-cruiser 配置与 eslint 配置共用。 */
type Rule = Readonly<{ name: string; from: { path: string; pathNot?: string } }>;
type Rules = Readonly<{
  escapeRegExp(value: string): string;
  packagesByRole(
    manifest: ProjectManifest,
    role: string,
  ): ReadonlyArray<{ directory: string; name: string }>;
  testPackage(manifest: ProjectManifest): { directory: string; name: string };
  bindingForProduct(
    manifest: ProjectManifest,
    productDirectory: string,
  ): { name: string; product: string; protocol: string; platforms: ReadonlyArray<string> };
  moduleRoots(pkg: Readonly<{ moduleRoots?: ReadonlyArray<string> }>): string[];
  sourceRoot(pkg: Readonly<{ moduleRoots?: ReadonlyArray<string> }>): string;
  modulePath(
    pkg: Readonly<{ directory: string; moduleRoots?: ReadonlyArray<string> }>,
    roots?: ReadonlyArray<string>,
  ): string;
  cruiseTargets(manifest: ProjectManifest): string[];
  dependencyRules(manifest: ProjectManifest): ReadonlyArray<Rule>;
  restrictedGlobalFiles(manifest: ProjectManifest): string[];
  runtimeFile(manifest: ProjectManifest): string;
  SOURCE_MAX_LINES: number;
  TEST_MAX_LINES: number;
  testFilePatterns(manifest: ProjectManifest): ReadonlyArray<string>;
  maxLinesExemptions(
    manifest: ProjectManifest,
  ): ReadonlyArray<Readonly<{ path: string; reason: string }>>;
  maxLinesConfig(manifest: ProjectManifest): ReadonlyArray<MaxLinesBlock>;
}>;

/** `maxLinesConfig` 返回的一个 ESLint 配置块：命中文件与规则设置。 */
type MaxLinesBlock = Readonly<{
  files: ReadonlyArray<string>;
  rules: Readonly<Record<string, unknown>>;
}>;

const rules = createRequire(import.meta.url)('./dependency-rules.cjs') as Rules;

/** 与 project-manifest.test.ts 相同的 module 证据登记方式：每个 case 一段可核对断言。 */
async function evidence(
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

/** 把仓库清单改名成另一个包目录，用来证明规则随清单变化而不是写死。 */
function renamedManifest(): ProjectManifest {
  const manifest = loadProjectManifest(repositoryRoot);
  return {
    ...manifest,
    packages: manifest.packages.map((pkg) =>
      pkg.role === 'product'
        ? { ...pkg, directory: 'renamed-sdk', name: '@sample/renamed-sdk' }
        : pkg,
    ),
    bindings: manifest.bindings.map((binding) =>
      binding.product === 'sdk' ? { ...binding, product: 'renamed-sdk' } : binding,
    ),
  };
}

const ruleByName = (list: ReadonlyArray<Rule>, name: string): Rule => {
  const found = list.find((item) => item.name === name || item.name.startsWith(`${name}:`));
  if (!found) throw new Error(`missing rule ${name}`);
  return found;
};

evidence(
  'SCN-TEMPLATE-ENGINEERING-007',
  'rule-generation-by-manifest',
  ['rules-by-role'],
  async (context, check) => {
    await check('rules-by-role', () => {
      const repository = loadProjectManifest(repositoryRoot);
      const repositoryRules = rules.dependencyRules(repository);
      context
        .expect(ruleByName(repositoryRules, 'domain-core-no-generated').from.path)
        .toBe('^packages/sdk/src/[^/]+/(core|ports)/');
      context
        .expect(ruleByName(repositoryRules, 'cross-workspace-no-direct-files').from.path)
        .toBe('^packages/((?:sdk)|(?:protocol))/(?:src)/');
      context
        .expect(rules.cruiseTargets(repository))
        .toEqual([
          'packages/sdk/src',
          'packages/protocol/src',
          'packages/protocol/testing',
          'packages/e2e/src/shadow',
        ]);
      context
        .expect(rules.runtimeFile(repository))
        .toEqual(['packages/sdk/src/runtime/default.ts']);

      const renamed = renamedManifest();
      const renamedRules = rules.dependencyRules(renamed);
      context
        .expect(ruleByName(renamedRules, 'domain-core-no-generated').from.path)
        .toBe('^packages/renamed-sdk/src/[^/]+/(core|ports)/');
      context.expect(JSON.stringify(renamedRules)).not.toContain(['packages', 'sdk'].join('/'));
      context
        .expect(rules.cruiseTargets(renamed))
        .toEqual([
          'packages/renamed-sdk/src',
          'packages/protocol/src',
          'packages/protocol/testing',
          'packages/e2e/src/shadow',
        ]);
      context
        .expect(rules.restrictedGlobalFiles(renamed))
        .toEqual([
          'packages/renamed-sdk/src/*/core/**/*.ts',
          'packages/renamed-sdk/src/*/ports/**/*.ts',
        ]);
      context
        .expect(rules.runtimeFile(renamed))
        .toEqual(['packages/renamed-sdk/src/runtime/default.ts']);
    });
  },
);

test('shadow engine rule covers engine files but not route sources', () => {
  const rule = ruleByName(
    rules.dependencyRules(loadProjectManifest(repositoryRoot)),
    'shadow-engine-no-generated',
  );
  const path = new RegExp(rule.from.path);
  // pathNot 与 dependency-cruiser 同义：命中的引擎文件再被排除项减去。
  const pathNot = new RegExp(rule.from.pathNot!);
  const matched = (file: string) => path.test(file) && !pathNot.test(file);
  // 引擎文件（含后续新增的）受约束。
  for (const engine of ['server', 'faults', 'requests', 'routes', 'synthetic-engine'])
    expect(matched(`packages/e2e/src/shadow/${engine}.ts`), engine).toBe(true);
  expect(matched('packages/e2e/src/shadow/server.test.ts')).toBe(false);
  expect(matched('packages/protocol/testing/shadow/idl-routes.ts')).toBe(false);
});

test('escapeRegExp escapes regular expression metacharacters', () => {
  expect(rules.escapeRegExp('a.b*c(d)')).toBe('a\\.b\\*c\\(d\\)');
});

test('package readers use manifest roles without assuming a unique package', () => {
  const manifest = loadProjectManifest(repositoryRoot);
  expect(rules.packagesByRole(manifest, 'product').map((item) => item.name)).toEqual([
    '@daqian/template-sdk',
  ]);
  expect(rules.packagesByRole(manifest, 'unknown')).toEqual([]);
  expect(rules.packagesByRole({ packages: [] } as unknown as ProjectManifest, 'product')).toEqual(
    [],
  );
  expect(rules.packagesByRole({} as unknown as ProjectManifest, 'product')).toEqual([]);
  expect(rules.testPackage(manifest).directory).toBe('e2e');
  expect(rules.bindingForProduct(manifest, 'sdk')).toMatchObject({
    name: 'sdk-idl-weapp',
    protocol: 'protocol',
  });
  expect(() => rules.testPackage({ packages: [] } as unknown as ProjectManifest)).toThrow(
    /no test package/,
  );
  expect(() =>
    rules.bindingForProduct({ bindings: [] } as unknown as ProjectManifest, 'missing'),
  ).toThrow(/no binding for missing/);
  expect(() => rules.bindingForProduct({} as unknown as ProjectManifest, 'missing')).toThrow(
    /no binding for missing/,
  );
});

test('dependency rules skip an absent bound protocol and reject unbound protocol imports', () => {
  const manifest = structuredClone(minimalManifest()) as unknown as ProjectManifest;
  const packages = [
    ...manifest.packages,
    {
      directory: 'other-protocol',
      name: '@sample/other-protocol',
      role: 'protocol',
      protocolKind: 'openapi',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
  ];
  const withUnboundProtocol = {
    ...manifest,
    packages,
  } as ProjectManifest;
  expect(
    rules
      .dependencyRules(withUnboundProtocol)
      .some((rule) => rule.name.startsWith('product-bound-protocol-only:')),
  ).toBe(true);

  const missingBinding = {
    ...withUnboundProtocol,
    bindings: [{ ...manifest.bindings[0]!, protocol: 'missing' }],
  } as ProjectManifest;
  expect(
    rules
      .dependencyRules(missingBinding)
      .some((rule) => rule.name.startsWith('product-bound-protocol-exports-only:')),
  ).toBe(false);
});

test('module roots default to src and cruise targets skip the test package', () => {
  expect(rules.moduleRoots({})).toEqual(['src']);
  expect(rules.moduleRoots({ moduleRoots: ['lib'] })).toEqual(['lib']);
  expect(rules.sourceRoot({ moduleRoots: ['lib', 'other'] })).toBe('lib');
  expect(rules.modulePath({ directory: 'plain' })).toBe('^packages/plain/(?:src)/');
  expect(rules.modulePath({ directory: 'multi', moduleRoots: ['a', 'b'] }, ['b'])).toBe(
    '^packages/multi/(?:b)/',
  );
  expect(
    rules.cruiseTargets({
      packages: [
        {
          directory: 'prod',
          name: '@x/prod',
          role: 'product',
          private: false,
          allowedDirectories: [],
        },
        { directory: 'spec', name: '@x/spec', role: 'test', private: true, allowedDirectories: [] },
      ],
    } as unknown as ProjectManifest),
  ).toEqual(['packages/prod/src', 'packages/spec/src/shadow']);
});

evidence(
  'SCN-TEMPLATE-ENGINEERING-010',
  'baseline-config-rules',
  ['max-lines-enforced', 'exemptions-by-manifest', 'ignore-entries'],
  async (context, check) => {
    await check('max-lines-enforced', () => {
      // 两档上限与开关：源文件 300、测试文件 600，空行与注释都不计入。
      context.expect([rules.SOURCE_MAX_LINES, rules.TEST_MAX_LINES]).toEqual([300, 600]);
      const manifest = loadProjectManifest(repositoryRoot);
      const config = rules.maxLinesConfig(manifest);
      const source = blockAt(config, 0);
      const tests = blockAt(config, 1);
      context.expect(config).toHaveLength(2);
      context.expect(source.files).toEqual(['**/*.{js,mjs,cjs,ts,mts,cts,vue}']);
      context
        .expect(source.rules['max-lines'])
        .toEqual(['error', { max: 300, skipBlankLines: true, skipComments: true }]);
      context.expect(tests.files).toEqual(rules.testFilePatterns(manifest));
      context
        .expect(tests.rules['max-lines'])
        .toEqual(['error', { max: 600, skipBlankLines: true, skipComments: true }]);
      // 测试块排在源块之后：ESLint 后写覆盖，测试文件因此按 600 判。
      context.expect(config.indexOf(source)).toBeLessThan(config.indexOf(tests));
      // 测试文件集合只含代码扩展名，且测试包目录取自清单。
      const patterns = rules.testFilePatterns(manifest);
      context
        .expect(patterns)
        .toEqual([
          '**/*.test.{js,mjs,cjs,ts,mts,cts}',
          '**/*.spec.{js,mjs,cjs,ts,mts,cts}',
          'packages/e2e/tests/**/*.{js,mjs,cjs,ts,mts,cts}',
        ]);
      context
        .expect(patterns.every((pattern) => pattern.endsWith('{js,mjs,cjs,ts,mts,cts}')))
        .toBe(true);
      context
        .expect(rules.testFilePatterns(renamedTestManifest()).at(-1))
        .toBe('packages/renamed-e2e/tests/**/*.{js,mjs,cjs,ts,mts,cts}');
    });

    await check('exemptions-by-manifest', () => {
      // 模板自身的豁免为空：拆分是唯一出路，没有整文件豁免。
      const repository = loadProjectManifest(repositoryRoot);
      context.expect(rules.maxLinesExemptions(repository)).toEqual([]);
      context.expect(repository.quality?.maxLinesExemptions).toEqual([]);
      // 清单登记的豁免生成整文件关闭块，且只在源/测试两档之后追加。
      const exempted: ProjectManifest = {
        ...repository,
        quality: {
          coverageExclusions: [],
          maxLinesExemptions: [{ path: 'scripts/legacy.ts', reason: '历史文件待拆分' }],
        },
      };
      const config = rules.maxLinesConfig(exempted);
      const exemption = config.at(-1);
      context.expect(config).toHaveLength(3);
      context.expect(exemption?.files).toEqual(['scripts/legacy.ts']);
      context.expect(exemption?.rules['max-lines']).toBe('off');
      // 豁免只来自清单登记，且必须带理由（schema 拒绝缺理由的条目）。
      // 清单没有质量块时豁免为空（不回退到任何默认豁免）。
      context
        .expect(rules.maxLinesExemptions({ packages: [] } as unknown as ProjectManifest))
        .toEqual([]);
      const missingReason = manifestRoot({
        ...minimalManifest(),
        quality: { coverageExclusions: [], maxLinesExemptions: [{ path: 'scripts/legacy.ts' }] },
      });
      context.expect(() => loadProjectManifest(missingReason)).toThrow(/does not match/);
      const withReason = manifestRoot({
        ...minimalManifest(),
        quality: {
          coverageExclusions: [],
          maxLinesExemptions: [{ path: 'scripts/legacy.ts', reason: '历史文件待拆分' }],
        },
      });
      context
        .expect(rules.maxLinesExemptions(loadProjectManifest(withReason)))
        .toEqual([{ path: 'scripts/legacy.ts', reason: '历史文件待拆分' }]);
    });

    await check('ignore-entries', () => {
      // 根 .gitignore 不再忽略 openspec/schemas/（工作流 schema 由本地 exclude 处理）。
      const gitignore = readFileSync(join(repositoryRoot, '.gitignore'), 'utf8')
        .split('\n')
        .map((line) => line.trim());
      context.expect(gitignore).not.toContain('openspec/schemas/');
      context.expect(gitignore.filter((line) => line.startsWith('openspec/'))).toEqual([]);
      // ESLint 全局 ignores 含 .local/**：本地临时违规文件不参与 lint。
      // 行为证据（显式指向 .local 下文件被跳过）在 SCN-TEMPLATE-ENGINEERING-010 的
      // integration case `max-lines-cli` 覆盖；这里只核配置入口，避免 unit 里加载 ESLint 配置。
      const config = readFileSync(join(repositoryRoot, 'eslint.config.js'), 'utf8');
      const start = config.indexOf('ignores: [');
      const ignoresBlock = config.slice(start, config.indexOf(']', start));
      context.expect(start).toBeGreaterThan(-1);
      context.expect(ignoresBlock).toContain("'.local/**'");
      context.expect(ignoresBlock).toContain("'artifacts/**'");
    });
  },
);
