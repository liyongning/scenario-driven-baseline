import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFixtures, runFixturesCli } from './check-fixtures.ts';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

async function tree() {
  const root = await mkdtemp(join(tmpdir(), 'fixture-gate-'));
  const spec = join(root, 'spec.md');
  await writeFile(spec, 'spec-v1');
  const fixtureRoot = join(root, 'fixtures');
  const owner = join(fixtureRoot, 'TC-PAYSDK-CONTRACT-023');
  await mkdir(owner, { recursive: true });
  const cases = {
    'omitted.json': '{"request":{"tradeNo":"t"},"response":{}}',
    'sandbox.json': '{"request":{"tradeNo":"t","xpayEnv":"XPAY_ENV_SANDBOX"},"response":{}}',
    'prod.json': '{"request":{"tradeNo":"t","xpayEnv":"XPAY_ENV_PROD"},"response":{}}',
    'query-no-env.json': '{"request":{"tradeNo":"t"},"response":{}}',
  };
  await Promise.all(Object.entries(cases).map(([name, content]) => writeFile(join(owner, name), content)));
  const manifest = {
    formatVersion: 1, ownerId: 'TC-PAYSDK-CONTRACT-023',
    sources: { spec: { path: 'spec.md', sha256: sha('spec-v1') }, idlCommit: 'a'.repeat(40) },
    cases: { omitted: 'omitted.json', sandbox: 'sandbox.json', prod: 'prod.json', 'query-no-env': 'query-no-env.json' },
    sha256: Object.fromEntries(Object.entries(cases).map(([name, content]) => [name, sha(content)])),
  };
  await writeFile(join(owner, 'manifest.json'), JSON.stringify(manifest));
  return { root, fixtureRoot, owner, manifest, cases };
}

describe('checkFixtures', () => {
  it('accepts complete source, digest, and xpay presence facts', async () => {
    const input = await tree();
    expect((await checkFixtures({ fixtureRoot: input.fixtureRoot, repositoryRoot: input.root })).issues).toEqual([]);
    expect(await runFixturesCli(['node', 'script', '--root', input.fixtureRoot], input.root)).toMatchObject({ issues: [], exitCode: 0 });
    await mkdir(join(input.root, 'packages/e2e/tests'), { recursive: true });
    await mkdir(join(input.root, 'packages/e2e/tests/fixtures'));
    expect(await runFixturesCli([], input.root)).toMatchObject({ manifests: 0, issues: [], exitCode: 0 });
  });

  it('rejects stale sources, undeclared files, digest drift, and the four xpay presence mistakes', async () => {
    const input = await tree();
    await writeFile(join(input.root, 'spec.md'), 'spec-v2');
    await writeFile(join(input.owner, 'extra.json'), '{}');
    await writeFile(join(input.owner, 'sandbox.json'), '{"request":{"tradeNo":"t"},"response":{}}');
    await writeFile(join(input.owner, 'prod.json'), '{"request":{"tradeNo":"t","xpayEnv":"XPAY_ENV_SANDBOX"},"response":{}}');
    await writeFile(join(input.owner, 'omitted.json'), '{"request":{"tradeNo":"t","xpayEnv":null},"response":{}}');
    await writeFile(join(input.owner, 'query-no-env.json'), '{"request":{"tradeNo":"t","xpayEnv":"XPAY_ENV_PROD"},"response":{}}');
    const result = await checkFixtures({ fixtureRoot: input.fixtureRoot, repositoryRoot: input.root });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('spec source digest is stale'), expect.stringContaining('undeclared fixture file extra.json'),
      expect.stringContaining('sha256 mismatch'), expect.stringContaining('omitted must not contain xpayEnv'),
      expect.stringContaining('sandbox must encode XPAY_ENV_SANDBOX'), expect.stringContaining('prod must encode XPAY_ENV_PROD'),
      expect.stringContaining('query-no-env must not contain xpayEnv'),
    ]));
  });

  it('reports missing/invalid manifests, sources, declared files, required cases, and malformed case JSON', async () => {
    const input = await tree();
    const missingManifest = join(input.fixtureRoot, 'TC-PAYSDK-CORE-001');
    await mkdir(missingManifest);
    const invalidManifest = join(input.fixtureRoot, 'TC-PAYSDK-CORE-002');
    await mkdir(invalidManifest); await writeFile(join(invalidManifest, 'manifest.json'), '{');
    const schemaInvalid = join(input.fixtureRoot, 'TC-PAYSDK-CORE-003');
    await mkdir(schemaInvalid); await writeFile(join(schemaInvalid, 'manifest.json'), '{}');
    const validOther = join(input.fixtureRoot, 'TC-PAYSDK-CORE-004');
    await mkdir(validOther); await writeFile(join(validOther, 'case.json'), '{}');
    await writeFile(join(validOther, 'manifest.json'), JSON.stringify({
      formatVersion: 1, ownerId: 'TC-PAYSDK-CORE-004', sources: { idlCommit: 'a'.repeat(40) },
      cases: { case: 'case.json' }, sha256: { 'case.json': sha('{}') },
    }));

    const ownerManifestPath = join(input.owner, 'manifest.json');
    const omittedWithoutRequest = '{"response":{}}';
    await writeFile(join(input.owner, 'omitted.json'), omittedWithoutRequest);
    await writeFile(ownerManifestPath, JSON.stringify({
      ...input.manifest,
      ownerId: 'TC-PAYSDK-CONTRACT-999',
      sources: { ...input.manifest.sources, spec: { path: 'missing.md', sha256: sha('missing') } },
      cases: { omitted: 'omitted.json', prod: 'bad.json', 'query-no-env': 'query-no-env.json' },
      supportingFiles: { missing: 'missing.json' },
      sha256: { ...input.manifest.sha256, 'omitted.json': sha(omittedWithoutRequest), 'missing.json': sha('{}'), 'bad.json': sha('{') },
    }));
    await writeFile(join(input.owner, 'bad.json'), '{');
    const result = await checkFixtures({ fixtureRoot: input.fixtureRoot, repositoryRoot: input.root });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('manifest.json missing'), expect.stringContaining('manifest JSON invalid'),
      expect.stringContaining('manifest schema'), expect.stringContaining('ownerId'),
      expect.stringContaining('spec source missing.md is missing'), expect.stringContaining('declared fixture file missing.json is missing'),
      expect.stringContaining('bad.json is not valid JSON'), expect.stringContaining('required case sandbox'),
    ]));
  });
});
