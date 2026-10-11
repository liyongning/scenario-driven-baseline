import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import { defineCase } from '../../src/cases/define-case.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type MutablePackage = Record<string, unknown> & {
  directory: string;
  name: string;
  role: string;
  private: boolean;
};
type MutableBinding = Record<string, unknown> & {
  name: string;
  product: string;
  protocol: string;
  platforms: string[];
};
type MutableManifest = Record<string, unknown> & {
  packages: MutablePackage[];
  bindings: MutableBinding[];
};

function baseManifest(): MutableManifest {
  return {
    packages: [
      {
        directory: 'sample-product',
        name: '@sample/product',
        role: 'product',
        form: 'sdk',
        private: false,
        allowedDirectories: ['src'],
        moduleRoots: ['src'],
      },
      {
        directory: 'sample-protocol',
        name: '@sample/protocol',
        role: 'protocol',
        protocolKind: 'idl',
        private: false,
        allowedDirectories: ['src', 'testing'],
        moduleRoots: ['src', 'testing'],
      },
      {
        directory: 'sample-test',
        name: '@sample/test',
        role: 'test',
        private: true,
        allowedDirectories: ['src', 'tests'],
        moduleRoots: ['src', 'tests'],
      },
    ],
    bindings: [
      {
        name: 'sample-product-protocol',
        product: 'sample-product',
        protocol: 'sample-protocol',
        platforms: [],
      },
    ],
    requiredCommands: ['check:fast'],
    testProjects: [
      { name: 'product-unit', class: 'unit', config: 'packages/sample-product/vitest.config.ts' },
      {
        name: 'integration',
        class: 'integration',
        config: 'packages/sample-test/vitest.config.ts',
      },
    ],
    fingerprints: { sourceRoots: ['scripts'], buildInputs: [], protocolInputs: ['proto-gen.lock'] },
    quality: { coverageExclusions: [], maxLinesExemptions: [] },
  };
}

function packageOf(manifest: MutableManifest, role: string): MutablePackage {
  const pkg = manifest.packages.find((item) => item.role === role);
  if (!pkg) throw new Error(`missing ${role} fixture package`);
  return pkg;
}

function writeRoot(manifest: MutableManifest): string {
  const root = mkdtempSync(join(tmpdir(), 'manifest-cli-'));
  roots.push(root);
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  const bindings = new Map(manifest.bindings.map((item) => [item.product, item.protocol]));
  for (const pkg of manifest.packages) {
    const path = join(root, 'packages', pkg.directory, 'package.json');
    mkdirSync(dirname(path), { recursive: true });
    const protocol = manifest.packages.find(
      (candidate) => candidate.directory === bindings.get(pkg.directory),
    );
    writeFileSync(
      path,
      JSON.stringify({
        name: pkg.name,
        version: '0.0.0',
        private: pkg.private,
        ...(pkg.role === 'product' && protocol
          ? { dependencies: { [String(protocol.name)]: 'workspace:*' } }
          : {}),
      }),
    );
  }
  return root;
}

function expectManifestIssue(manifest: MutableManifest, expected: string) {
  const root = writeRoot(manifest);
  let thrown = '';
  try {
    loadProjectManifest(root);
  } catch (error) {
    thrown = String(error);
  }
  if (!thrown.includes(expected)) throw new Error(`missing manifest issue ${expected}: ${thrown}`);
}

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-013',
    caseId: 'binding-violations-cli',
    fixtureCase: 'binding-violations-cli',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-013',
        caseKey: 'binding-violations-cli',
        checks: ['role-specific-fields', 'role-counts', 'binding-constraints'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as { cases: string[] };
    await checkpoint('role-specific-fields', () => {
      expect(data.cases).toEqual([
        'protocol-form',
        'product-protocol-kind',
        'sdk-global-store',
        'missing-product-form',
        'missing-protocol-kind',
      ]);
      for (const mutation of data.cases.slice(0, 3)) {
        const manifest = baseManifest();
        if (mutation === 'protocol-form') packageOf(manifest, 'protocol').form = 'idl';
        if (mutation === 'product-protocol-kind')
          packageOf(manifest, 'product').protocolKind = 'idl';
        if (mutation === 'sdk-global-store')
          packageOf(manifest, 'product').globalStore = 'src/store.ts';
        expectManifestIssue(manifest, 'does not match');
      }
      const missingForm = baseManifest();
      delete packageOf(missingForm, 'product').form;
      expectManifestIssue(missingForm, 'does not match');
      const missingKind = baseManifest();
      delete packageOf(missingKind, 'protocol').protocolKind;
      expectManifestIssue(missingKind, 'does not match');
    });

    await checkpoint('role-counts', () => {
      const duplicateTest = baseManifest();
      const test = packageOf(duplicateTest, 'test');
      duplicateTest.packages.push({ ...test, directory: 'sample-test-2', name: '@sample/test-2' });
      expectManifestIssue(duplicateTest, 'expected exactly one test package');

      const noProduct = baseManifest();
      noProduct.packages = noProduct.packages.filter((item) => item.role !== 'product');
      noProduct.packages.push({
        directory: 'second-protocol',
        name: '@sample/second-protocol',
        role: 'protocol',
        protocolKind: 'openapi',
        private: false,
        allowedDirectories: ['src', 'testing'],
        moduleRoots: ['src', 'testing'],
      });
      expectManifestIssue(noProduct, 'expected at least one product package');
    });

    await checkpoint('binding-constraints', () => {
      const duplicateName = baseManifest();
      duplicateName.bindings.push({
        name: 'sample-product-protocol',
        product: 'sample-product',
        protocol: 'sample-protocol',
        platforms: [],
      });
      expectManifestIssue(duplicateName, 'binding names must be unique');

      const wrongRole = baseManifest();
      wrongRole.bindings[0]!.product = 'sample-protocol';
      expectManifestIssue(wrongRole, 'product must reference a product package directory');

      const unknown = baseManifest();
      unknown.bindings[0]!.protocol = 'missing';
      expectManifestIssue(unknown, 'references an unknown package directory');

      const unbound = baseManifest();
      unbound.packages.push({
        directory: 'second-product',
        name: '@sample/second-product',
        role: 'product',
        form: 'sdk',
        private: false,
        allowedDirectories: ['src'],
        moduleRoots: ['src'],
      });
      expectManifestIssue(unbound, 'must appear in exactly one binding');

      const repeatedProduct = baseManifest();
      repeatedProduct.packages.push({
        directory: 'second-product',
        name: '@sample/second-product',
        role: 'product',
        form: 'sdk',
        private: false,
        allowedDirectories: ['src'],
      });
      repeatedProduct.bindings.push({
        name: 'second-binding',
        product: 'sample-product',
        protocol: 'sample-protocol',
        platforms: [],
      });
      expectManifestIssue(repeatedProduct, 'must appear in exactly one binding');

      const sharedProtocol = baseManifest();
      sharedProtocol.packages.push({
        directory: 'second-product',
        name: '@sample/second-product',
        role: 'product',
        form: 'sdk',
        private: false,
        allowedDirectories: ['src'],
      });
      sharedProtocol.bindings.push({
        name: 'second-binding',
        product: 'second-product',
        protocol: 'sample-protocol',
        platforms: [],
      });
      expect(() => loadProjectManifest(writeRoot(sharedProtocol))).not.toThrow();

      const wrongPlatform = baseManifest();
      wrongPlatform.bindings[0]!.platforms = ['integration'];
      expectManifestIssue(wrongPlatform, 'is not a platform test project');

      const missingDependency = writeRoot(baseManifest());
      const packagePath = join(missingDependency, 'packages/sample-product/package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
      packageJson.dependencies = {};
      writeFileSync(packagePath, JSON.stringify(packageJson));
      expect(() => loadProjectManifest(missingDependency)).toThrow(
        /must declare workspace dependency/,
      );
    });
  },
);
