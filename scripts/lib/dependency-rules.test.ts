import { createRequire } from 'node:module';
import { expect, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { loadProjectManifest, type ProjectManifest } from './project-manifest.ts';

/** 依赖规则生成函数在 CJS 中实现，供 dependency-cruiser 配置与 eslint 配置共用。 */
type Rule = Readonly<{ name: string; from: { path: string } }>;
type Rules = Readonly<{
  escapeRegExp(value: string): string;
  packageByRole(manifest: ProjectManifest, role: string): { directory: string; name: string };
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
  const manifest = loadProjectManifest(process.cwd());
  return {
    ...manifest,
    packages: manifest.packages.map((pkg) =>
      pkg.role === 'product'
        ? { ...pkg, directory: 'renamed-sdk', name: '@sample/renamed-sdk' }
        : pkg,
    ),
  };
}

const ruleByName = (list: ReadonlyArray<Rule>, name: string): Rule => {
  const found = list.find((item) => item.name === name);
  if (!found) throw new Error(`missing rule ${name}`);
  return found;
};

evidence(
  'SCN-TEMPLATE-ENGINEERING-007',
  'rule-generation-by-manifest',
  ['rules-by-role'],
  async (context, check) => {
    await check('rules-by-role', () => {
      const repository = loadProjectManifest(process.cwd());
      const repositoryRules = rules.dependencyRules(repository);
      context
        .expect(ruleByName(repositoryRules, 'domain-core-no-generated').from.path)
        .toBe('^packages/sdk/src/[^/]+/(core|ports)/');
      context
        .expect(ruleByName(repositoryRules, 'cross-workspace-no-direct-files').from.path)
        .toBe('^packages/(sdk|protocol)/(?:src)/');
      context
        .expect(rules.cruiseTargets(repository))
        .toEqual(['packages/sdk/src', 'packages/protocol/src', 'packages/protocol/testing']);
      context.expect(rules.runtimeFile(repository)).toBe('packages/sdk/src/runtime/default.ts');

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
        ]);
      context
        .expect(rules.restrictedGlobalFiles(renamed))
        .toEqual([
          'packages/renamed-sdk/src/*/core/**/*.ts',
          'packages/renamed-sdk/src/*/ports/**/*.ts',
        ]);
      context
        .expect(rules.runtimeFile(renamed))
        .toBe('packages/renamed-sdk/src/runtime/default.ts');
    });
  },
);

test('escapeRegExp escapes regular expression metacharacters', () => {
  expect(rules.escapeRegExp('a.b*c(d)')).toBe('a\\.b\\*c\\(d\\)');
});

test('packageByRole rejects missing roles and missing package lists', () => {
  const manifest = loadProjectManifest(process.cwd());
  expect(rules.packageByRole(manifest, 'product').name).toBe('@daqian/template-sdk');
  expect(() => rules.packageByRole(manifest, 'unknown')).toThrow(/no unknown package/);
  expect(() => rules.packageByRole({} as unknown as ProjectManifest, 'product')).toThrow(
    /no product package/,
  );
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
  ).toEqual(['packages/prod/src']);
});
