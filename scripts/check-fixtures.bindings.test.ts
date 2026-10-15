import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import {
  createControlledRoot,
  type ControlledRoot,
} from '../packages/e2e/tests/tooling/controlled-root.ts';
import { checkFixtures } from './check-fixtures.ts';
import { normalizeRequirementBlock } from './lib/spec-sources.ts';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const roots: ControlledRoot[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) root.cleanup();
});

const spec = [
  '### Requirement: BASE-01 协议绑定',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-001 X',
  '',
  '- **WHEN** 运行 X',
  '- **THEN** 成功',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-002 Y',
  '',
  '- **WHEN** 运行 Y',
  '- **THEN** 成功',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-003 Z',
  '',
  '- **WHEN** 运行 Z',
  '- **THEN** 成功',
].join('\n');

function createRoot(): ControlledRoot {
  const root = createControlledRoot({
    manifest: {
      packages: [
        {
          directory: 'product-a',
          name: '@sample/product-a',
          role: 'product',
          form: 'sdk',
          private: false,
          allowedDirectories: ['src'],
        },
        {
          directory: 'product-b',
          name: '@sample/product-b',
          role: 'product',
          form: 'web-app',
          private: true,
          allowedDirectories: ['src'],
        },
        {
          directory: 'protocol-a',
          name: '@sample/protocol-a',
          role: 'protocol',
          protocolKind: 'idl',
          private: false,
          allowedDirectories: ['src', 'testing'],
        },
        {
          directory: 'protocol-b',
          name: '@sample/protocol-b',
          role: 'protocol',
          protocolKind: 'openapi',
          private: false,
          allowedDirectories: ['src', 'testing', 'contracts'],
          contract: {
            file: 'packages/protocol-b/contracts/openapi.yaml',
            lock: 'packages/protocol-b/contracts/openapi.lock.json',
          },
        },
        {
          directory: 'e2e',
          name: '@sample/e2e',
          role: 'test',
          private: true,
          allowedDirectories: ['src', 'tests'],
        },
      ],
      bindings: [
        { name: 'b1', product: 'product-a', protocol: 'protocol-a', platforms: ['p1'] },
        { name: 'b2', product: 'product-b', protocol: 'protocol-b', platforms: ['p2'] },
      ],
      requiredCommands: ['check:fast'],
      testProjects: [
        { name: 'unit', class: 'unit', config: 'packages/e2e/vitest.config.unit.ts' },
        { name: 'integration', class: 'integration', config: 'packages/e2e/vitest.config.ts' },
        { name: 'p1', class: 'platform', config: 'packages/e2e/vitest.config.p1.ts' },
        { name: 'p2', class: 'platform', config: 'packages/e2e/vitest.config.p2.ts' },
      ],
      fingerprints: {
        sourceRoots: ['scripts'],
        buildInputs: [],
        protocolInputs: [
          'proto-gen.lock',
          'packages/protocol-b/contracts/openapi.yaml',
          'packages/protocol-b/contracts/openapi.lock.json',
        ],
      },
      quality: { coverageExclusions: [], maxLinesExemptions: [] },
    },
    files: {
      'scenario-gate.config.json': JSON.stringify({
        scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
        flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
        ownerIdPattern: '^(?:FLOW|SCN)-[A-Z0-9-]+$',
      }),
      'packages/e2e/tests/b1/case.spec.ts': caseSource('X', 'b1'),
      'packages/e2e/tests/b1/conflict.spec.ts': caseSource('Y', 'b1'),
      'packages/e2e/tests/b2/conflict.spec.ts': caseSource('Y', 'b2'),
      'packages/e2e/tests/tooling/unbound.spec.ts': caseSource('Z'),
    },
    prefix: 'fixture-binding-',
  });
  roots.push(root);
  mkdirSync(join(root.root, 'openspec/specs/sample'), { recursive: true });
  writeFileSync(join(root.root, 'openspec/specs/sample/spec.md'), spec);
  return root;
}

function caseSource(owner: 'X' | 'Y' | 'Z', binding?: 'b1' | 'b2'): string {
  const id = {
    X: 'SCN-SAMPLE-CONTRACT-001',
    Y: 'SCN-SAMPLE-CONTRACT-002',
    Z: 'SCN-SAMPLE-CONTRACT-003',
  }[owner];
  return [
    "import { defineCase } from '../../../src/cases/define-case.ts';",
    '',
    'defineCase(',
    '  {',
    `    ownerId: '${id}',`,
    "    caseId: 'case',",
    "    fixtureCase: 'case',",
    "    environment: 'integration',",
    ...(binding ? [`    binding: '${binding}',`] : []),
    `    covers: [{ id: '${id}', caseKey: 'case', checks: ['result'] }],`,
    '  },',
    '  () => undefined,',
    ');',
  ].join('\n');
}

function writeFixture(root: ControlledRoot, owner: string, protocol?: string) {
  const directory = join(root.root, 'packages/e2e/tests/fixtures', owner);
  const caseFile = 'case.json';
  const content = '{"result":true}';
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, caseFile), content);
  writeFileSync(
    join(directory, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      ownerId: owner,
      ...(protocol ? { protocol } : {}),
      sources: { spec: { requirementDigest: sha(normalizeRequirementBlock(spec)) } },
      cases: { case: caseFile },
      sha256: { [caseFile]: sha(content) },
    }),
  );
  return directory;
}

function fixtureRoot(root: ControlledRoot) {
  return join(root.root, 'packages/e2e/tests/fixtures');
}

async function evidence(
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `SCN-SCENARIO-GATE-030 ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: 'SCN-SCENARIO-GATE-030',
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id: 'SCN-SCENARIO-GATE-030', caseKey: caseId, checks }],
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
  'owner-protocol-rules',
  [
    'owner-protocol-consistent',
    'missing-declaration-rejected',
    'conflicting-bindings-rejected',
    'unbound-owner-exempt',
  ],
  async (context, check) => {
    await check('owner-protocol-consistent', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', 'protocol-a');
      const result = await checkFixtures({
        fixtureRoot: fixtureRoot(root),
        repositoryRoot: root.root,
      });
      context.expect(result.issues).toEqual([]);
    });

    await check('missing-declaration-rejected', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001');
      const result = await checkFixtures({
        fixtureRoot: fixtureRoot(root),
        repositoryRoot: root.root,
      });
      context
        .expect(result.issues.join('\n'))
        .toContain(
          'SCN-SAMPLE-CONTRACT-001: protocol missing does not match bound protocol protocol-a',
        );
    });

    await check('conflicting-bindings-rejected', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-002', 'protocol-a');
      const result = await checkFixtures({
        fixtureRoot: fixtureRoot(root),
        repositoryRoot: root.root,
      });
      context
        .expect(result.issues.join('\n'))
        .toContain('SCN-SAMPLE-CONTRACT-002: bound by cases from multiple protocols');
    });

    await check('unbound-owner-exempt', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-003');
      const result = await checkFixtures({
        fixtureRoot: fixtureRoot(root),
        repositoryRoot: root.root,
      });
      context.expect(result.issues).toEqual([]);
    });
  },
);
