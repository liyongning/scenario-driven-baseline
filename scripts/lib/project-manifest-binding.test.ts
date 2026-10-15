import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { minimalManifest } from '../../packages/e2e/tests/tooling/controlled-root.ts';
import { checkSchemaDocumentation } from './schema-docs.ts';
import {
  bindingByName,
  bindingForProduct,
  componentNameExemptions,
  loadProjectManifest,
  packageByDirectory,
  sdkProduct,
  testPackage,
  validateManifest,
  type ProjectManifest,
} from './project-manifest.ts';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
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
  requiredCommands: string[];
  testProjects: Array<Record<string, unknown>>;
};

function baseManifest(): MutableManifest {
  return structuredClone(minimalManifest()) as MutableManifest;
}

function packageOf(manifest: MutableManifest, role: string): MutablePackage {
  const pkg = manifest.packages.find((item) => item.role === role);
  if (!pkg) throw new Error(`missing ${role} fixture package`);
  return pkg;
}

function writeRoot(manifest: MutableManifest): string {
  const root = mkdtempSync(join(tmpdir(), 'manifest-binding-'));
  roots.push(root);
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  const bindings = new Map(manifest.bindings.map((item) => [item.product, item.protocol]));
  for (const pkg of manifest.packages) {
    const path = join(root, 'packages', pkg.directory, 'package.json');
    mkdirSync(dirname(path), { recursive: true });
    const protocolDirectory = bindings.get(pkg.directory);
    const protocol = manifest.packages.find(
      (candidate) => candidate.directory === protocolDirectory,
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

function expectLoadIssue(manifest: MutableManifest, pattern: RegExp) {
  expect(() => loadProjectManifest(writeRoot(manifest))).toThrow(pattern);
}

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

evidence(
  'SCN-TEMPLATE-ENGINEERING-013',
  'binding-schema-rules',
  ['role-specific-fields', 'role-counts', 'binding-constraints', 'schema-descriptions'],
  async (context, check) => {
    await check('role-specific-fields', () => {
      const base = baseManifest();
      const protocolWithForm = structuredClone(base);
      packageOf(protocolWithForm, 'protocol').form = 'idl';
      expectLoadIssue(protocolWithForm, /does not match/);

      const productWithKind = structuredClone(base);
      packageOf(productWithKind, 'product').protocolKind = 'idl';
      expectLoadIssue(productWithKind, /does not match/);

      const sdkWithStore = structuredClone(base);
      packageOf(sdkWithStore, 'product').globalStore = 'src/stores/index.ts';
      expectLoadIssue(sdkWithStore, /does not match/);

      const missingForm = structuredClone(base);
      delete packageOf(missingForm, 'product').form;
      expectLoadIssue(missingForm, /does not match/);

      const semanticMissingForm = structuredClone(base);
      delete packageOf(semanticMissingForm, 'product').form;
      context
        .expect(validateManifest(semanticMissingForm as never).join('\n'))
        .toContain('must declare form');

      const missingKind = structuredClone(base);
      delete packageOf(missingKind, 'protocol').protocolKind;
      expectLoadIssue(missingKind, /does not match/);

      const semanticMissingKind = structuredClone(base);
      delete packageOf(semanticMissingKind, 'protocol').protocolKind;
      context
        .expect(validateManifest(semanticMissingKind as never).join('\n'))
        .toContain('must declare protocolKind');

      const sdkStore = structuredClone(base);
      packageOf(sdkStore, 'product').globalStore = 'src/stores/index.ts';
      context
        .expect(validateManifest(sdkStore as never).join('\n'))
        .toContain('globalStore is only allowed for web-app');

      const productChecks = structuredClone(base);
      packageOf(productChecks, 'product').checks = ['not-allowed'];
      context
        .expect(validateManifest(productChecks as never).join('\n'))
        .toContain('checks is only allowed for protocol packages');

      const emptyProductChecks = structuredClone(base);
      packageOf(emptyProductChecks, 'product').checks = [];
      context.expect(validateManifest(emptyProductChecks as never)).toEqual([]);

      context.expect(loadProjectManifest(writeRoot(base)).packages).toHaveLength(3);
    });

    await check('role-counts', () => {
      const duplicateTest = baseManifest();
      const test = packageOf(duplicateTest, 'test');
      duplicateTest.packages.push({ ...test, directory: 'e2e-extra', name: '@sample/e2e-extra' });
      context
        .expect(validateManifest(duplicateTest as never).join('\n'))
        .toContain('expected exactly one test package');

      const noProduct = baseManifest();
      noProduct.packages = noProduct.packages.filter((item) => item.role !== 'product');
      noProduct.bindings = [];
      context
        .expect(validateManifest(noProduct as never).join('\n'))
        .toContain('expected at least one product package');

      const multiple = baseManifest();
      multiple.packages.push({
        directory: 'web-product',
        name: '@sample/web-product',
        role: 'product',
        form: 'web-app',
        private: true,
        allowedDirectories: ['src'],
        moduleRoots: ['src'],
      });
      multiple.bindings.push({
        name: 'second-binding',
        product: 'web-product',
        protocol: 'sample-protocol',
        platforms: [],
      });
      context.expect(validateManifest(multiple as never)).toEqual([]);
    });

    await check('binding-constraints', () => {
      const duplicateName = baseManifest();
      duplicateName.bindings.push({
        name: duplicateName.bindings[0]!.name,
        product: 'sample-product',
        protocol: 'sample-protocol',
        platforms: [],
      });
      context
        .expect(validateManifest(duplicateName as never).join('\n'))
        .toContain('binding names must be unique');

      const wrongRole = baseManifest();
      wrongRole.bindings[0]!.product = 'sample-protocol';
      context
        .expect(validateManifest(wrongRole as never).join('\n'))
        .toContain('product must reference a product package directory');

      const unknown = baseManifest();
      unknown.bindings[0]!.protocol = 'missing';
      context
        .expect(validateManifest(unknown as never).join('\n'))
        .toContain('references an unknown package directory');
      context
        .expect(validateManifest(unknown as never, repositoryRoot).join('\n'))
        .toContain('protocol must reference a protocol package directory');

      const unbound = baseManifest();
      unbound.bindings = [];
      context
        .expect(validateManifest(unbound as never).join('\n'))
        .toContain('must appear in exactly one binding');

      const repeatedProduct = baseManifest();
      repeatedProduct.bindings.push({
        name: 'second-binding',
        product: 'sample-product',
        protocol: 'sample-protocol',
        platforms: [],
      });
      context
        .expect(validateManifest(repeatedProduct as never).join('\n'))
        .toContain('must appear in exactly one binding');

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
      context.expect(validateManifest(sharedProtocol as never)).toEqual([]);

      const wrongPlatform = baseManifest();
      wrongPlatform.bindings[0]!.platforms = ['integration'];
      context
        .expect(validateManifest(wrongPlatform as never).join('\n'))
        .toContain('is not a platform test project');

      const missingDependency = baseManifest();
      const dependencyRoot = writeRoot(missingDependency);
      const packagePath = join(
        dependencyRoot,
        'packages',
        packageOf(missingDependency, 'product').directory,
        'package.json',
      );
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
      packageJson.dependencies = {};
      writeFileSync(packagePath, JSON.stringify(packageJson));
      expect(() => loadProjectManifest(dependencyRoot)).toThrow(
        /must declare workspace dependency/,
      );
    });

    await check('schema-descriptions', () => {
      context
        .expect(
          checkSchemaDocumentation(repositoryRoot).filter((issue) =>
            issue.startsWith('project.manifest.schema.json'),
          ),
        )
        .toEqual([]);
      const schema = JSON.parse(
        readFileSync(join(repositoryRoot, 'project.manifest.schema.json'), 'utf8'),
      ) as {
        properties: {
          bindings: { description: string };
          packages: {
            items: {
              properties: {
                form: { description: string };
                protocolKind: { description: string };
                globalStore: { description: string };
              };
            };
          };
        };
      };
      const descriptions = [
        schema.properties.bindings.description,
        schema.properties.packages.items.properties.form.description,
        schema.properties.packages.items.properties.protocolKind.description,
        schema.properties.packages.items.properties.globalStore.description,
      ];
      context.expect(descriptions.every((value) => /[\u3400-\u9fff]/u.test(value))).toBe(true);
    });
  },
);

test('manifest readers return registered entries and reject absent entries', () => {
  const manifest = baseManifest() as unknown as ProjectManifest;
  expect(sdkProduct(manifest).directory).toBe('sample-product');
  expect(packageByDirectory(manifest, 'sample-protocol').directory).toBe('sample-protocol');
  expect(testPackage(manifest).directory).toBe('sample-test');
  expect(bindingForProduct(manifest, 'sample-product').name).toBe('sample-product-protocol');
  expect(bindingByName(manifest, 'sample-product-protocol').product).toBe('sample-product');
  expect(componentNameExemptions(manifest)).toEqual([]);
  expect(
    componentNameExemptions({
      ...manifest,
      quality: {
        coverageExclusions: [],
        maxLinesExemptions: [],
        componentNameExemptions: [{ path: 'src/App.vue', reason: '产品名' }],
      },
    }),
  ).toEqual([{ path: 'src/App.vue', reason: '产品名' }]);
  const withoutQuality: Record<string, unknown> = structuredClone(manifest);
  delete withoutQuality.quality;
  expect(componentNameExemptions(withoutQuality as unknown as typeof manifest)).toEqual([]);

  const missingPackages = { packages: [] } as unknown as typeof manifest;
  const missingBindings = { packages: [], bindings: [] } as unknown as typeof manifest;
  expect(() => sdkProduct(missingPackages)).toThrow(/no sdk product package/);
  expect(() => packageByDirectory(missingPackages, 'missing')).toThrow(/no package missing/);
  expect(() => testPackage(missingPackages)).toThrow(/no test package/);
  expect(() => bindingForProduct(missingBindings, 'missing')).toThrow(/no binding for missing/);
  expect(() => bindingByName(missingBindings, 'missing')).toThrow(/no binding missing/);
});
