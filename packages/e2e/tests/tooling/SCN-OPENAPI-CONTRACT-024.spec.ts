import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { openApiFixtureRoot } from './openapi-fixture.ts';
import { ownerDigest } from './fixture-gate-helpers.ts';

const repositoryRoot = join(import.meta.dirname, '../../../..');
const tsx = join(repositoryRoot, 'node_modules/.bin/tsx');
const fixturesScript = join(repositoryRoot, 'scripts/check-fixtures.ts');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const validEnvelope = {
  code: 0,
  message: 'ok',
  data: { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 },
};

function runFixtureGate(root: string) {
  const environment = { ...process.env };
  delete environment.SCENARIO_GATE_CHANGES;
  const result = spawnSync(
    tsx,
    [fixturesScript, '--root', join(root, 'packages/e2e/tests/fixtures')],
    { cwd: root, encoding: 'utf8', env: environment },
  );
  return {
    status: result.status,
    output: result.stdout ? (JSON.parse(result.stdout) as { issues: string[] }) : undefined,
    stderr: result.stderr,
  };
}

async function writeClaimFixture(
  root: string,
  input: Readonly<{
    body: unknown;
    manifest: Record<string, unknown>;
  }>,
) {
  const owner = 'SCN-OPENAPI-CONTRACT-024';
  const directory = join(root, 'packages/e2e/tests/fixtures', owner);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const caseText = JSON.stringify(input.body);
  writeFileSync(join(directory, 'case.json'), caseText);
  writeFileSync(
    join(directory, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      ownerId: owner,
      protocol: 'openapi',
      sources: { spec: { requirementDigest: await ownerDigest(root, owner) } },
      cases: { case: 'case.json' },
      sha256: { 'case.json': sha(caseText) },
      ...input.manifest,
    }),
  );
}

cliEvidence(
  'SCN-OPENAPI-CONTRACT-024',
  'check-fixtures-cli',
  ['unclaimed-rejected', 'dangling-claim-rejected'],
  async (context, check) => {
    const fixture = openApiFixtureRoot({
      owner: 'SCN-OPENAPI-CONTRACT-024',
      prefix: 'openapi-fixture-cli-',
    });
    try {
      await check('unclaimed-rejected', async () => {
        await writeClaimFixture(fixture.root, { body: { body: validEnvelope }, manifest: {} });
        const result = runFixtureGate(fixture.root);
        context.expect(result.status, result.stderr).toBe(1);
        context.expect(result.output?.issues.join('\n')).toContain('未被认领');
        context.expect(result.output?.issues.join('\n')).toContain('$.body');
      });

      await check('dangling-claim-rejected', async () => {
        await writeClaimFixture(fixture.root, {
          body: {},
          manifest: { envelopes: { '$.body': 'createTrade' } },
        });
        const result = runFixtureGate(fixture.root);
        context.expect(result.status, result.stderr).toBe(1);
        context.expect(result.output?.issues.join('\n')).toContain('登记路径不存在');
        context.expect(result.output?.issues.join('\n')).toContain('$.body');
      });
    } finally {
      fixture.cleanup();
    }
  },
  { timeoutMs: 30_000 },
);
