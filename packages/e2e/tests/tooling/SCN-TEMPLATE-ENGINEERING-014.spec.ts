import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach } from 'vitest';
import { collectFiles } from '../../../../scripts/lib/fingerprints.ts';
import { checkTestBindingDeclarations } from '../../../../scripts/lib/test-binding-checks.ts';
import { planCommand } from '../../../../scripts/run-by-manifest.ts';
import { createControlledRoot, type ControlledRoot } from './controlled-root.ts';
import { defineCase } from '../../src/cases/define-case.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const roots: ControlledRoot[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) root.cleanup();
});

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
      allowedDirectories: ['src', 'testing'],
      moduleRoots: ['src', 'testing'],
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
  fingerprints: { sourceRoots: ['scripts'], buildInputs: [], protocolInputs: ['proto-gen.lock'] },
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
