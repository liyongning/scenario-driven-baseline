import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import {
  ownerDigest,
  type ControlledFixtureRoot,
} from '../packages/e2e/tests/tooling/fixture-gate-helpers.ts';
import {
  createAdapterFixture,
  readAdapterCalls,
  type AdapterFixture,
} from '../packages/e2e/tests/tooling/protocol-adapter-fixture.ts';
import { checkFixtures } from './check-fixtures.ts';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const fixtures: AdapterFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

function createFixture(prefix: string) {
  const fixture = createAdapterFixture({ prefix });
  fixtures.push(fixture);
  return fixture;
}

function fixtureGate(fixture: AdapterFixture): ControlledFixtureRoot {
  return {
    root: fixture.root,
    fixtures: join(fixture.root, 'packages/e2e/tests/fixtures'),
    specPath: join(fixture.root, 'openspec/specs/sample/spec.md'),
    env: process.env,
    cleanup: fixture.cleanup,
  };
}

async function runFixtureCheck(fixture: AdapterFixture) {
  return checkFixtures({
    fixtureRoot: fixtureGate(fixture).fixtures,
    repositoryRoot: fixture.root,
  });
}

async function writeOwnerFixture(fixture: AdapterFixture, owner: string, protocol?: string) {
  const directory = join(fixtureGate(fixture).fixtures, owner);
  mkdirSync(directory, { recursive: true });
  const caseText = '{"request":"fixture","response":{"ok":true,"status":200}}';
  writeFileSync(join(directory, 'case.json'), caseText);
  writeFileSync(
    join(directory, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      ownerId: owner,
      ...(protocol === undefined ? {} : { protocol }),
      sources: { spec: { requirementDigest: await ownerDigest(fixture.root, owner) } },
      cases: { case: 'case.json' },
      sha256: { 'case.json': sha(caseText) },
    }),
  );
}

function writeDataset(fixture: AdapterFixture, manifest: Record<string, unknown>) {
  const directory = join(fixtureGate(fixture).fixtures, '_datasets', 'preview');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
}

function writeRawDataset(fixture: AdapterFixture, name: string, contents: string) {
  const directory = join(fixtureGate(fixture).fixtures, '_datasets', name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'manifest.json'), contents);
}

function dataset(entries: unknown[]) {
  return {
    formatVersion: 1,
    protocol: 'protocol-a',
    description: 'preview',
    entries,
  };
}

function evidence(
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `SCN-SCENARIO-GATE-028 ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: 'SCN-SCENARIO-GATE-028',
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id: 'SCN-SCENARIO-GATE-028', caseKey: caseId, checks }],
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
  'fixture-adapter-rules',
  [
    'fixture-delegated-by-protocol',
    'protocol-must-exist',
    'dataset-structure',
    'dataset-operation-resolved',
    'dataset-strict-shape',
  ],
  async (context, check) => {
    await check('fixture-delegated-by-protocol', async () => {
      const fixture = createFixture('fixture-adapter-rules-');
      await writeOwnerFixture(fixture, 'SCN-SAMPLE-CONTRACT-001', 'protocol-a');
      await writeOwnerFixture(fixture, 'SCN-SAMPLE-CONTRACT-002');
      const valid = await runFixtureCheck(fixture);
      context.expect(valid.issues).toEqual([]);
      context
        .expect(
          readAdapterCalls(fixture)
            .filter((call) => call.name === 'checkFixture')
            .map((call) => call.protocol),
        )
        .toEqual(['a']);
      context.expect(readAdapterCalls(fixture).some((call) => call.protocol === 'b')).toBe(false);

      const failing = createFixture('fixture-adapter-rules-failing-');
      writeFileSync(
        join(failing.root, 'adapter-control.json'),
        JSON.stringify({ failFixtureOwner: 'SCN-SAMPLE-CONTRACT-001' }),
      );
      await writeOwnerFixture(failing, 'SCN-SAMPLE-CONTRACT-001', 'protocol-a');
      const failed = await runFixtureCheck(failing);
      context
        .expect(failed.issues.join('\n'))
        .toContain('SCN-SAMPLE-CONTRACT-001: forced a fixture issue');
      context
        .expect(readAdapterCalls(failing).filter((call) => call.name === 'checkFixture'))
        .toHaveLength(1);

      writeFileSync(
        join(failing.root, 'adapter-control.json'),
        JSON.stringify({ throwFixtureOwner: 'SCN-SAMPLE-CONTRACT-001' }),
      );
      context
        .expect((await runFixtureCheck(failing)).issues.join('\n'))
        .toContain('protocol adapter protocol-a failed: forced a fixture error');
      writeFileSync(
        join(failing.root, 'adapter-control.json'),
        JSON.stringify({
          throwFixtureOwner: 'SCN-SAMPLE-CONTRACT-001',
          throwFixtureOwnerAsString: true,
        }),
      );
      context
        .expect((await runFixtureCheck(failing)).issues.join('\n'))
        .toContain('protocol adapter protocol-a failed: forced a fixture error');

      const cached = createFixture('fixture-adapter-rules-cached-');
      await writeOwnerFixture(cached, 'SCN-SAMPLE-CONTRACT-001', 'protocol-a');
      writeDataset(
        cached,
        dataset([{ operationId: 'a-op', responses: [{ body: { ok: true, status: 200 } }] }]),
      );
      context.expect((await runFixtureCheck(cached)).issues).toEqual([]);
      context
        .expect(readAdapterCalls(cached).filter((call) => call.name === 'checkFixture'))
        .toHaveLength(2);
    });

    await check('protocol-must-exist', async () => {
      const fixture = createFixture('fixture-adapter-rules-missing-protocol-');
      await writeOwnerFixture(fixture, 'SCN-SAMPLE-CONTRACT-001', 'missing-protocol');
      const result = await runFixtureCheck(fixture);
      context
        .expect(result.issues.join('\n'))
        .toContain('protocol missing-protocol is not a registered protocol package');
    });

    await check('dataset-structure', async () => {
      const fixture = createFixture('fixture-adapter-rules-dataset-structure-');
      writeDataset(
        fixture,
        dataset([{ operationId: 'a-op', responses: [{ body: { ok: true, status: 200 } }] }]),
      );
      context.expect((await runFixtureCheck(fixture)).issues).toEqual([]);

      writeDataset(fixture, {
        formatVersion: 1,
        description: 'missing protocol',
        entries: [{ operationId: 'a-op', responses: [{ body: { ok: true, status: 200 } }] }],
      });
      context.expect((await runFixtureCheck(fixture)).issues.join('\n')).toContain('protocol');

      writeDataset(fixture, dataset([{ operationId: 'op:a-op', responses: [] }]));
      context
        .expect((await runFixtureCheck(fixture)).issues.join('\n'))
        .toMatch(/responses|minItems/);

      mkdirSync(join(fixtureGate(fixture).fixtures, '_datasets', 'missing-manifest'), {
        recursive: true,
      });
      context
        .expect((await runFixtureCheck(fixture)).issues.join('\n'))
        .toContain('missing-manifest: dataset manifest.json missing');

      writeRawDataset(fixture, 'invalid-json', '{');
      context
        .expect((await runFixtureCheck(fixture)).issues.join('\n'))
        .toContain('invalid-json: dataset manifest JSON invalid');

      writeDataset(fixture, {
        ...dataset([{ operationId: 'a-op', responses: [{ body: { ok: true, status: 200 } }] }]),
        protocol: 'missing-protocol',
      });
      context
        .expect((await runFixtureCheck(fixture)).issues.join('\n'))
        .toContain('protocol missing-protocol is not a registered protocol package');
    });

    await check('dataset-operation-resolved', async () => {
      const fixture = createFixture('fixture-adapter-rules-operation-');
      writeDataset(
        fixture,
        dataset([
          {
            operationId: 'unknown-operation',
            responses: [{ body: { ok: true, status: 200 } }],
          },
        ]),
      );
      context
        .expect((await runFixtureCheck(fixture)).issues.join('\n'))
        .toContain('operationId unknown-operation cannot be resolved by protocol protocol-a');

      const missingAdapter = createAdapterFixture({
        missingAdapter: 'b',
        prefix: 'fixture-adapter-rules-missing-adapter-',
      });
      fixtures.push(missingAdapter);
      writeDataset(missingAdapter, {
        ...dataset([{ operationId: 'b-op', responses: [{ body: { ok: true, status: 200 } }] }]),
        protocol: 'protocol-b',
      });
      context
        .expect((await runFixtureCheck(missingAdapter)).issues.join('\n'))
        .toContain(
          'protocol adapter protocol-b failed: protocol package protocol-b is missing testing/adapter.ts',
        );
    });

    await check('dataset-strict-shape', async () => {
      const fixture = createFixture('fixture-adapter-rules-dataset-shape-');
      writeDataset(
        fixture,
        dataset([
          {
            operationId: 'a-op',
            responses: [{ status: 201, body: { ok: true, status: 200 } }],
          },
        ]),
      );
      context
        .expect((await runFixtureCheck(fixture)).issues.join('\n'))
        .toContain('response does not match a shape for status 201');

      const failing = createFixture('fixture-adapter-rules-dataset-check-');
      writeFileSync(
        join(failing.root, 'adapter-control.json'),
        JSON.stringify({ failDataset: true }),
      );
      writeDataset(
        failing,
        dataset([{ operationId: 'a-op', responses: [{ body: { ok: true, status: 200 } }] }]),
      );
      context
        .expect((await runFixtureCheck(failing)).issues.join('\n'))
        .toContain('forced a dataset issue');
      context
        .expect(
          readAdapterCalls(failing).filter(
            (call) => call.name === 'checkFixture' && call.detail.dataset === true,
          ),
        )
        .toHaveLength(1);

      writeFileSync(
        join(failing.root, 'adapter-control.json'),
        JSON.stringify({ throwDataset: true }),
      );
      context
        .expect((await runFixtureCheck(failing)).issues.join('\n'))
        .toContain('protocol adapter protocol-a failed: forced a dataset error');
      writeFileSync(
        join(failing.root, 'adapter-control.json'),
        JSON.stringify({ throwDataset: true, throwDatasetAsString: true }),
      );
      context
        .expect((await runFixtureCheck(failing)).issues.join('\n'))
        .toContain('protocol adapter protocol-a failed: forced a dataset error');
    });
  },
);
