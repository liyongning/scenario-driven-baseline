import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach } from 'vitest';
import { readReleaseWorkspaceFacts } from '../../../../scripts/check-release.ts';
import { runPackageCli } from '../../../../scripts/check-package.ts';
import { collectFiles } from '../../../../scripts/lib/fingerprints.ts';
import {
  loadProjectManifest,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import { checkTestBindingDeclarations } from '../../../../scripts/lib/test-binding-checks.ts';
import { planCommand } from '../../../../scripts/run-by-manifest.ts';
import { runGate } from './scenario-gate-helpers.ts';
import { createControlledRoot, type ControlledRoot } from './controlled-root.ts';
import {
  adapterFixtureManifest,
  createAdapterFixture,
  type AdapterFixture,
} from './protocol-adapter-fixture.ts';
import { defineCase } from '../../src/cases/define-case.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const roots: ControlledRoot[] = [];
const adapterFixtures: AdapterFixture[] = [];

type DependencyRule = Readonly<{ name: string; from: { path: string }; to: { path: string } }>;
type DependencyRules = Readonly<{
  cruiseTargets(manifest: ProjectManifest): string[];
  dependencyRules(manifest: ProjectManifest): ReadonlyArray<DependencyRule>;
}>;

const dependencyRules = createRequire(import.meta.url)(
  '../../../../scripts/lib/dependency-rules.cjs',
) as DependencyRules;

afterEach(() => {
  for (const root of roots.splice(0)) root.cleanup();
  for (const fixture of adapterFixtures.splice(0)) fixture.cleanup();
});

function createAdapterRoot(options: Parameters<typeof createAdapterFixture>[0] = {}) {
  const fixture = createAdapterFixture({
    ...options,
    files: {
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
        },
      }),
      'packages/e2e/src/shadow/index.ts': 'export {};\n',
      ...(options.files ?? {}),
    },
    prefix: options.prefix ?? 'multi-package-cli-',
  });
  adapterFixtures.push(fixture);
  return fixture;
}

function runDependencyCruiser(root: string, targets?: ReadonlyArray<string>) {
  const manifest = loadProjectManifest(root);
  const result = spawnSync(
    resolve(repositoryRoot, 'node_modules/.bin/depcruise'),
    [
      '--config',
      resolve(repositoryRoot, '.dependency-cruiser.cjs'),
      '--output-type',
      'err-long',
      ...(targets ?? dependencyRules.cruiseTargets(manifest)),
    ],
    { cwd: root, encoding: 'utf8' },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function singleBindingManifest() {
  const manifest = structuredClone(adapterFixtureManifest());
  manifest.packages = manifest.packages.filter(
    (pkg) => pkg.directory !== 'product-b' && pkg.directory !== 'protocol-b',
  );
  manifest.bindings = manifest.bindings.filter((binding) => binding.name !== 'binding-b');
  manifest.requiredCommands = manifest.requiredCommands.filter(
    (command) => command !== 'api:validate',
  );
  manifest.testProjects = manifest.testProjects.filter((project) => project.name !== 'platform-b');
  return manifest;
}

const multiManifest = {
  packages: [
    {
      directory: 'sdk-product',
      name: '@sample/sdk-product',
      role: 'product',
      form: 'sdk',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'web-product',
      name: '@sample/web-product',
      role: 'product',
      form: 'web-app',
      private: true,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'idl-protocol',
      name: '@sample/idl-protocol',
      role: 'protocol',
      protocolKind: 'idl',
      checks: ['proto:validate', 'proto:status'],
      private: false,
      allowedDirectories: ['src', 'testing'],
      moduleRoots: ['src', 'testing'],
    },
    {
      directory: 'openapi-protocol',
      name: '@sample/openapi-protocol',
      role: 'protocol',
      protocolKind: 'openapi',
      checks: ['api:validate', 'api:status'],
      private: false,
      allowedDirectories: ['src', 'testing', 'contracts'],
      moduleRoots: ['src', 'testing'],
      contract: {
        file: 'packages/openapi-protocol/contracts/openapi.yaml',
        lock: 'packages/openapi-protocol/contracts/openapi.lock.json',
      },
    },
    {
      directory: 'e2e',
      name: '@sample/e2e',
      role: 'test',
      private: true,
      allowedDirectories: ['src', 'tests'],
      moduleRoots: ['src', 'tests'],
    },
  ],
  bindings: [
    { name: 'sdk-idl', product: 'sdk-product', protocol: 'idl-protocol', platforms: [] },
    { name: 'web-openapi', product: 'web-product', protocol: 'openapi-protocol', platforms: [] },
  ],
  requiredCommands: ['check:fast', 'proto:validate', 'proto:status', 'api:validate', 'api:status'],
  testProjects: [
    { name: 'integration', class: 'integration', config: 'packages/e2e/vitest.config.ts' },
    { name: 'unit', class: 'unit', config: 'packages/e2e/vitest.config.unit.ts' },
  ],
  fingerprints: {
    sourceRoots: ['scripts'],
    buildInputs: [],
    protocolInputs: [
      'proto-gen.lock',
      'packages/openapi-protocol/contracts/openapi.yaml',
      'packages/openapi-protocol/contracts/openapi.lock.json',
    ],
  },
  quality: { coverageExclusions: [], maxLinesExemptions: [] },
};

function createRoot() {
  const root = createControlledRoot({
    manifest: multiManifest,
    files: {
      'packages/e2e/tests/tooling/imports-idl.spec.ts':
        "import '@sample/idl-protocol/testing/adapter';\n",
    },
    prefix: 'multi-package-',
  });
  roots.push(root);
  return root;
}

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-014',
    caseId: 'binding-exclusive-rules-cli',
    fixtureCase: 'binding-exclusive-rules-cli',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-014',
        caseKey: 'binding-exclusive-rules-cli',
        checks: ['test-binding-declared', 'checks-by-manifest'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as { packages: number; protocols: number; bindings: number };
    const root = createRoot();
    await checkpoint('test-binding-declared', () => {
      expect(data).toEqual({ packages: 2, protocols: 2, bindings: 2 });
      const manifest = {
        packages: multiManifest.packages,
        bindings: multiManifest.bindings,
        requiredCommands: multiManifest.requiredCommands,
        testProjects: multiManifest.testProjects,
        fingerprints: multiManifest.fingerprints,
        quality: multiManifest.quality,
      };
      const issues = checkTestBindingDeclarations(root.root, manifest as never);
      expect(issues).toContain(
        'packages/e2e/tests/tooling/imports-idl.spec.ts: imports binding-exclusive package idl-protocol without binding sdk-idl',
      );

      const declaredPath = join(root.root, 'packages/e2e/tests/sdk-idl/case.spec.ts');
      mkdirSync(dirname(declaredPath), { recursive: true });
      writeFileSync(
        declaredPath,
        "import '@sample/idl-protocol/testing/adapter';\nconst binding = 'sdk-idl';\n",
      );
      expect(checkTestBindingDeclarations(root.root, manifest as never)).toEqual([
        'packages/e2e/tests/tooling/imports-idl.spec.ts: imports binding-exclusive package idl-protocol without binding sdk-idl',
      ]);
    });

    await checkpoint('checks-by-manifest', () => {
      expect(
        planCommand(root.root, 'check:fast')
          .slice(0, 4)
          .map((step) => step.args[0]),
      ).toEqual(['proto:validate', 'proto:status', 'api:validate', 'api:status']);
    });
  },
);

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-014',
    caseId: 'multi-package-cli',
    fixtureCase: 'multi-package-cli',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-014',
        caseKey: 'multi-package-cli',
        checks: [
          'multi-package-pass',
          'build-order',
          'per-binding-readers',
          'bound-dependency-only',
        ],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as { products: number; protocols: number; bindings: number };
    const root = createAdapterRoot();

    await checkpoint('multi-package-pass', () => {
      expect(data).toEqual({ products: 2, protocols: 2, bindings: 2 });
      const result = runDependencyCruiser(root.root);
      expect(result.status, result.output).toBe(0);
    });

    await checkpoint('build-order', () => {
      expect(planCommand(root.root, 'build').map((step) => step.args[1])).toEqual([
        '@sample/protocol-a',
        '@sample/protocol-b',
        '@sample/product-a',
        '@sample/product-b',
      ]);
    });

    await checkpoint('per-binding-readers', async () => {
      const inventory = runGate(root.root, ['--inventory']);
      const contracts = (
        inventory.output as
          | Readonly<{
              contracts?: ReadonlyArray<{ id: string; requiredIn: ReadonlyArray<string> }>;
            }>
          | undefined
      )?.contracts;
      expect(contracts?.find((item) => item.id === 'a-op#http-route#$')?.requiredIn).toEqual([
        'integration',
        'platform-a',
      ]);
      expect(contracts?.find((item) => item.id === 'b-op#http-route#$')?.requiredIn).toEqual([
        'integration',
        'platform-b',
      ]);

      const manifest = structuredClone(adapterFixtureManifest());
      const protocolA = manifest.packages.find((pkg) => pkg.directory === 'protocol-a')!;
      manifest.packages = [
        ...manifest.packages.filter((pkg) => pkg.directory !== 'protocol-a'),
        protocolA,
      ];
      const reordered = createAdapterRoot({
        manifest,
        prefix: 'multi-package-readers-',
      });
      expect(await readReleaseWorkspaceFacts(reordered.root)).toMatchObject({
        sdk: { name: '@sample/product-a', protocolDependency: 'workspace:*' },
        protocol: { name: '@sample/protocol-a' },
      });

      const directory = await mkdtemp(join(tmpdir(), 'multi-package-input-'));
      try {
        const input = join(directory, 'input.json');
        await writeFile(
          input,
          JSON.stringify({
            sdkManifest: {
              name: '@sample/product-a',
              version: '0.0.0',
              dependencies: { '@sample/protocol-b': '0.0.0' },
            },
            protocolManifest: { name: '@sample/protocol-a', version: '0.0.0' },
            sdkFiles: ['package/dist/index.js'],
            protocolFiles: ['package/dist/index.js'],
            record: { sdkVersion: '0.0.0', protocolVersion: '0.0.0' },
          }),
        );
        const result = await runPackageCli(['node', 'script', '--input', input], reordered.root);
        expect(result.issues.join('\n')).toContain('@sample/protocol-a dependency must be exact');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    await checkpoint('bound-dependency-only', () => {
      const invalid = createAdapterRoot({
        files: {
          'packages/product-a/src/unbound.ts': "import '../../protocol-b/src/index.ts';\n",
        },
        prefix: 'multi-package-unbound-',
      });
      const dependency = runDependencyCruiser(invalid.root, ['packages/product-a/src']);
      expect(dependency.status).not.toBe(0);
      expect(dependency.output).toContain('product-bound-protocol-only:product-a');

      const packagePath = join(invalid.root, 'packages/product-a/package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
      packageJson.dependencies = {};
      writeFileSync(packagePath, JSON.stringify(packageJson));
      expect(() => loadProjectManifest(invalid.root)).toThrow(
        /must declare workspace dependency on @sample\/protocol-a/,
      );
    });
  },
  { timeoutMs: 60_000 },
);

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-014',
    caseId: 'single-binding-cli',
    fixtureCase: 'single-binding-cli',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-014',
        caseKey: 'single-binding-cli',
        checks: ['single-binding-restorable'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as { removedBinding: string };
    const root = createAdapterRoot({
      manifest: singleBindingManifest(),
      prefix: 'single-binding-cli-',
    });

    await checkpoint('single-binding-restorable', () => {
      expect(data).toEqual({ removedBinding: 'binding-b' });
      const dependency = runDependencyCruiser(root.root);
      expect(dependency.status, dependency.output).toBe(0);

      const inventory = runGate(root.root, ['--inventory']);
      const contracts = (
        inventory.output as Readonly<{ contracts?: ReadonlyArray<{ id: string }> }> | undefined
      )?.contracts;
      expect(contracts?.map((item) => item.id)).toEqual(
        expect.arrayContaining(['a-op#http-route#$']),
      );
      expect(contracts?.some((item) => item.id.startsWith('b-'))).toBe(false);
      const checkFast = planCommand(root.root, 'check:fast').map((step) => step.args[0]);
      expect(checkFast.slice(0, 3)).toEqual(['proto:validate', 'format:check', 'lint']);
      expect(checkFast).not.toContain('api:validate');
    });
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-014',
    caseId: 'no-unique-role-lookup',
    fixtureCase: 'no-unique-role-lookup',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-014',
        caseKey: 'no-unique-role-lookup',
        checks: ['no-unique-role-lookup'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as { scope: string };
    await checkpoint('no-unique-role-lookup', () => {
      expect(data.scope).toBe('scripts 下非测试源码');
      const files = collectFiles(
        join(repositoryRoot, 'scripts'),
        (path) => path.endsWith('.ts') && !path.endsWith('.test.ts'),
      );
      const offenders = files.flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        return /packageByRole\s*\(|packagesByRole\s*\([^)]*,\s*['"](?:product|protocol)['"]\s*\)\s*\[0\]/.test(
          source,
        )
          ? [relative(repositoryRoot, path)]
          : [];
      });
      expect(offenders).toEqual([]);
    });
  },
);
