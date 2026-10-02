import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { buildContractInventory } from './contract-inventory.ts';
import { buildVerificationFingerprints } from './fingerprints.ts';
import { checkSchemaDocumentation } from './schema-docs.ts';
import {
  errorMessage,
  loadProjectManifest,
  packageByRole,
  projectManifestFile,
  testProjectsByClass,
  validateManifest,
  type ManifestPackage,
  type ProjectManifest,
  type TestProject,
} from './project-manifest.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

type MutableManifest = {
  packages: ManifestPackage[];
  requiredCommands: string[];
  testProjects: TestProject[];
  fingerprints: { sourceRoots: string[]; hostRoots: string[] };
  release?: { registry: string; tagPrefix: string };
};

const baseManifest = (): MutableManifest => ({
  packages: [
    { directory: 'sample-product', name: '@sample/product', role: 'product', private: false, allowedDirectories: ['src'] },
    { directory: 'sample-protocol', name: '@sample/protocol', role: 'protocol', private: false, allowedDirectories: ['src', 'testing'] },
    { directory: 'sample-test', name: '@sample/test', role: 'test', private: true, allowedDirectories: ['src', 'host', 'tests'] },
  ],
  requiredCommands: ['check:fast'],
  testProjects: [
    { name: 'product-unit', class: 'unit' },
    { name: 'protocol-unit', class: 'unit' },
    { name: 'integration', class: 'integration' },
    { name: 'platform', class: 'platform' },
  ],
  fingerprints: { sourceRoots: ['sample-src'], hostRoots: ['sample-host'] },
});

function writeManifest(root: string, manifest: unknown) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, projectManifestFile), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
}

function temporaryRoot(prefix = 'project-manifest-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function evidence(id: string, caseId: string, checks: string[], body: (context: TestContext, check: (name: string, assertion: () => void | Promise<void>) => Promise<void>) => Promise<void>) {
  test(`${id} ${caseId}`, { meta: { paymentCase: {
    ownerId: id, caseId, fixtureCase: null, environment: 'test-tools-unit',
    covers: [{ id, caseKey: caseId, checks }],
  } } }, async (context: TestContext) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    await body(context, async (name, assertion) => { await assertion(); executed.push(name); });
    context.expect(executed.sort()).toEqual([...checks].sort());
    await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints: executed }), 'payment-evidence');
  });
}

evidence('SCN-TEMPLATE-ENGINEERING-005', 'manifest-rules', ['manifest-schema', 'projects-by-manifest', 'obligation-environments', 'source-roots-by-manifest'], async (context, check) => {
  await check('manifest-schema', () => {
    // 仓库清单通过 schema 校验，且 schema 的每个属性都有中文说明。
    context.expect(loadProjectManifest(process.cwd()).packages).toHaveLength(3);
    context.expect(checkSchemaDocumentation(process.cwd()).filter(issue => issue.startsWith('project.manifest.schema.json'))).toEqual([]);
    const root = temporaryRoot();
    writeManifest(root, baseManifest());
    context.expect(loadProjectManifest(root).packages).toHaveLength(3);
  });

  await check('projects-by-manifest', () => {
    const manifest = baseManifest();
    context.expect(errorMessage(new Error('boom'))).toBe('boom');
    context.expect(errorMessage('plain')).toBe('plain');
    context.expect(testProjectsByClass(manifest, ['integration', 'platform'])).toEqual(['integration', 'platform']);
    context.expect(testProjectsByClass(manifest, ['integration'])).toEqual(['integration']);
    context.expect(packageByRole(manifest, 'protocol').directory).toBe('sample-protocol');
    context.expect(validateManifest(manifest)).toEqual([]);

    const missing = temporaryRoot();
    context.expect(() => loadProjectManifest(missing)).toThrow(/cannot be read/);
    const broken = temporaryRoot();
    writeManifest(broken, '{not json');
    context.expect(() => loadProjectManifest(broken)).toThrow(/not valid JSON/);
    const mismatched = temporaryRoot();
    writeManifest(mismatched, { ...baseManifest(), packages: [] });
    context.expect(() => loadProjectManifest(mismatched)).toThrow(/does not match/);
    const semantic = temporaryRoot();
    writeManifest(semantic, {
      ...baseManifest(),
      packages: [...baseManifest().packages, { directory: 'extra', name: '@sample/extra', role: 'product', private: false, allowedDirectories: ['src'] }],
    });
    context.expect(() => loadProjectManifest(semantic)).toThrow(/is invalid/);

    // 语义校验：角色、目录/包名唯一、测试包私有、测试项目名唯一与类别覆盖。
    const cases: Array<[string, (value: MutableManifest) => void]> = [
      ['expected exactly one product package', value => { value.packages = [value.packages[1]!, value.packages[2]!]; }],
      ['expected exactly one protocol package', value => { value.packages = [value.packages[0]!, value.packages[2]!]; }],
      ['expected exactly one test package', value => { value.packages = value.packages.slice(0, 2); }],
      ['package directories must be unique', value => { value.packages[1] = { ...value.packages[1]!, directory: 'sample-product' }; }],
      ['package names must be unique', value => { value.packages[1] = { ...value.packages[1]!, name: '@sample/product' }; }],
      ['the test package must be private', value => { value.packages[2] = { ...value.packages[2]!, private: false }; }],
      ['test project names must be unique', value => { value.testProjects[1] = { name: 'product-unit', class: 'unit' }; }],
      ['at least one integration test project is required', value => { value.testProjects = value.testProjects.filter(item => item.class === 'unit'); }],
    ];
    for (const [message, mutate] of cases) {
      const value = baseManifest();
      mutate(value);
      context.expect(validateManifest(value as ProjectManifest).join('\n')).toContain(message);
    }
    const noProduct = { ...baseManifest(), packages: baseManifest().packages.slice(1) };
    context.expect(() => packageByRole(noProduct as unknown as ProjectManifest, 'product')).toThrow(/no product package/);
  });

  await check('obligation-environments', async () => {
    const manifest = loadProjectManifest(process.cwd());
    const integrationAndPlatform = testProjectsByClass(manifest, ['integration', 'platform']);
    const integrationOnly = testProjectsByClass(manifest, ['integration']);
    const inventory = await buildContractInventory(process.cwd());
    const obligationEnvironments = new Set(inventory.obligations.flatMap(item => item.requiredIn));
    context.expect([...obligationEnvironments].sort()).toEqual([...integrationAndPlatform].sort());
    const errorObligation = inventory.obligations.find(item => item.id === 'idl.error-contract#business-error#$');
    context.expect(errorObligation?.requiredIn).toEqual(integrationOnly);
  });

  await check('source-roots-by-manifest', () => {
    const root = temporaryRoot('manifest-fingerprint-');
    writeManifest(root, { ...baseManifest(), fingerprints: { sourceRoots: ['sample-src'], hostRoots: [] } });
    mkdirSync(join(root, 'sample-src'), { recursive: true });
    writeFileSync(join(root, 'sample-src/index.ts'), 'listed');
    writeFileSync(join(root, 'proto-gen.lock'), 'idl');
    const before = buildVerificationFingerprints(root).sourceDigest;
    writeFileSync(join(root, 'unlisted.ts'), 'not listed');
    context.expect(buildVerificationFingerprints(root).sourceDigest).toBe(before);
    writeFileSync(join(root, 'sample-src/index.ts'), 'changed');
    context.expect(buildVerificationFingerprints(root).sourceDigest).not.toBe(before);
  });
});
