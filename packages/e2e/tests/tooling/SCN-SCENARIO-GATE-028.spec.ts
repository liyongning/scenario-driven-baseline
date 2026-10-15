import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownerDigest, runFixtureCli, type ControlledFixtureRoot } from './fixture-gate-helpers.ts';
import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  createAdapterFixture,
  protocolKindBranchOffenders,
  readAdapterCalls,
  type AdapterFixture,
} from './protocol-adapter-fixture.ts';

const repositoryRoot = join(import.meta.dirname, '../../../..');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function fixtureGate(fixture: AdapterFixture): ControlledFixtureRoot {
  return {
    root: fixture.root,
    fixtures: join(fixture.root, 'packages/e2e/tests/fixtures'),
    specPath: join(fixture.root, 'openspec/specs/sample/spec.md'),
    env: process.env,
    cleanup: fixture.cleanup,
  };
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

function dataset(entries: unknown[]) {
  return {
    formatVersion: 1,
    protocol: 'protocol-a',
    description: 'preview',
    entries,
  };
}

function control(fixture: AdapterFixture, value: Record<string, unknown>) {
  writeFileSync(join(fixture.root, 'adapter-control.json'), JSON.stringify(value));
}

async function withFixture(body: (fixture: AdapterFixture) => void | Promise<void>) {
  const fixture = createAdapterFixture({ prefix: 'fixture-adapter-delegation-' });
  try {
    await body(fixture);
  } finally {
    fixture.cleanup();
  }
}

cliEvidence(
  'SCN-SCENARIO-GATE-028',
  'fixture-adapter-cli',
  [
    'fixture-delegated-by-protocol',
    'protocol-must-exist',
    'dataset-structure',
    'dataset-operation-resolved',
    'dataset-strict-shape',
    'no-kind-branching',
  ],
  async (context, check) => {
    await check('fixture-delegated-by-protocol', async () => {
      await withFixture(async (fixture) => {
        await writeOwnerFixture(fixture, 'SCN-SAMPLE-CONTRACT-001', 'protocol-a');
        await writeOwnerFixture(fixture, 'SCN-SAMPLE-CONTRACT-002');
        const result = runFixtureCli(fixtureGate(fixture));
        context.expect(result.status, result.stderr).toBe(0);
        context.expect(result.output.issues).toEqual([]);
        const calls = readAdapterCalls(fixture);
        context
          .expect(calls.filter((call) => call.name === 'checkFixture').map((call) => call.protocol))
          .toEqual(['a']);
        context.expect(calls.some((call) => call.protocol === 'b')).toBe(false);
      });

      await withFixture(async (fixture) => {
        control(fixture, { failFixtureOwner: 'SCN-SAMPLE-CONTRACT-001' });
        await writeOwnerFixture(fixture, 'SCN-SAMPLE-CONTRACT-001', 'protocol-a');
        const result = runFixtureCli(fixtureGate(fixture));
        context.expect(result.status).toBe(1);
        context
          .expect(result.output.issues.join('\n'))
          .toContain('SCN-SAMPLE-CONTRACT-001: forced a fixture issue');
        context
          .expect(readAdapterCalls(fixture).filter((call) => call.name === 'checkFixture'))
          .toHaveLength(1);
      });
    });

    await check('protocol-must-exist', async () => {
      await withFixture(async (fixture) => {
        await writeOwnerFixture(fixture, 'SCN-SAMPLE-CONTRACT-001', 'missing-protocol');
        const result = runFixtureCli(fixtureGate(fixture));
        context.expect(result.status).toBe(1);
        context
          .expect(result.output.issues.join('\n'))
          .toContain('protocol missing-protocol is not a registered protocol package');
      });
    });

    await check('dataset-structure', async () => {
      await withFixture(async (fixture) => {
        writeDataset(
          fixture,
          dataset([
            {
              operationId: 'a-op',
              responses: [{ body: { ok: true, status: 200 } }],
            },
          ]),
        );
        const valid = runFixtureCli(fixtureGate(fixture));
        context.expect(valid.status, valid.stderr).toBe(0);
        context.expect(valid.output.issues).toEqual([]);

        writeDataset(fixture, {
          formatVersion: 1,
          description: 'missing protocol',
          entries: [{ operationId: 'a-op', responses: [{ body: { ok: true, status: 200 } }] }],
        });
        const missingProtocol = runFixtureCli(fixtureGate(fixture));
        context.expect(missingProtocol.status).toBe(1);
        context.expect(missingProtocol.output.issues.join('\n')).toContain('protocol');

        writeDataset(fixture, dataset([{ operationId: 'op:a-op', responses: [] }]));
        const invalid = runFixtureCli(fixtureGate(fixture));
        context.expect(invalid.status).toBe(1);
        context.expect(invalid.output.issues.join('\n')).toMatch(/responses|minItems/);
      });
    });

    await check('dataset-operation-resolved', async () => {
      await withFixture(async (fixture) => {
        writeDataset(
          fixture,
          dataset([
            {
              operationId: 'unknown-operation',
              responses: [{ body: { ok: true, status: 200 } }],
            },
          ]),
        );
        const result = runFixtureCli(fixtureGate(fixture));
        context.expect(result.status).toBe(1);
        context
          .expect(result.output.issues.join('\n'))
          .toContain('operationId unknown-operation cannot be resolved by protocol protocol-a');
      });
    });

    await check('dataset-strict-shape', async () => {
      await withFixture(async (fixture) => {
        writeDataset(
          fixture,
          dataset([
            {
              operationId: 'a-op',
              responses: [{ status: 201, body: { ok: true, status: 200 } }],
            },
          ]),
        );
        const result = runFixtureCli(fixtureGate(fixture));
        context.expect(result.status).toBe(1);
        context
          .expect(result.output.issues.join('\n'))
          .toContain('response does not match a shape for status 201');
      });

      await withFixture(async (fixture) => {
        control(fixture, { failDataset: true });
        writeDataset(
          fixture,
          dataset([{ operationId: 'a-op', responses: [{ body: { ok: true, status: 200 } }] }]),
        );
        const result = runFixtureCli(fixtureGate(fixture));
        context.expect(result.status).toBe(1);
        context.expect(result.output.issues.join('\n')).toContain('forced a dataset issue');
        context
          .expect(
            readAdapterCalls(fixture).filter(
              (call) => call.name === 'checkFixture' && call.detail.dataset === true,
            ),
          )
          .toHaveLength(1);
      });
    });

    await check('no-kind-branching', () => {
      context.expect(protocolKindBranchOffenders(repositoryRoot)).toEqual([]);
    });
  },
  { timeoutMs: 30_000 },
);
