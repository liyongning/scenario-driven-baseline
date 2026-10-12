import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { createControlledRoot } from '../../packages/e2e/tests/tooling/controlled-root.ts';
import {
  declarationRoot,
  exampleCallerSource,
  exampleDeclarationSource,
  repositoryProtocolSource,
} from '../../packages/e2e/tests/tooling/declaration-fixture.ts';
import { environmentClassOf } from '../../packages/e2e/src/cases/define-case.ts';
import { buildContractInventory } from './contract-inventory.ts';
import { buildVerificationFingerprints } from './fingerprints.ts';
import { planCommand } from '../run-by-manifest.ts';
import { checkSchemaDocumentation } from './schema-docs.ts';
import {
  errorMessage,
  loadProjectManifest,
  coverageExclusions,
  defaultReportPaths,
  defaultReportNames,
  maxLinesExemptions,
  packagesByRole,
  projectManifestFile,
  reportNameFor,
  testProjectConfigs,
  testProjectsByClass,
  validateManifest,
  type ManifestPackage,
  type ProjectManifest,
  type TestProject,
} from './project-manifest.ts';
import { testEnvironmentsByClass } from './test-environments.ts';

const roots: string[] = [];

/** 模板自身事实核验：只读真实仓库的清单、schema 与根脚本，不读取门禁实时状态。 */
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type MutableManifest = {
  packages: ManifestPackage[];
  bindings: Array<{
    name: string;
    product: string;
    protocol: string;
    platforms: string[];
  }>;
  requiredCommands: string[];
  testProjects: TestProject[];
  fingerprints: { sourceRoots: string[]; buildInputs: string[]; protocolInputs: string[] };
  quality?: { coverageExclusions: Array<{ path: string; reason: string }>; maxLinesExemptions: [] };
  release?: { registry: string; tagPrefix: string };
};

const baseManifest = (): MutableManifest => ({
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
      allowedDirectories: ['src', 'host', 'tests'],
      moduleRoots: ['src', 'host', 'tests'],
    },
  ],
  bindings: [
    {
      name: 'sample-product-protocol',
      product: 'sample-product',
      protocol: 'sample-protocol',
      platforms: ['platform'],
    },
  ],
  requiredCommands: ['check:fast'],
  testProjects: [
    { name: 'product-unit', class: 'unit', config: 'packages/sample-product/vitest.config.ts' },
    { name: 'protocol-unit', class: 'unit', config: 'packages/sample-protocol/vitest.config.ts' },
    { name: 'integration', class: 'integration', config: 'packages/sample-test/vitest.config.ts' },
    { name: 'platform', class: 'platform', config: 'packages/sample-test/vitest.config.weapp.ts' },
  ],
  fingerprints: {
    sourceRoots: ['sample-src'],
    buildInputs: ['build.config.ts'],
    protocolInputs: ['proto-gen.lock'],
  },
  quality: { coverageExclusions: [], maxLinesExemptions: [] },
});

function writeManifest(root: string, manifest: unknown) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, projectManifestFile),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
  );
  if (typeof manifest !== 'object' || manifest === null) return;
  const packages =
    (manifest as { packages?: ReadonlyArray<Record<string, unknown>> }).packages ?? [];
  const protocols = packages.filter((item) => item.role === 'protocol');
  for (const pkg of packages) {
    if (typeof pkg.directory !== 'string' || typeof pkg.name !== 'string') continue;
    const directory = join(root, 'packages', pkg.directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        version: '0.0.0',
        private: pkg.private,
        ...(pkg.role === 'product'
          ? {
              dependencies: Object.fromEntries(
                protocols
                  .filter(
                    (protocol): protocol is Record<string, unknown> & { name: string } =>
                      typeof protocol.name === 'string',
                  )
                  .map((protocol) => [protocol.name, 'workspace:*']),
              ),
            }
          : {}),
      }),
    );
  }
}

function temporaryRoot(prefix = 'project-manifest-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
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
      // 与 cliEvidence 一致：用例会读真实仓库清单与包目录，在副本/负载下默认 5s 易误判超时。
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
  'SCN-TEMPLATE-ENGINEERING-005',
  'manifest-rules',
  [
    'manifest-schema',
    'projects-by-manifest',
    'obligation-environments',
    'source-roots-by-manifest',
    'digest-inputs',
    'environments-by-manifest',
    'scripts-by-manifest',
  ],
  async (context, check) => {
    await check('manifest-schema', () => {
      // 仓库清单通过 schema 校验，且 schema 的每个属性都有中文说明。
      context.expect(loadProjectManifest(repositoryRoot).packages).toHaveLength(5);
      context
        .expect(
          checkSchemaDocumentation(repositoryRoot).filter((issue) =>
            issue.startsWith('project.manifest.schema.json'),
          ),
        )
        .toEqual([]);
      const root = temporaryRoot();
      writeManifest(root, baseManifest());
      context.expect(loadProjectManifest(root).packages).toHaveLength(3);

      // hostRoots 已删除，非 product 角色不得声明 consumedOperations。
      const withHostRoots = temporaryRoot();
      writeManifest(withHostRoots, {
        ...baseManifest(),
        fingerprints: { ...baseManifest().fingerprints, hostRoots: [] },
      });
      context.expect(() => loadProjectManifest(withHostRoots)).toThrow(/does not match/);
      const wrongRole = temporaryRoot();
      writeManifest(wrongRole, {
        ...baseManifest(),
        packages: baseManifest().packages.map((item) =>
          item.role === 'protocol' ? { ...item, consumedOperations: ['src/ops.ts'] } : item,
        ),
      });
      context.expect(() => loadProjectManifest(wrongRole)).toThrow(/does not match/);

      const missingContract = baseManifest();
      missingContract.packages[1] = {
        ...missingContract.packages[1]!,
        protocolKind: 'openapi',
      };
      const missingContractRoot = temporaryRoot();
      writeManifest(missingContractRoot, missingContract);
      context.expect(() => loadProjectManifest(missingContractRoot)).toThrow(/contract/);

      const contractOnIdl = baseManifest();
      contractOnIdl.packages[1] = {
        ...contractOnIdl.packages[1]!,
        contract: { file: 'packages/sample-protocol/contracts/api.yaml', lock: 'contracts.lock' },
      };
      contractOnIdl.fingerprints.protocolInputs.push(
        'packages/sample-protocol/contracts/api.yaml',
        'contracts.lock',
      );
      const contractOnIdlRoot = temporaryRoot();
      writeManifest(contractOnIdlRoot, contractOnIdl);
      context.expect(() => loadProjectManifest(contractOnIdlRoot)).toThrow(/does not match/);

      const openapiContract = baseManifest();
      openapiContract.packages[1] = {
        ...openapiContract.packages[1]!,
        protocolKind: 'openapi',
        contract: { file: 'packages/sample-protocol/contracts/api.yaml', lock: 'contracts.lock' },
      };
      openapiContract.fingerprints.protocolInputs = ['contracts.lock'];
      context
        .expect(validateManifest(openapiContract as unknown as ProjectManifest).join('\n'))
        .toContain('contract file packages/sample-protocol/contracts/api.yaml');

      openapiContract.fingerprints.protocolInputs = ['packages/sample-protocol/contracts/api.yaml'];
      context
        .expect(validateManifest(openapiContract as unknown as ProjectManifest).join('\n'))
        .toContain('contract lock contracts.lock');

      const missingReason = temporaryRoot();
      writeManifest(missingReason, {
        ...baseManifest(),
        quality: { coverageExclusions: [{ path: 'sample-src/x.ts' }], maxLinesExemptions: [] },
      });
      context.expect(() => loadProjectManifest(missingReason)).toThrow(/does not match/);
      // perFile 与 prepare 是可选字段，登记后仍通过。
      const perFile = temporaryRoot();
      writeManifest(perFile, {
        ...baseManifest(),
        testProjects: baseManifest().testProjects.map((item) =>
          item.name === 'platform' ? { ...item, perFile: true, prepare: 'weapp:prepare' } : item,
        ),
      });
      context.expect(loadProjectManifest(perFile).testProjects).toHaveLength(4);
    });

    await check('projects-by-manifest', () => {
      const manifest = baseManifest();
      context.expect(errorMessage(new Error('boom'))).toBe('boom');
      context.expect(errorMessage('plain')).toBe('plain');
      context
        .expect(testProjectsByClass(manifest, ['integration', 'platform']))
        .toEqual(['integration', 'platform']);
      context.expect(testProjectsByClass(manifest, ['integration'])).toEqual(['integration']);
      context.expect(packagesByRole(manifest, 'protocol')[0]!.directory).toBe('sample-protocol');
      context.expect(validateManifest(manifest)).toEqual([]);
      context
        .expect(testProjectConfigs(manifest))
        .toEqual([
          'packages/sample-product/vitest.config.ts',
          'packages/sample-protocol/vitest.config.ts',
          'packages/sample-test/vitest.config.ts',
          'packages/sample-test/vitest.config.weapp.ts',
        ]);
      const withoutQuality = { ...manifest, quality: undefined } as unknown as ProjectManifest;
      context.expect(coverageExclusions(withoutQuality)).toEqual([]);
      context.expect(maxLinesExemptions(withoutQuality)).toEqual([]);

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
        packages: [
          ...baseManifest().packages,
          {
            directory: 'extra',
            name: '@sample/extra',
            role: 'product',
            private: false,
            allowedDirectories: ['src'],
          },
        ],
      });
      context.expect(() => loadProjectManifest(semantic)).toThrow(/does not match|is invalid/);

      // 语义校验：角色、目录/包名唯一、测试包私有、测试项目名唯一与类别覆盖。
      const cases: Array<[string, (value: MutableManifest) => void]> = [
        [
          'expected at least one product package',
          (value) => {
            value.packages = [value.packages[1]!, value.packages[2]!];
          },
        ],
        [
          'expected at least one protocol package',
          (value) => {
            value.packages = [value.packages[0]!, value.packages[2]!];
          },
        ],
        [
          'expected exactly one test package',
          (value) => {
            value.packages = value.packages.slice(0, 2);
          },
        ],
        [
          'package directories must be unique',
          (value) => {
            value.packages[1] = { ...value.packages[1]!, directory: 'sample-product' };
          },
        ],
        [
          'package names must be unique',
          (value) => {
            value.packages[1] = { ...value.packages[1]!, name: '@sample/product' };
          },
        ],
        [
          'the test package must be private',
          (value) => {
            value.packages[2] = { ...value.packages[2]!, private: false };
          },
        ],
        [
          'test project names must be unique',
          (value) => {
            value.testProjects[1] = {
              name: 'product-unit',
              class: 'unit',
              config: 'packages/sample-protocol/vitest.config.ts',
            };
          },
        ],
        [
          'must reference a project of the same class',
          (value) => {
            value.testProjects.push({
              name: 'integration-heavy',
              class: 'integration',
              config: 'packages/sample-test/vitest.config.integration-heavy.ts',
              environment: 'missing',
            });
          },
        ],
        [
          'must reference a project of the same class',
          (value) => {
            value.testProjects.push({
              name: 'integration-heavy',
              class: 'integration',
              config: 'packages/sample-test/vitest.config.integration-heavy.ts',
              environment: 'platform',
            });
          },
        ],
        [
          'consumedOperations is only allowed for the product package',
          (value) => {
            value.packages[1] = { ...value.packages[1]!, consumedOperations: ['src/ops.ts'] };
          },
        ],
        [
          'at least one integration test project is required',
          (value) => {
            value.testProjects = value.testProjects.filter((item) => item.class === 'unit');
          },
        ],
      ];
      for (const [message, mutate] of cases) {
        const value = baseManifest();
        mutate(value);
        context.expect(validateManifest(value as ProjectManifest).join('\n')).toContain(message);
      }
      const noProduct = { ...baseManifest(), packages: baseManifest().packages.slice(1) };
      context.expect(packagesByRole(noProduct as ProjectManifest, 'product')).toEqual([]);
    });

    await check('obligation-environments', async () => {
      const manifest = loadProjectManifest(repositoryRoot);
      const integrationAndPlatform = testEnvironmentsByClass(manifest, ['integration', 'platform']);
      const integrationOnly = testEnvironmentsByClass(manifest, ['integration']);
      // 义务运行环境由清单派生；声明取自受控输入，示例删除后仍能复核同一事实（ENG-06）。
      const root = declarationRoot({
        generatedFromRepository: true,
        declaration: exampleDeclarationSource,
        caller: exampleCallerSource,
        protocolFiles: {
          'errors/business-codes.ts': repositoryProtocolSource('errors/business-codes.ts'),
        },
        prefix: 'template-manifest-005-',
      });
      const inventory = await buildContractInventory(root.root);
      root.cleanup();
      const obligationEnvironments = new Set(
        inventory.obligations.flatMap((item) => item.requiredIn),
      );
      context
        .expect([...obligationEnvironments].sort())
        .toEqual([...integrationAndPlatform].sort());
      const errorObligation = inventory.obligations.find(
        (item) => item.id === 'idl.error-contract#business-error#$',
      );
      context.expect(errorObligation?.requiredIn).toEqual(integrationOnly);
    });

    await check('source-roots-by-manifest', () => {
      const fixture = createControlledRoot({
        manifest: {
          ...baseManifest(),
          fingerprints: {
            sourceRoots: ['sample-src'],
            buildInputs: ['build.config.ts'],
            protocolInputs: ['proto-gen.lock'],
          },
        },
        files: {
          'sample-src/index.ts': 'listed',
          'build.config.ts': 'build',
          'proto-gen.lock': 'idl',
          'sample-src/AGENTS.md': 'docs',
          'sample-src/generated/api.ts': 'generated',
        },
      });
      try {
        const before = buildVerificationFingerprints(fixture.root).sourceDigest;
        writeFileSync(join(fixture.root, 'unlisted.ts'), 'not listed');
        context.expect(buildVerificationFingerprints(fixture.root).sourceDigest).toBe(before);
        writeFileSync(join(fixture.root, 'sample-src/AGENTS.md'), 'changed docs');
        context.expect(buildVerificationFingerprints(fixture.root).sourceDigest).toBe(before);
        writeFileSync(join(fixture.root, 'sample-src/index.ts'), 'changed');
        context.expect(buildVerificationFingerprints(fixture.root).sourceDigest).not.toBe(before);
      } finally {
        fixture.cleanup();
      }
    });

    await check('digest-inputs', () => {
      const fixture = createControlledRoot({
        manifest: {
          ...baseManifest(),
          fingerprints: {
            sourceRoots: ['sample-src'],
            buildInputs: ['build.config.ts'],
            protocolInputs: ['proto-gen.lock'],
          },
        },
        files: {
          'sample-src/index.ts': 'listed',
          'build.config.ts': 'build',
          'proto-gen.lock': 'idl',
        },
      });
      try {
        const before = buildVerificationFingerprints(fixture.root);
        writeFileSync(join(fixture.root, 'build.config.ts'), 'changed build');
        const changedBuild = buildVerificationFingerprints(fixture.root);
        context.expect(changedBuild.sourceDigest).not.toBe(before.sourceDigest);
        context.expect(changedBuild.protocolDigest).toBe(before.protocolDigest);
        writeFileSync(join(fixture.root, 'proto-gen.lock'), 'changed idl');
        const changedProtocol = buildVerificationFingerprints(fixture.root);
        context.expect(changedProtocol.protocolDigest).not.toBe(before.protocolDigest);
        context.expect(Object.values(changedProtocol.files)).not.toEqual([]);
        context
          .expect(
            Object.values(changedProtocol.files).every((value) => /^[a-f0-9]{64}$/.test(value)),
          )
          .toBe(true);
      } finally {
        fixture.cleanup();
      }
    });

    await check('environments-by-manifest', () => {
      const manifest = loadProjectManifest(repositoryRoot);
      context.expect(environmentClassOf('integration')).toBe('integration');
      context.expect(environmentClassOf('weapp')).toBe('platform');
      context.expect(environmentClassOf('not-registered')).toBeUndefined();
      context
        .expect(defaultReportNames(manifest))
        .toEqual(['unit', 'integration', 'integration-heavy', 'weapp']);
      // 默认报告由清单测试项目派生：unit 合并为一份，perFile 项目取目录下的全部报告文件。
      const root = temporaryRoot('project-manifest-reports-');
      const perFileManifest = baseManifest();
      perFileManifest.testProjects[3] = {
        ...perFileManifest.testProjects[3]!,
        perFile: true,
      };
      writeManifest(root, perFileManifest);
      const reports = join(root, 'artifacts', 'run-1', 'reports');
      mkdirSync(join(reports, 'platform'), { recursive: true });
      writeFileSync(join(reports, 'unit.json'), '{"tests":[]}');
      writeFileSync(join(reports, 'platform', 'notes.md'), 'ignored');
      writeFileSync(join(reports, 'platform', 'second.json'), '{"tests":[]}');
      writeFileSync(join(reports, 'platform', 'first.json'), '{"tests":[]}');
      context
        .expect(defaultReportPaths(root, 'run-1', loadProjectManifest(root)))
        .toEqual([
          join(reports, 'unit.json'),
          join(reports, 'platform', 'first.json'),
          join(reports, 'platform', 'second.json'),
        ]);
      // 未生成报告的测试项目不进入默认集合。
      context
        .expect(defaultReportPaths(root, 'missing-run', loadProjectManifest(root)))
        .toEqual([]);
    });

    await check('scripts-by-manifest', () => {
      const root = repositoryRoot;
      const manifest = loadProjectManifest(root);
      const scripts =
        (
          JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts?: Record<string, string>;
          }
        ).scripts ?? {};
      const platform = manifest.testProjects.find((project) => project.class === 'platform')!;
      for (const command of [
        'build',
        'typecheck',
        'test:unit',
        'test:integration',
        `test:e2e:${platform.name}`,
      ])
        context.expect(scripts[command], command).toBe(`tsx scripts/run-by-manifest.ts ${command}`);
      context
        .expect(planCommand(root, 'build').map((step) => step.args[1]))
        .toEqual([
          ...packagesByRole(manifest, 'protocol').map((item) => item.name),
          ...packagesByRole(manifest, 'product').map((item) => item.name),
        ]);
      context
        .expect(planCommand(root, 'test:unit')[0]!.args)
        .toEqual([
          'run',
          ...testProjectsByClass(manifest, ['unit']).flatMap((name) => ['--project', name]),
          '--coverage',
        ]);
    });
  },
);

test('derives default report names from the registered test projects', () => {
  const manifest = loadProjectManifest(repositoryRoot);
  expect(defaultReportNames(manifest)).toEqual([
    'unit',
    'integration',
    'integration-heavy',
    'weapp',
  ]);
  expect(reportNameFor(manifest.testProjects.find((item) => item.name === 'weapp')!)).toBe('weapp');
  expect(reportNameFor(manifest.testProjects.find((item) => item.name === 'sdk-unit')!)).toBe(
    'unit',
  );
  expect(testEnvironmentsByClass(manifest, ['integration'])).toEqual(['integration']);
});
