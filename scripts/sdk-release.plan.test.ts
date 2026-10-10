import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanSource,
  createGitFixture,
  createReleaseFixture,
  cleanupReleaseRoots,
  releaseRecord,
  releaseSettings,
  registryUrl,
} from '../packages/e2e/tests/tooling/sdk-release-fixture.ts';
import { createSdkReleasePlan, inspectReleaseSource, runSdkRelease } from './sdk-release';
import type { CommandExecutor, RegistryInspector } from './sdk-release';

afterEach(() => {
  vi.unstubAllEnvs();
  cleanupReleaseRoots();
});

test('source inspection independently reports HEAD, tag target and untracked dirtiness', async () => {
  const value = createGitFixture();
  expect(await inspectReleaseSource(value.root, value.record.tag)).toEqual({
    headRevision: value.record.sourceRevision,
    tagRevision: value.record.sourceRevision,
    clean: true,
  });
  writeFileSync(join(value.root, 'untracked.txt'), 'dirty');
  expect((await inspectReleaseSource(value.root, value.record.tag)).clean).toBe(false);
});

test.each([
  ['HEAD mismatch', { headRevision: 'b'.repeat(40), tagRevision: 'b'.repeat(40), clean: true }],
  ['tag mismatch', { headRevision: 'a'.repeat(40), tagRevision: 'b'.repeat(40), clean: true }],
  ['dirty checkout', { headRevision: 'a'.repeat(40), tagRevision: 'a'.repeat(40), clean: false }],
] as const)('release blocks %s before registry access or commands', async (_label, source) => {
  const value = createReleaseFixture();
  const executor = vi.fn<CommandExecutor>();
  const inspector = vi.fn<RegistryInspector>();
  await expect(
    runSdkRelease({ ...value }, 'fixture-token', executor, {
      root: value.root,
      sourceInspector: async () => source,
      registryInspector: inspector,
    }),
  ).rejects.toThrow(/source|tag|clean/i);
  expect(executor).not.toHaveBeenCalled();
  expect(inspector).not.toHaveBeenCalled();
  expect(existsSync(value.resultPath)).toBe(false);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({
    status: 'failed',
  });
});

test('source preflight failure removes a stale success result and replaces the completed checkpoint', async () => {
  const value = createReleaseFixture();
  mkdirSync(join(value.root, 'artifacts/release'), { recursive: true });
  writeFileSync(value.resultPath, '{"status":"stale-success"}\n');
  writeFileSync(value.checkpointPath, '{"status":"completed"}\n');
  await expect(
    runSdkRelease(value, 'fixture-token', vi.fn(), {
      root: value.root,
      sourceInspector: async () => {
        throw new Error('git inspection failed');
      },
    }),
  ).rejects.toThrow('git inspection failed');
  expect(existsSync(value.resultPath)).toBe(false);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({
    status: 'failed',
    sourceRevision: value.record.sourceRevision,
    error: 'git inspection failed',
  });
});

test('release rejects a semantically invalid version plan before source inspection', async () => {
  const value = createReleaseFixture();
  const sourceInspector = vi.fn(cleanSource);
  await expect(
    runSdkRelease(
      { ...value, record: releaseRecord({ sdk: { ...value.record.sdk, changed: false } }) },
      'fixture-token',
      vi.fn(),
      {
        root: value.root,
        sourceInspector,
      },
    ),
  ).rejects.toThrow(/requires an SDK version change/);
  expect(sourceInspector).not.toHaveBeenCalled();
});

test('formal plan publishes missing workspaces in dependency order and never packs or consumes tarballs', () => {
  const value = createReleaseFixture();
  const plan = createSdkReleasePlan({
    record: value.record,
    protocolState: 'missing',
    sdkState: 'missing',
    release: releaseSettings,
  });
  expect(plan.map((step) => step.name)).toEqual([
    'build-protocol',
    'publish-protocol',
    'build-sdk',
    'publish-sdk',
  ]);
  expect(plan.map((step) => step.command.args)).toEqual([
    ['--filter', '@daqian/template-protocol', 'run', 'build'],
    [
      '--filter',
      '@daqian/template-protocol',
      'publish',
      '--no-git-checks',
      '--registry',
      registryUrl,
      `--@daqian:registry=${registryUrl}`,
    ],
    ['--filter', '@daqian/template-sdk', 'run', 'build'],
    [
      '--filter',
      '@daqian/template-sdk',
      'publish',
      '--no-git-checks',
      '--registry',
      registryUrl,
      `--@daqian:registry=${registryUrl}`,
    ],
  ]);
  expect(plan.flatMap((step) => step.command.args)).not.toEqual(
    expect.arrayContaining(['pack', 'check:package']),
  );
  expect(plan.flatMap((step) => step.command.args).join(' ')).not.toMatch(/\.tgz|sha256/);
  expect(
    createSdkReleasePlan({
      record: value.record,
      protocolState: 'existing',
      sdkState: 'missing',
      release: releaseSettings,
    }).map((step) => step.name),
  ).toEqual(['build-sdk', 'publish-sdk']);
  expect(
    createSdkReleasePlan({
      record: value.record,
      protocolState: 'existing',
      sdkState: 'existing',
      release: releaseSettings,
    }),
  ).toEqual([]);
});

test('release plan rejects a template placeholder registry before building commands', () => {
  const value = createReleaseFixture();
  expect(() =>
    createSdkReleasePlan({
      record: value.record,
      release: {
        registry: 'https://gitlab.example.invalid/api/v4/projects/<PROJECT_ID>/packages/npm/',
        tagPrefix: 'template-sdk-v',
      },
    }),
  ).toThrow(/template placeholder/);
});

test('release refuses a manifest without release settings before touching the registry', async () => {
  const value = createReleaseFixture();
  const manifest = JSON.parse(
    readFileSync(join(value.root, 'project.manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  delete manifest.release;
  writeFileSync(join(value.root, 'project.manifest.json'), JSON.stringify(manifest));
  const inspector = vi.fn<RegistryInspector>();
  await expect(
    runSdkRelease(value, 'fixture-token', vi.fn(), {
      root: value.root,
      sourceInspector: cleanSource,
      registryInspector: inspector,
    }),
  ).rejects.toThrow(/release settings are missing from project.manifest.json/);
  expect(inspector).not.toHaveBeenCalled();
});
