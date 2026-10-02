import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkReleaseRecord,
  parseReleaseInput,
  readReleaseWorkspaceFacts,
  releaseMissingMessage,
  runReleaseCli,
  type ReleaseInput,
  type ReleaseWorkspaceFacts,
} from './check-release.ts';
import type { ReleaseSettings } from './lib/project-manifest.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const registryUrl = 'https://registry.test.invalid/api/v4/projects/9/packages/npm/';
const releaseSettings: ReleaseSettings = { registry: registryUrl, tagPrefix: 'payment-sdk-v' };

const record = (overrides: Partial<ReleaseInput> = {}): ReleaseInput => ({
  registry: registryUrl,
  execution: 'local',
  tag: 'payment-sdk-v0.1.0-alpha.1',
  sourceRevision: 'a'.repeat(40),
  sdk: { name: '@daqian/payment-sdk', version: '0.1.0-alpha.1', changed: true },
  protocol: { name: '@daqian/payment-protocol', version: '0.1.0', changed: false },
  ...overrides,
});

const facts = (overrides: Partial<ReleaseWorkspaceFacts> = {}): ReleaseWorkspaceFacts => ({
  sdk: { name: '@daqian/payment-sdk', version: '0.1.0-alpha.1', protocolDependency: 'workspace:*' },
  protocol: { name: '@daqian/payment-protocol', version: '0.1.0' },
  ...overrides,
});

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'payment-release-check-'));
  roots.push(root);
  mkdirSync(join(root, 'packages/payment-sdk'), { recursive: true });
  mkdirSync(join(root, 'packages/payment-protocol'), { recursive: true });
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify({
    packages: [
      { directory: 'payment-sdk', name: '@daqian/payment-sdk', role: 'product', private: false, allowedDirectories: ['src'] },
      { directory: 'payment-protocol', name: '@daqian/payment-protocol', role: 'protocol', private: false, allowedDirectories: ['src'] },
      { directory: 'e2e', name: '@daqian/payment-e2e', role: 'test', private: true, allowedDirectories: ['src'] },
    ],
    requiredCommands: ['check:fast'],
    testProjects: [{ name: 'sdk-unit', class: 'unit' }, { name: 'integration', class: 'integration' }],
    fingerprints: { sourceRoots: ['scripts'], hostRoots: [] },
    release: releaseSettings,
  }));
  writeFileSync(join(root, 'packages/payment-sdk/package.json'), JSON.stringify({
    name: '@daqian/payment-sdk',
    version: '0.1.0-alpha.1',
    dependencies: { '@daqian/payment-protocol': 'workspace:*' },
  }));
  writeFileSync(join(root, 'packages/payment-protocol/package.json'), JSON.stringify({
    name: '@daqian/payment-protocol',
    version: '0.1.0',
  }));
  return root;
}

describe('formal release record checker', () => {
  it('accepts only the version-oriented record and rejects tarball, digest and step fields', () => {
    expect(parseReleaseInput(record())).toEqual(record());
    expect(() => parseReleaseInput({ ...record(), unexpected: true })).toThrow(/unexpected field/);
    expect(() => parseReleaseInput({ ...record(), sdk: { ...record().sdk, tarball: 'sdk.tgz' } })).toThrow(/unexpected field tarball/);
    expect(() => parseReleaseInput({ ...record(), protocol: { ...record().protocol, digest: 'sha256:deadbeef' } })).toThrow(/unexpected field digest/);
    expect(() => parseReleaseInput({ ...record(), steps: [] })).toThrow(/unexpected field steps/);
  });

  it.each([
    ['non-object record', null],
    ['unexpected project field', { ...record(), targetProject: 1 }],
    ['invalid execution', { ...record(), execution: 'runner' }],
    ['empty tag', { ...record(), tag: '' }],
    ['invalid SDK version', { ...record(), sdk: { ...record().sdk, version: 'latest' } }],
    ['invalid protocol version', { ...record(), protocol: { ...record().protocol, version: '*' } }],
    ['invalid changed flag', { ...record(), sdk: { ...record().sdk, changed: 'yes' } }],
  ] as const)('rejects %s while parsing untrusted JSON', (_label, value) => {
    expect(() => parseReleaseInput(value)).toThrow();
  });

  it('validates the SDK tag, source revision, version-change relationship and workspace identities', () => {
    expect(checkReleaseRecord(record(), facts(), releaseSettings)).toEqual([]);
    expect(checkReleaseRecord(record({ execution: 'ci' }), facts(), releaseSettings)).toEqual([]);
    expect(checkReleaseRecord(record({ tag: 'payment-sdk-v9.9.9', sourceRevision: 'short' }), facts(), releaseSettings).join('\n')).toMatch(/tag|full commit SHA/);
    expect(checkReleaseRecord(record({ sdk: { ...record().sdk, changed: false }, protocol: { ...record().protocol, changed: true } }), facts(), releaseSettings).join('\n')).toMatch(/formal SDK release|protocol delivery/);
    expect(checkReleaseRecord(record(), facts({ sdk: { ...facts().sdk, version: '9.9.9', protocolDependency: '0.1.0' }, protocol: { ...facts().protocol, version: '9.9.9' } }), releaseSettings).join('\n')).toMatch(/SDK package identity|protocol package identity|workspace:\*/);
  });

  it('rejects drift against the manifest release settings and accepts a concrete manifest', () => {
    expect(checkReleaseRecord(record(), facts(), { registry: 'https://other.invalid/', tagPrefix: 'payment-sdk-v' }).join('\n')).toMatch(/registry does not match the project manifest/);
    expect(checkReleaseRecord(record(), facts(), { registry: 'https://gitlab.example/api/v4/projects/<PROJECT_ID>/packages/npm/', tagPrefix: 'payment-sdk-v' }).join('\n')).toMatch(/template placeholder/);
    expect(checkReleaseRecord(record(), facts()).join('\n')).toMatch(/release settings are missing from project.manifest.json/);
    expect(checkReleaseRecord(record({ sdk: { ...record().sdk, name: '@daqian/other' } }), facts(), releaseSettings).join('\n')).toMatch(/SDK package identity does not match/);
    expect(checkReleaseRecord(record({ protocol: { ...record().protocol, name: '@daqian/other' } }), facts(), releaseSettings).join('\n')).toMatch(/protocol package identity does not match/);
  });

  it('reports defensive validation issues even for programmatically malformed typed input', () => {
    const malformed = {
      ...record(),
      registry: 'https://wrong.invalid/',
      tag: 'wrong',
      sourceRevision: 'short',
      sdk: { ...record().sdk, version: 'latest' },
      protocol: { ...record().protocol, version: '*' },
    } as unknown as ReleaseInput;
    expect(checkReleaseRecord(malformed, undefined, releaseSettings).join('\n')).toMatch(/registry|invalid package version|tag|full commit SHA/);
  });

  it('reads package identities and workspace dependency without packing', async () => {
    const root = workspace();
    expect(await readReleaseWorkspaceFacts(root)).toEqual(facts());
    writeFileSync(join(root, 'packages/payment-sdk/package.json'), JSON.stringify({
      name: '@daqian/payment-sdk',
      version: '0.1.0-alpha.1',
    }));
    expect((await readReleaseWorkspaceFacts(root)).sdk.protocolDependency).toBe('');
  });

  it('runs the CLI with only a release record and current workspace manifests', async () => {
    const root = workspace();
    expect(await runReleaseCli([], root)).toEqual({ issues: ['--input is required'], exitCode: 1 });
    writeFileSync(join(root, 'release.json'), JSON.stringify(record()));
    expect(await runReleaseCli(['--input', 'release.json'], root)).toEqual({ issues: [], exitCode: 0 });
    writeFileSync(join(root, 'invalid.json'), JSON.stringify({ ...record(), sdk: { ...record().sdk, version: '9.9.9' }, tag: 'payment-sdk-v9.9.9' }));
    expect((await runReleaseCli(['--input', 'invalid.json'], root)).issues).toContain('SDK package identity does not match the current workspace');
    expect((await runReleaseCli(['--input', 'missing.json'], root)).issues.join('\n')).toContain('could not be read');
  });

  it('reports a manifest without release settings through the CLI', async () => {
    const root = workspace();
    const manifest = JSON.parse(readFileSync(join(root, 'project.manifest.json'), 'utf8')) as Record<string, unknown>;
    delete manifest.release;
    writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'release.json'), JSON.stringify(record()));
    expect(await runReleaseCli(['--input', 'release.json'], root)).toEqual({ issues: [releaseMissingMessage], exitCode: 1 });
  });
});
