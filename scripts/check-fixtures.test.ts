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
  // 受控仓库显式给出通用 ID 格式；默认格式由任务 9 更新，不在本用例范围内。
  await writeFile(join(root, 'scenario-gate.config.json'), JSON.stringify({
    scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
    flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
    ownerIdPattern: '^SCN-[A-Z0-9-]+$',
  }));
  const fixtureRoot = join(root, 'fixtures');
  const owner = join(fixtureRoot, 'SCN-SAMPLE-CONTRACT-001');
  await mkdir(owner, { recursive: true });
  const cases = { 'case.json': '{"request":"fixture","response":{}}' };
  await Promise.all(Object.entries(cases).map(([name, content]) => writeFile(join(owner, name), content)));
  const manifest = {
    formatVersion: 1, ownerId: 'SCN-SAMPLE-CONTRACT-001',
    sources: { spec: { path: 'spec.md', sha256: sha('spec-v1') }, idlCommit: 'a'.repeat(40) },
    cases: { case: 'case.json' },
    sha256: Object.fromEntries(Object.entries(cases).map(([name, content]) => [name, sha(content)])),
  };
  await writeFile(join(owner, 'manifest.json'), JSON.stringify(manifest));
  return { root, fixtureRoot, owner, manifest, cases };
}

describe('checkFixtures', () => {
  it('accepts complete source and digest facts', async () => {
    const input = await tree();
    expect((await checkFixtures({ fixtureRoot: input.fixtureRoot, repositoryRoot: input.root })).issues).toEqual([]);
    expect(await runFixturesCli(['node', 'script', '--root', input.fixtureRoot], input.root)).toMatchObject({ issues: [], exitCode: 0 });
    await mkdir(join(input.root, 'packages/e2e/tests'), { recursive: true });
    await mkdir(join(input.root, 'packages/e2e/tests/fixtures'));
    expect(await runFixturesCli([], input.root)).toMatchObject({ manifests: 0, issues: [], exitCode: 0 });
  });

  it('rejects stale sources, undeclared files, and digest drift', async () => {
    const input = await tree();
    await writeFile(join(input.root, 'spec.md'), 'spec-v2');
    await writeFile(join(input.owner, 'extra.json'), '{}');
    await writeFile(join(input.owner, 'case.json'), '{"request":"drifted","response":{}}');
    const result = await checkFixtures({ fixtureRoot: input.fixtureRoot, repositoryRoot: input.root });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('spec source digest is stale'),
      expect.stringContaining('undeclared fixture file extra.json'),
      expect.stringContaining('sha256 mismatch'),
    ]));
  });

  it('reports missing/invalid manifests, sources, declared files, and owner formats', async () => {
    const input = await tree();
    const missingManifest = join(input.fixtureRoot, 'SCN-SAMPLE-CORE-001');
    await mkdir(missingManifest);
    const invalidManifest = join(input.fixtureRoot, 'SCN-SAMPLE-CORE-002');
    await mkdir(invalidManifest); await writeFile(join(invalidManifest, 'manifest.json'), '{');
    const schemaInvalid = join(input.fixtureRoot, 'SCN-SAMPLE-CORE-003');
    await mkdir(schemaInvalid); await writeFile(join(schemaInvalid, 'manifest.json'), '{}');
    const validOther = join(input.fixtureRoot, 'SCN-SAMPLE-CORE-004');
    await mkdir(validOther); await writeFile(join(validOther, 'case.json'), '{}');
    await writeFile(join(validOther, 'manifest.json'), JSON.stringify({
      formatVersion: 1, ownerId: 'SCN-SAMPLE-CORE-004', sources: { idlCommit: 'a'.repeat(40) },
      cases: { case: 'case.json' }, sha256: { 'case.json': sha('{}') },
    }));
    const invalidOwnerDirectory = join(input.fixtureRoot, 'invalid-owner');
    await mkdir(invalidOwnerDirectory);
    await writeFile(join(invalidOwnerDirectory, 'manifest.json'), JSON.stringify({
      formatVersion: 1, ownerId: 'invalid-owner', sources: { idlCommit: 'a'.repeat(40) }, cases: { case: 'case.json' }, sha256: { 'case.json': sha('{}') },
    }));
    await writeFile(join(invalidOwnerDirectory, 'case.json'), '{}');

    await writeFile(join(input.owner, 'manifest.json'), JSON.stringify({
      ...input.manifest,
      ownerId: 'SCN-SAMPLE-CONTRACT-999',
      sources: { ...input.manifest.sources, spec: { path: 'missing.md', sha256: sha('missing') } },
      supportingFiles: { missing: 'missing.json' },
      sha256: { ...input.manifest.sha256, 'missing.json': sha('{}') },
    }));
    const result = await checkFixtures({ fixtureRoot: input.fixtureRoot, repositoryRoot: input.root });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('manifest.json missing'), expect.stringContaining('manifest JSON invalid'),
      expect.stringContaining('manifest schema'), expect.stringContaining('ownerId'),
      expect.stringContaining('spec source missing.md is missing'), expect.stringContaining('declared fixture file missing.json is missing'),
      expect.stringContaining('invalid-owner: ownerId does not match configured format'),
      expect.stringContaining('SCN-SAMPLE-CONTRACT-001: ownerId SCN-SAMPLE-CONTRACT-999 does not match directory'),
    ]));
  });
});
