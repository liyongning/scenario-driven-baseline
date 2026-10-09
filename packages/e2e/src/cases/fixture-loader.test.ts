import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFixtureCase, resolveFixtureFile } from './fixture-loader.ts';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');

async function fixture(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'template-fixture-'));
  const ownerId = 'SCN-SAMPLE-CONTRACT-023';
  const directory = join(root, ownerId);
  await mkdir(directory);
  const data = JSON.stringify({ request: { tradeNo: 't-1' }, response: { ok: true } });
  await writeFile(join(directory, 'omitted.json'), data);
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      ownerId,
      sources: { spec: { path: 'spec.md', sha256: 'a'.repeat(64) }, idlCommit: 'b'.repeat(40) },
      cases: { omitted: 'omitted.json' },
      sha256: { 'omitted.json': digest(data) },
      ...overrides,
    }),
  );
  return { root, ownerId };
}

describe('loadFixtureCase', () => {
  it('loads a schema-valid case only when its owner, source, and digest agree', async () => {
    const input = await fixture();
    const loaded = await loadFixtureCase({ ...input, caseKey: 'omitted' });
    expect(loaded.data).toEqual({ request: { tradeNo: 't-1' }, response: { ok: true } });
    expect(loaded.manifest.ownerId).toBe(input.ownerId);
  });

  it('rejects owner/source version, digest, and path traversal mismatches', async () => {
    const wrongOwner = await fixture({ ownerId: 'SCN-SAMPLE-CONTRACT-999' });
    await expect(loadFixtureCase({ ...wrongOwner, caseKey: 'omitted' })).rejects.toThrow(/ownerId/);
    const wrongSource = await fixture({ sources: {} });
    await expect(loadFixtureCase({ ...wrongSource, caseKey: 'omitted' })).rejects.toThrow(
      /sources/,
    );
    const wrongDigest = await fixture({ sha256: { 'omitted.json': '0'.repeat(64) } });
    await expect(loadFixtureCase({ ...wrongDigest, caseKey: 'omitted' })).rejects.toThrow(/sha256/);
    const traversal = await fixture({ cases: { omitted: '../outside.json' } });
    await expect(loadFixtureCase({ ...traversal, caseKey: 'omitted' })).rejects.toThrow(
      /schema|path/i,
    );
    const undeclared = await fixture();
    await expect(loadFixtureCase({ ...undeclared, caseKey: 'unknown' })).rejects.toThrow(
      /not declared/,
    );
    expect(resolveFixtureFile('/fixtures/owner', 'case.json')).toBe('/fixtures/owner/case.json');
    expect(() => resolveFixtureFile('/fixtures/owner', '../outside.json')).toThrow(/escapes/);
  });
});
