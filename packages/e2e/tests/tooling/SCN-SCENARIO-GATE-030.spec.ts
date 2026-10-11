import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkFixtures } from '../../../../scripts/check-fixtures.ts';
import { createControlledRoot, type ControlledRoot } from './controlled-root.ts';
import { ownerDigest, runFixtureCli, type ControlledFixtureRoot } from './fixture-gate-helpers.ts';
import { defineCase } from '../../src/cases/define-case.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

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

function multiBindingGate(): ControlledFixtureRoot & ControlledRoot {
  const controlled = createControlledRoot({
    manifest: {
      packages: [
        {
          directory: 'product-a',
          name: '@sample/product-a',
          role: 'product',
          form: 'sdk',
          private: false,
          allowedDirectories: ['src'],
          moduleRoots: ['src'],
        },
        {
          directory: 'product-b',
          name: '@sample/product-b',
          role: 'product',
          form: 'web-app',
          private: true,
          allowedDirectories: ['src'],
          moduleRoots: ['src'],
        },
        {
          directory: 'protocol-a',
          name: '@sample/protocol-a',
          role: 'protocol',
          protocolKind: 'idl',
          private: false,
          allowedDirectories: ['src', 'testing'],
          moduleRoots: ['src', 'testing'],
        },
        {
          directory: 'protocol-b',
          name: '@sample/protocol-b',
          role: 'protocol',
          protocolKind: 'openapi',
          private: false,
          allowedDirectories: ['src', 'testing', 'contracts'],
          moduleRoots: ['src', 'testing'],
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
          moduleRoots: ['src', 'tests'],
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
    prefix: 'owner-protocol-',
  });
  const specPath = join(controlled.root, 'openspec/specs/sample/spec.md');
  mkdirSync(join(specPath, '..'), { recursive: true });
  writeFileSync(specPath, spec);
  return {
    ...controlled,
    fixtures: join(controlled.root, 'packages/e2e/tests/fixtures'),
    specPath,
  };
}

function writeFixture(
  gate: ControlledFixtureRoot,
  owner: string,
  requirementDigest: string,
  protocol?: string,
) {
  const directory = join(gate.fixtures, owner);
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
      sources: { spec: { requirementDigest } },
      cases: { case: caseFile },
      sha256: { [caseFile]: sha(content) },
    }),
  );
}

defineCase(
  {
    ownerId: 'SCN-SCENARIO-GATE-030',
    caseId: 'owner-protocol-cli',
    fixtureCase: 'owner-protocol-cli',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-SCENARIO-GATE-030',
        caseKey: 'owner-protocol-cli',
        checks: [
          'owner-protocol-consistent',
          'missing-declaration-rejected',
          'conflicting-bindings-rejected',
          'template-fixtures-declared',
        ],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as { bindings: string[] };

    await checkpoint('owner-protocol-consistent', async () => {
      const gate = multiBindingGate();
      try {
        expect(data.bindings).toEqual(['b1', 'b2']);
        writeFixture(
          gate,
          'SCN-SAMPLE-CONTRACT-001',
          await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001'),
          'protocol-a',
        );
        const result = runFixtureCli(gate);
        expect(result.status).toBe(0);
        expect(result.output.issues).toEqual([]);
      } finally {
        gate.cleanup();
      }
    });

    await checkpoint('missing-declaration-rejected', async () => {
      const gate = multiBindingGate();
      try {
        writeFixture(
          gate,
          'SCN-SAMPLE-CONTRACT-001',
          await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001'),
        );
        const result = runFixtureCli(gate);
        expect(result.status).toBe(1);
        expect(result.output.issues.join('\n')).toContain(
          'SCN-SAMPLE-CONTRACT-001: protocol missing does not match bound protocol protocol-a',
        );
      } finally {
        gate.cleanup();
      }
    });

    await checkpoint('conflicting-bindings-rejected', async () => {
      const gate = multiBindingGate();
      try {
        writeFixture(
          gate,
          'SCN-SAMPLE-CONTRACT-002',
          await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-002'),
          'protocol-a',
        );
        const result = runFixtureCli(gate);
        expect(result.status).toBe(1);
        expect(result.output.issues.join('\n')).toContain(
          'SCN-SAMPLE-CONTRACT-002: bound by cases from multiple protocols',
        );
      } finally {
        gate.cleanup();
      }
    });

    await checkpoint('template-fixtures-declared', async () => {
      const output = await checkFixtures({
        fixtureRoot: join(repositoryRoot, 'packages/e2e/tests/fixtures'),
        repositoryRoot,
      });
      expect(output.issues).toEqual([]);
    });
  },
  { timeoutMs: 30_000 },
);
