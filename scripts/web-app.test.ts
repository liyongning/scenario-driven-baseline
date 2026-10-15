import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { createEngineeringFormRoot } from '../packages/e2e/tests/tooling/engineering-form-fixture.ts';
import webVitestConfig from '../packages/web/vitest.config.ts';
import {
  loadProjectManifest,
  type ManifestPackage,
  type ProjectManifest,
} from './lib/project-manifest.ts';
import {
  checkCoreTsconfig,
  checkWebAppAlignment,
  coreTsconfigInclude,
} from './lib/web-app-checks.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const eslint = resolve(repositoryRoot, 'node_modules/.bin/eslint');
const eslintConfig = resolve(repositoryRoot, 'eslint.config.js');
const require = createRequire(import.meta.url);
const dependencyRules = require('./lib/dependency-rules.cjs') as {
  dependencyRules(manifest: ProjectManifest): ReadonlyArray<{
    name: string;
    from: { path: string | string[]; pathNot?: string | string[] };
    to: { path?: string | string[]; pathNot?: string | string[] };
  }>;
  TEST_FILE_PATTERN: string;
};

function appUnitConfigIssues(
  config: { test?: { name?: unknown; environment?: unknown; root?: unknown } },
  repositoryRoot: string,
): string[] {
  const issues: string[] = [];
  if (config.test?.name !== 'app-unit') issues.push('name must be app-unit');
  if (config.test?.environment !== 'jsdom') issues.push('environment must be jsdom');
  if (
    typeof config.test?.root !== 'string' ||
    resolve(config.test.root) !== resolve(repositoryRoot)
  )
    issues.push('root must be the repository root');
  return issues;
}

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
      timeout: 30_000,
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
    async (context) => {
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

function lintFile(root: string, path: string) {
  return spawnSync(eslint, ['--config', eslintConfig, path], {
    cwd: root,
    encoding: 'utf8',
  });
}

function webPackage(manifest: ProjectManifest): ManifestPackage {
  const pkg = manifest.packages.find((item) => item.form === 'web-app');
  if (!pkg) throw new Error('fixture has no web-app package');
  return pkg;
}

function writeAndRestore(path: string, value: string, assertion: () => void): void {
  const existed = existsSync(path);
  const original = existed ? readFileSync(path, 'utf8') : '';
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
    assertion();
  } finally {
    if (existed) writeFileSync(path, original);
    else rmSync(path, { force: true });
  }
}

evidence(
  'SCN-WEB-APP-010',
  'vitest-project-config',
  ['vitest-root-fixed'],
  async (context, check) => {
    await check('vitest-root-fixed', () => {
      context.expect(appUnitConfigIssues(webVitestConfig, repositoryRoot)).toEqual([]);
      const counterexample = {
        ...webVitestConfig,
        test: { ...webVitestConfig.test, root: resolve(repositoryRoot, 'packages') },
      };
      context
        .expect(appUnitConfigIssues(counterexample, repositoryRoot).join('\n'))
        .toContain('root must be the repository root');
    });
  },
);

evidence(
  'SCN-WEB-APP-001',
  'alignment-rules',
  [
    'root-config-only',
    'exact-dependencies',
    'workspace-protocol-dependency',
    'alignment-violation-rejected',
  ],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      const packagePath = join(root.root, 'packages/web-product/package.json');
      const manifest = loadProjectManifest(root.root);
      await check('alignment-violation-rejected', () => {
        context.expect(checkWebAppAlignment(root.root, manifest)).toEqual([]);
        const valid = JSON.parse(readFileSync(packagePath, 'utf8')) as {
          dependencies: Record<string, string>;
        };

        writeAndRestore(
          join(root.root, 'packages/web-product/eslint.config.js'),
          'export default [];\n',
          () =>
            context
              .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
              .toContain('package-level lint or format configuration eslint.config.js'),
        );
        writeAndRestore(
          packagePath,
          JSON.stringify({ ...valid, dependencies: { ...valid.dependencies, vue: '^3.5.43' } }),
          () =>
            context
              .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
              .toContain('vue must use an exact version'),
        );
        const withoutDevtools = { ...valid.dependencies };
        delete withoutDevtools['@vue/devtools-api'];
        writeAndRestore(
          packagePath,
          JSON.stringify({ ...valid, dependencies: withoutDevtools }),
          () =>
            context
              .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
              .toContain('missing explicit dependency @vue/devtools-api'),
        );
        writeAndRestore(
          packagePath,
          JSON.stringify({
            ...valid,
            dependencies: { ...valid.dependencies, '@sample/web-protocol': '^1.0.0' },
          }),
          () =>
            context
              .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
              .toContain('must use a workspace dependency'),
        );
        writeAndRestore(packagePath, JSON.stringify({ ...valid, name: '@sample/wrong-web' }), () =>
          context
            .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
            .toContain('expected name @sample/web-product'),
        );
        writeAndRestore(packagePath, JSON.stringify({ ...valid, private: false }), () =>
          context
            .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
            .toContain('web-app package must be private'),
        );
        writeAndRestore(join(root.root, 'eslint.config.js'), 'export default [];\n', () =>
          context
            .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
            .toContain('component name exemptions must be read from the manifest'),
        );
        writeAndRestore(
          packagePath,
          JSON.stringify({
            ...valid,
            dependencies: {
              ...valid.dependencies,
              '@vue/eslint-config-typescript': '14.6.0',
            },
          }),
          () =>
            context
              .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
              .toContain('@vue/eslint-config-typescript must not be a dependency'),
        );
        writeAndRestore(
          packagePath,
          JSON.stringify({
            ...valid,
            scripts: { 'test:e2e': 'cypress run' },
          }),
          () =>
            context
              .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
              .toContain('scaffold residue Cypress script'),
        );
        writeAndRestore(join(root.root, 'packages/web-product/README.md'), '# residue\n', () =>
          context
            .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
            .toContain('scaffold residue README.md'),
        );
        const vscode = join(root.root, 'packages/web-product/.vscode');
        mkdirSync(vscode, { recursive: true });
        try {
          context
            .expect(checkWebAppAlignment(root.root, manifest).join('\n'))
            .toContain('scaffold residue .vscode');
        } finally {
          rmSync(vscode, { recursive: true, force: true });
        }
        const missingWeb = {
          ...manifest,
          packages: [
            ...manifest.packages,
            { ...webPackage(manifest), directory: 'missing-web', name: '@sample/missing-web' },
          ],
        } satisfies ProjectManifest;
        context.expect(checkWebAppAlignment(root.root, missingWeb)).toEqual([]);
      });
      await check('root-config-only', () => {
        context.expect(checkWebAppAlignment(root.root, manifest)).toEqual([]);
      });
      await check('exact-dependencies', () => {
        context
          .expect(
            loadProjectManifest(root.root).packages.find((item) => item.form === 'web-app')
              ?.private,
          )
          .toBe(true);
      });
      await check('workspace-protocol-dependency', () => {
        const value = JSON.parse(readFileSync(packagePath, 'utf8')) as {
          dependencies: Record<string, string>;
        };
        context.expect(value.dependencies['@sample/web-protocol']).toBe('workspace:*');
      });
    } finally {
      root.cleanup();
    }
  },
);

evidence(
  'SCN-WEB-APP-005',
  'store-lint-rules',
  ['lint-backstop', 'store-naming'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    const path = 'packages/web-product/src/AppRoot/useApplication.ts';
    const file = join(root.root, path);
    try {
      await check('lint-backstop', () => {
        const cases = [
          [
            'const applicationStore = useApplicationStore();\napplicationStore.count = 1;\n',
            '不得直接写入',
          ],
          [
            'const applicationStore = useApplicationStore();\napplicationStore.$patch({});\n',
            '$patch',
          ],
          [
            'const applicationStore = useApplicationStore();\nvoid applicationStore.$state;\n',
            '$state',
          ],
          [
            'const applicationStore = useApplicationStore();\nconst alias = applicationStore;\nalias.count = 1;\n',
            '不得给全局 store 起别名',
          ],
          [
            'const applicationStore = useApplicationStore();\nObject.assign(applicationStore, {});\n',
            'Object.assign',
          ],
        ] as const;
        for (const [source, message] of cases)
          writeAndRestore(file, source, () => {
            const result = lintFile(root.root, path);
            context.expect(result.status, result.stdout + result.stderr).not.toBe(0);
            context.expect(result.stdout + result.stderr).toContain(message);
          });
      });
      await check('store-naming', () => {
        writeAndRestore(file, 'const store = useApplicationStore();\nvoid store;\n', () => {
          const result = lintFile(root.root, path);
          context.expect(result.status, result.stdout + result.stderr).not.toBe(0);
          context.expect(result.stdout + result.stderr).toContain('store 变量名必须以 Store 结尾');
        });
        writeAndRestore(file, 'function useFoo() {}\nuseFoo();\n', () => {
          const result = lintFile(root.root, path);
          context.expect(result.status, result.stdout + result.stderr).not.toBe(0);
          context
            .expect(result.stdout + result.stderr)
            .toContain('组合式函数必须命名为 use<X>Store');
        });
        writeAndRestore(
          file,
          'const applicationStore = useApplicationStore();\nvoid applicationStore;\n',
          () => {
            const result = lintFile(root.root, path);
            context.expect(result.status, result.stdout + result.stderr).toBe(0);
          },
        );
      });
    } finally {
      root.cleanup();
    }
  },
);

evidence(
  'SCN-WEB-APP-006',
  'dependency-rule-generation',
  ['rules-from-manifest', 'test-pattern-unified', 'domain-isolation'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      const manifest = loadProjectManifest(root.root);
      await check('rules-from-manifest', () => {
        const rules = dependencyRules.dependencyRules(manifest);
        context
          .expect(rules.map((rule) => rule.name))
          .toContain('ui-no-adapters-no-protocol:web-product');
        const renamed = {
          ...manifest,
          packages: manifest.packages.map((pkg) =>
            pkg.directory === 'web-product'
              ? { ...pkg, directory: 'renamed-web', name: '@sample/renamed-web' }
              : pkg,
          ),
          bindings: manifest.bindings.map((binding) =>
            binding.product === 'web-product' ? { ...binding, product: 'renamed-web' } : binding,
          ),
        } satisfies ProjectManifest;
        const renamedRules = dependencyRules.dependencyRules(renamed);
        context
          .expect(renamedRules.map((rule) => rule.name))
          .toContain('ui-no-adapters-no-protocol:renamed-web');
        context.expect(JSON.stringify(renamedRules)).toContain('packages/renamed-web/src');
      });
      await check('test-pattern-unified', () => {
        const coreRule = dependencyRules
          .dependencyRules(manifest)
          .find((rule) => rule.name === 'core-no-ui-no-framework:web-product')!;
        context.expect(JSON.stringify(coreRule)).toContain(dependencyRules.TEST_FILE_PATTERN);
      });
      await check('domain-isolation', () => {
        const rule = dependencyRules
          .dependencyRules(manifest)
          .find((item) => item.name === 'domain-isolation:web-product')!;
        const fromPaths = JSON.stringify(rule.from.pathNot);
        context.expect(fromPaths).toContain('packages/web-product/src/(?:app|runtime|shared)/');
        context.expect(fromPaths).toContain('packages/web-product/src/stores/');
      });
    } finally {
      root.cleanup();
    }
  },
);

evidence(
  'SCN-WEB-APP-007',
  'core-scope-generation',
  ['core-tsconfig-derived'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      await check('core-tsconfig-derived', () => {
        const manifest = loadProjectManifest(root.root);
        const pkg = webPackage(manifest);
        context
          .expect(coreTsconfigInclude(pkg))
          .toEqual([
            'src/runtime/**/*.ts',
            'src/*/core/**/*.ts',
            'src/*/ports/**/*.ts',
            'src/stores/global.ts',
          ]);
        context.expect(checkCoreTsconfig(root.root, manifest)).toEqual([]);
        const changed = {
          ...pkg,
          globalStore: 'src/stores/next.ts',
        } satisfies ManifestPackage;
        context.expect(coreTsconfigInclude(changed)).toContain('src/stores/next.ts');
        context.expect(coreTsconfigInclude({ ...pkg, form: 'sdk' })).toEqual([]);
        const { globalStore: _globalStore, ...pkgWithoutStore } = pkg;
        void _globalStore;
        context
          .expect(coreTsconfigInclude({ ...pkgWithoutStore, moduleRoots: [] }))
          .toEqual(['src/runtime/**/*.ts', 'src/*/core/**/*.ts', 'src/*/ports/**/*.ts']);
        context
          .expect(
            checkCoreTsconfig(root.root, {
              ...manifest,
              packages: [
                ...manifest.packages,
                { ...pkg, directory: 'missing-web', name: '@sample/missing-web' },
              ],
            }).join('\n'),
          )
          .toContain('packages/missing-web/tsconfig.core.json: missing');
        const coreTsconfigPath = join(root.root, 'packages/web-product/tsconfig.core.json');
        const coreTsconfig = readFileSync(coreTsconfigPath, 'utf8');
        writeAndRestore(
          coreTsconfigPath,
          JSON.stringify({
            ...JSON.parse(coreTsconfig),
            compilerOptions: { lib: ['DOM'], types: ['node'] },
          }),
          () => {
            const issues = checkCoreTsconfig(root.root, manifest).join('\n');
            context.expect(issues).toContain('lib must be ["ES2022"]');
            context.expect(issues).toContain('types must be empty');
          },
        );
        const manifestPath = join(root.root, 'project.manifest.json');
        const value = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          packages: Array<Record<string, unknown>>;
        };
        const web = value.packages.find((item) => item.directory === 'web-product')!;
        web.globalStore = 'src/stores/next.ts';
        writeFileSync(manifestPath, JSON.stringify(value, null, 2));
        context
          .expect(checkCoreTsconfig(root.root, loadProjectManifest(root.root)).join('\n'))
          .toContain('include must be derived');
        context
          .expect(checkCoreTsconfig(repositoryRoot, loadProjectManifest(repositoryRoot)))
          .toEqual([]);
      });
    } finally {
      root.cleanup();
    }
  },
);

evidence(
  'SCN-WEB-APP-008',
  'env-selector-rules',
  ['env-whole-in-main', 'env-elsewhere-rejected'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    const main = 'packages/web-product/src/main.ts';
    const app = 'packages/web-product/src/app/config.ts';
    try {
      await check('env-whole-in-main', () => {
        writeAndRestore(
          join(root.root, main),
          'const config = deploymentConfig(import.meta.env);\nvoid config;\n',
          () => {
            const result = lintFile(root.root, main);
            context.expect(result.status, result.stdout + result.stderr).toBe(0);
          },
        );
      });
      await check('env-elsewhere-rejected', () => {
        writeAndRestore(
          join(root.root, main),
          'const config = import.meta.env.VITE_API_BASE;\nvoid config;\n',
          () => {
            const result = lintFile(root.root, main);
            context.expect(result.status, result.stdout + result.stderr).not.toBe(0);
            context.expect(result.stdout + result.stderr).toContain('不能读取单个属性');
          },
        );
        writeAndRestore(
          join(root.root, app),
          'const config = import.meta.env;\nvoid config;\n',
          () => {
            const result = lintFile(root.root, app);
            context.expect(result.status, result.stdout + result.stderr).not.toBe(0);
            context.expect(result.stdout + result.stderr).toContain('只能出现在 main.ts');
          },
        );
      });
    } finally {
      root.cleanup();
    }
  },
);

evidence(
  'SCN-WEB-APP-009',
  'lint-config-rules',
  ['vue-flat-config', 'coverage-ignore-banned', 'multi-word-by-manifest'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    const tsFile = 'packages/web-product/src/AppRoot/ignored.ts';
    const vueFile = 'packages/web-product/src/AppRoot/ignored.vue';
    const badComponent = 'packages/web-product/src/Bad/Bad.vue';
    try {
      await check('vue-flat-config', () => {
        const value = readFileSync(eslintConfig, 'utf8');
        context.expect(value).toContain('eslint-plugin-vue');
        context.expect(value).not.toContain('@vue/eslint-config-typescript');
      });
      await check('coverage-ignore-banned', () => {
        for (const [path, source] of [
          [tsFile, '// v8 ignore next\nexport const value = 1;\n'],
          [
            vueFile,
            '<script setup lang="ts">\n// istanbul ignore next\nconst value = 1;\n</script>\n',
          ],
        ] as const)
          writeAndRestore(join(root.root, path), source, () => {
            const result = lintFile(root.root, path);
            context.expect(result.status, result.stdout + result.stderr).not.toBe(0);
            context.expect(result.stdout + result.stderr).toContain('ignore');
          });
      });
      await check('multi-word-by-manifest', () => {
        writeAndRestore(join(root.root, badComponent), '<template><p>bad</p></template>\n', () => {
          const result = lintFile(root.root, badComponent);
          context.expect(result.status, result.stdout + result.stderr).not.toBe(0);
          context.expect(result.stdout + result.stderr).toContain('multi-word-component-names');
          const manifestPath = join(root.root, 'project.manifest.json');
          const value = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            quality: { componentNameExemptions: Array<{ path: string; reason: string }> };
          };
          value.quality.componentNameExemptions = [{ path: badComponent, reason: '受控反例登记' }];
          writeAndRestore(manifestPath, JSON.stringify(value, null, 2), () => {
            const exemptResult = lintFile(root.root, badComponent);
            context.expect(exemptResult.status, exemptResult.stdout + exemptResult.stderr).toBe(0);
          });
          const configPath = join(root.root, 'eslint.config.js');
          const actualConfig = readFileSync(eslintConfig, 'utf8');
          writeAndRestore(configPath, actualConfig, () => {
            context
              .expect(checkWebAppAlignment(root.root, loadProjectManifest(root.root)))
              .toEqual([]);
          });
          writeAndRestore(
            configPath,
            `${actualConfig}\nexport const hardcodedExemption = { files: ['${badComponent}'] };\n`,
            () =>
              context
                .expect(checkWebAppAlignment(root.root, loadProjectManifest(root.root)).join('\n'))
                .toContain('hardcoded component name exemption'),
          );
        });
      });
    } finally {
      root.cleanup();
    }
  },
);
