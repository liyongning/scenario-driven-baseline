import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { type ReleaseInput } from './check-release';
import type { ReleaseSettings } from './lib/project-manifest.ts';
import {
  createSdkReleasePlan,
  inspectReleaseSource,
  runSdkRelease,
  runSdkReleaseCli,
  type CommandExecutor,
  type RegistryInspector,
  type ReleaseCommand,
} from './sdk-release';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const cleanSource = async () => ({ headRevision: 'a'.repeat(40), tagRevision: 'a'.repeat(40), clean: true });

const registryUrl = 'https://registry.test.invalid/api/v4/projects/9/packages/npm/';
const releaseSettings: ReleaseSettings = { registry: registryUrl, tagPrefix: 'template-sdk-v' };

function record(overrides: Partial<ReleaseInput> = {}): ReleaseInput {
  return {
    registry: registryUrl,
    execution: 'local',
    tag: 'template-sdk-v0.1.0-alpha.1',
    sourceRevision: 'a'.repeat(40),
    sdk: { name: '@daqian/template-sdk', version: '0.1.0-alpha.1', changed: true },
    protocol: { name: '@daqian/template-protocol', version: '0.1.0', changed: false },
    ...overrides,
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sdk-release-test-'));
  roots.push(root);
  mkdirSync(join(root, 'packages/sdk'), { recursive: true });
  mkdirSync(join(root, 'packages/protocol'), { recursive: true });
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify({
    packages: [
      { directory: 'sdk', name: '@daqian/template-sdk', role: 'product', private: false, allowedDirectories: ['src'] },
      { directory: 'protocol', name: '@daqian/template-protocol', role: 'protocol', private: false, allowedDirectories: ['src'] },
      { directory: 'e2e', name: '@daqian/template-e2e', role: 'test', private: true, allowedDirectories: ['src'] },
    ],
    requiredCommands: ['check:fast'],
    testProjects: [{ name: 'sdk-unit', class: 'unit' }, { name: 'integration', class: 'integration' }],
    fingerprints: { sourceRoots: ['scripts'], hostRoots: [] },
    release: releaseSettings,
  }));
  writeFileSync(join(root, 'packages/sdk/package.json'), JSON.stringify({
    name: '@daqian/template-sdk',
    version: '0.1.0-alpha.1',
    dependencies: { '@daqian/template-protocol': 'workspace:*' },
  }));
  writeFileSync(join(root, 'packages/protocol/package.json'), JSON.stringify({
    name: '@daqian/template-protocol',
    version: '0.1.0',
  }));
  return {
    root,
    record: record(),
    resultPath: join(root, 'artifacts/release/release-result.json'),
    checkpointPath: join(root, 'artifacts/release/release-checkpoint.json'),
  };
}

function registry(initial: Partial<Record<'@daqian/template-sdk' | '@daqian/template-protocol', 'missing' | 'existing'>> = {}) {
  const states = new Map<string, 'missing' | 'existing'>([
    ['@daqian/template-protocol', initial['@daqian/template-protocol'] ?? 'missing'],
    ['@daqian/template-sdk', initial['@daqian/template-sdk'] ?? 'missing'],
  ]);
  const inspections: Array<{ name: string; config?: string }> = [];
  const inspector: RegistryInspector = async (request, env) => {
    inspections.push({ name: request.name, ...(env.NPM_CONFIG_USERCONFIG ? { config: env.NPM_CONFIG_USERCONFIG } : {}) });
    return { state: states.get(request.name)! };
  };
  const executor: CommandExecutor = async command => {
    if (!command.args.includes('publish')) return;
    const name = command.args[1] as '@daqian/template-sdk' | '@daqian/template-protocol';
    states.set(name, 'existing');
  };
  return { states, inspections, inspector, executor };
}

function gitFixture() {
  const value = fixture();
  execFileSync('git', ['init', '--quiet'], { cwd: value.root });
  execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: value.root });
  execFileSync('git', ['config', 'user.email', 'release@example.invalid'], { cwd: value.root });
  execFileSync('git', ['add', '.'], { cwd: value.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: value.root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: value.root, encoding: 'utf8' }).trim();
  execFileSync('git', ['tag', value.record.tag], { cwd: value.root });
  return { ...value, record: record({ sourceRevision: revision }) };
}

function releaseSnapshot(before: ReadonlySet<string>): string {
  const directory = readdirSync(tmpdir())
    .filter(name => name.startsWith('template-sdk-release-') && !name.startsWith('template-sdk-release-auth-') && !before.has(name))
    .map(name => ({ name, mtime: statSync(join(tmpdir(), name)).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime)[0]?.name;
  if (!directory) throw new Error('release snapshot directory not found');
  return join(tmpdir(), directory, 'release-record.json');
}

test('source inspection independently reports HEAD, tag target and untracked dirtiness', async () => {
  const value = gitFixture();
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
  const value = fixture();
  const executor = vi.fn<CommandExecutor>();
  const inspector = vi.fn<RegistryInspector>();
  await expect(runSdkRelease({ ...value }, 'fixture-token', executor, {
    root: value.root,
    sourceInspector: async () => source,
    registryInspector: inspector,
  })).rejects.toThrow(/source|tag|clean/i);
  expect(executor).not.toHaveBeenCalled();
  expect(inspector).not.toHaveBeenCalled();
  expect(existsSync(value.resultPath)).toBe(false);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({ status: 'failed' });
});

test('source preflight failure removes a stale success result and replaces the completed checkpoint', async () => {
  const value = fixture();
  mkdirSync(join(value.root, 'artifacts/release'), { recursive: true });
  writeFileSync(value.resultPath, '{"status":"stale-success"}\n');
  writeFileSync(value.checkpointPath, '{"status":"completed"}\n');
  await expect(runSdkRelease(value, 'fixture-token', vi.fn(), {
    root: value.root,
    sourceInspector: async () => { throw new Error('git inspection failed'); },
  })).rejects.toThrow('git inspection failed');
  expect(existsSync(value.resultPath)).toBe(false);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({
    status: 'failed',
    sourceRevision: value.record.sourceRevision,
    error: 'git inspection failed',
  });
});

test('release rejects a semantically invalid version plan before source inspection', async () => {
  const value = fixture();
  const sourceInspector = vi.fn(cleanSource);
  await expect(runSdkRelease({ ...value, record: record({ sdk: { ...value.record.sdk, changed: false } }) }, 'fixture-token', vi.fn(), {
    root: value.root,
    sourceInspector,
  })).rejects.toThrow(/requires an SDK version change/);
  expect(sourceInspector).not.toHaveBeenCalled();
});

test('formal plan publishes missing workspaces in dependency order and never packs or consumes tarballs', () => {
  const value = fixture();
  const plan = createSdkReleasePlan({ record: value.record, protocolState: 'missing', sdkState: 'missing', release: releaseSettings });
  expect(plan.map(step => step.name)).toEqual(['build-protocol', 'publish-protocol', 'build-sdk', 'publish-sdk']);
  expect(plan.map(step => step.command.args)).toEqual([
    ['--filter', '@daqian/template-protocol', 'run', 'build'],
    ['--filter', '@daqian/template-protocol', 'publish', '--no-git-checks', '--registry', registryUrl, `--@daqian:registry=${registryUrl}`],
    ['--filter', '@daqian/template-sdk', 'run', 'build'],
    ['--filter', '@daqian/template-sdk', 'publish', '--no-git-checks', '--registry', registryUrl, `--@daqian:registry=${registryUrl}`],
  ]);
  expect(plan.flatMap(step => step.command.args)).not.toEqual(expect.arrayContaining(['pack', 'check:package']));
  expect(plan.flatMap(step => step.command.args).join(' ')).not.toMatch(/\.tgz|sha256/);
  expect(createSdkReleasePlan({ record: value.record, protocolState: 'existing', sdkState: 'missing', release: releaseSettings }).map(step => step.name)).toEqual(['build-sdk', 'publish-sdk']);
  expect(createSdkReleasePlan({ record: value.record, protocolState: 'existing', sdkState: 'existing', release: releaseSettings })).toEqual([]);
});

test('release plan rejects a template placeholder registry before building commands', () => {
  const value = fixture();
  expect(() => createSdkReleasePlan({
    record: value.record,
    release: { registry: 'https://gitlab.example.invalid/api/v4/projects/<PROJECT_ID>/packages/npm/', tagPrefix: 'template-sdk-v' },
  })).toThrow(/template placeholder/);
});

test('release refuses a manifest without release settings before touching the registry', async () => {
  const value = fixture();
  const manifest = JSON.parse(readFileSync(join(value.root, 'project.manifest.json'), 'utf8')) as Record<string, unknown>;
  delete manifest.release;
  writeFileSync(join(value.root, 'project.manifest.json'), JSON.stringify(manifest));
  const inspector = vi.fn<RegistryInspector>();
  await expect(runSdkRelease(value, 'fixture-token', vi.fn(), {
    root: value.root,
    sourceInspector: cleanSource,
    registryInspector: inspector,
  })).rejects.toThrow(/release settings are missing from project.manifest.json/);
  expect(inspector).not.toHaveBeenCalled();
});

test('a product build failure blocks publication and leaves no success result', async () => {
  const value = fixture();
  const controlled = registry();
  const calls: ReleaseCommand[] = [];
  await expect(runSdkRelease(value, 'fixture-token', async command => {
    calls.push(command);
    if (command.args.includes('build')) throw new Error('product build failed');
    await controlled.executor(command, {});
  }, { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector })).rejects.toThrow('product build failed');
  expect(calls.map(command => command.args)).toEqual([
    ['--filter', '@daqian/template-protocol', 'run', 'build'],
  ]);
  expect(existsSync(value.resultPath)).toBe(false);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({ status: 'failed', error: 'product build failed' });
});

test('default registry inspection overrides the repository scoped registry with project 245', async () => {
  const value = fixture();
  writeFileSync(join(value.root, '.npmrc'), '@daqian:registry=https://gitlab.daqian369.com/api/v4/projects/216/packages/npm/\n');
  const bin = join(value.root, 'bin');
  const log = join(value.root, 'npm-args.jsonl');
  mkdirSync(bin);
  const npm = join(bin, 'npm');
  writeFileSync(npm, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.RELEASE_NPM_ARGS_LOG, JSON.stringify(args) + '\\n');
const packageSpec = args[1];
process.stdout.write(JSON.stringify(packageSpec.slice(packageSpec.lastIndexOf('@') + 1)) + '\\n');
`);
  chmodSync(npm, 0o755);
  await runSdkRelease(value, 'fixture-token', vi.fn(), {
    root: value.root,
    sourceInspector: cleanSource,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, RELEASE_NPM_ARGS_LOG: log },
  });
  const invocations = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[]);
  expect(invocations).toHaveLength(4);
  expect(invocations.every(args => args.includes(`--@daqian:registry=${registryUrl}`))).toBe(true);
});

test('release publishes protocol before SDK, verifies both, and promotes the result last', async () => {
  const value = fixture();
  const controlled = registry();
  const calls: ReleaseCommand[] = [];
  await runSdkRelease(value, 'fixture-token', async (command, env) => {
    calls.push(command);
    await controlled.executor(command, env);
  }, { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector });
  expect(calls.map(command => [command.args[1], command.args[2], command.args[3]])).toEqual([
    ['@daqian/template-protocol', 'run', 'build'],
    ['@daqian/template-protocol', 'publish', '--no-git-checks'],
    ['@daqian/template-sdk', 'run', 'build'],
    ['@daqian/template-sdk', 'publish', '--no-git-checks'],
  ]);
  expect(controlled.inspections.map(item => item.name)).toEqual([
    '@daqian/template-protocol', '@daqian/template-protocol', '@daqian/template-sdk', '@daqian/template-sdk',
  ]);
  const result = JSON.parse(readFileSync(value.resultPath, 'utf8')) as { sdk: { releaseAction: string }; protocol: { releaseAction: string }; steps: Array<{ name: string }> };
  expect(result.protocol.releaseAction).toBe('published');
  expect(result.sdk.releaseAction).toBe('published');
  expect(result.steps.map(step => step.name)).toEqual([
    'inspect-protocol', 'build-protocol', 'publish-protocol', 'verify-protocol', 'inspect-sdk', 'build-sdk', 'publish-sdk', 'verify-sdk',
  ]);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({ status: 'completed' });
});

test('release reuses readable versions without republishing or comparing artifact bytes', async () => {
  const value = fixture();
  const controlled = registry({ '@daqian/template-protocol': 'existing', '@daqian/template-sdk': 'existing' });
  const executor = vi.fn<CommandExecutor>();
  await runSdkRelease(value, 'fixture-token', executor, { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector });
  expect(executor).not.toHaveBeenCalled();
  const result = JSON.parse(readFileSync(value.resultPath, 'utf8')) as { sdk: { releaseAction: string }; protocol: { releaseAction: string } };
  expect(result.protocol.releaseAction).toBe('reused');
  expect(result.sdk.releaseAction).toBe('reused');
});

test('temporary 0600 registry auth is isolated from the inherited environment and removed', async () => {
  const value = fixture();
  const controlled = registry();
  const calls: Array<{ command: ReleaseCommand; config?: string; token?: string; lower?: string; mixed?: string }> = [];
  await runSdkRelease(value, 'fixture-token', async (command, env) => {
    calls.push({
      command,
      ...(env.NPM_CONFIG_USERCONFIG ? { config: env.NPM_CONFIG_USERCONFIG } : {}),
      ...(env.RELEASE_TEST_TOKEN ? { token: env.RELEASE_TEST_TOKEN } : {}),
      ...(env.npm_config_userconfig ? { lower: env.npm_config_userconfig } : {}),
      ...(env.NpM_CoNfIg_UsErCoNfIg ? { mixed: env.NpM_CoNfIg_UsErCoNfIg } : {}),
    });
    if (command.args.includes('publish')) {
      const config = env.NPM_CONFIG_USERCONFIG!;
      expect(statSync(config).mode & 0o777).toBe(0o600);
      expect(readFileSync(config, 'utf8')).toContain('_authToken=fixture-token');
    }
    await controlled.executor(command, env);
  }, {
    root: value.root,
    sourceInspector: cleanSource,
    registryInspector: async (request, env) => {
      expect(env.NPM_CONFIG_USERCONFIG).toBeDefined();
      return controlled.inspector(request, env);
    },
    env: {
      ...process.env,
      RELEASE_TEST_TOKEN: 'fixture-token',
      NPM_CONFIG_USERCONFIG: '/tmp/untrusted',
      npm_config_userconfig: '/tmp/lower',
      NpM_CoNfIg_UsErCoNfIg: '/tmp/mixed',
    },
    tokenEnv: 'RELEASE_TEST_TOKEN',
  });
  expect(calls.every(call => call.token === undefined && call.lower === undefined && call.mixed === undefined)).toBe(true);
  expect(calls.filter(call => call.command.args.includes('build')).every(call => call.config === undefined)).toBe(true);
  const config = calls.find(call => call.command.args.includes('publish'))!.config!;
  expect(() => readFileSync(config)).toThrow();
});

test('protocol publication failure blocks SDK publication and leaves only a failed checkpoint', async () => {
  const value = fixture();
  mkdirSync(join(value.root, 'artifacts/release'), { recursive: true });
  writeFileSync(value.resultPath, '{"stale":true}\n', { flag: 'wx' });
  const controlled = registry();
  const calls: ReleaseCommand[] = [];
  await expect(runSdkRelease(value, 'fixture-token', async command => {
    calls.push(command);
    if (command.args.includes('publish')) throw new Error('protocol upload failed');
  }, { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector })).rejects.toThrow('protocol upload failed');
  expect(calls.map(command => [command.args[1], command.args[2]])).toEqual([
    ['@daqian/template-protocol', 'run'],
    ['@daqian/template-protocol', 'publish'],
  ]);
  expect(existsSync(value.resultPath)).toBe(false);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({ status: 'failed', error: 'protocol upload failed' });
});

test('an unreadable protocol after publish blocks the SDK', async () => {
  const value = fixture();
  const calls: ReleaseCommand[] = [];
  const inspector: RegistryInspector = async () => ({ state: 'missing' });
  await expect(runSdkRelease(value, 'fixture-token', async command => { calls.push(command); }, {
    root: value.root,
    sourceInspector: cleanSource,
    registryInspector: inspector,
  })).rejects.toThrow(/protocol package is not readable/);
  expect(calls.map(command => [command.args[1], command.args[2]])).toEqual([
    ['@daqian/template-protocol', 'run'],
    ['@daqian/template-protocol', 'publish'],
  ]);
  expect(existsSync(value.resultPath)).toBe(false);
});

test('a retry reuses the published protocol after a partial SDK failure', async () => {
  const value = fixture();
  const controlled = registry();
  await expect(runSdkRelease(value, 'fixture-token', async (command, env) => {
    if (command.args[1] === '@daqian/template-sdk') throw new Error('SDK upload failed');
    await controlled.executor(command, env);
  }, { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector })).rejects.toThrow('SDK upload failed');
  expect(controlled.states.get('@daqian/template-protocol')).toBe('existing');
  expect(existsSync(value.resultPath)).toBe(false);

  const retryCalls: ReleaseCommand[] = [];
  await runSdkRelease(value, 'fixture-token', async (command, env) => {
    retryCalls.push(command);
    await controlled.executor(command, env);
  }, { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector });
  expect(retryCalls.map(command => [command.args[1], command.args[2]])).toEqual([
    ['@daqian/template-sdk', 'run'],
    ['@daqian/template-sdk', 'publish'],
  ]);
});

test('late checkpoint failure cannot leave a formal success result', async () => {
  const value = fixture();
  const controlled = registry();
  const inspector: RegistryInspector = async (request, env) => {
    const result = await controlled.inspector(request, env);
    if (request.name === '@daqian/template-sdk' && result.state === 'existing') {
      rmSync(value.checkpointPath, { force: true });
      mkdirSync(value.checkpointPath);
    }
    return result;
  };
  await expect(runSdkRelease(value, 'fixture-token', controlled.executor, {
    root: value.root,
    sourceInspector: cleanSource,
    registryInspector: inspector,
  })).rejects.toThrow(/checkpoint|release failed/i);
  expect(existsSync(value.resultPath)).toBe(false);
});

test('release rejects permission and content changes to its frozen record snapshot', async () => {
  for (const mutation of ['permission', 'content'] as const) {
    const value = fixture();
    const controlled = registry();
    const before = new Set(readdirSync(tmpdir()));
    const inspector: RegistryInspector = async (request, env) => {
      const snapshot = releaseSnapshot(before);
      if (mutation === 'permission') chmodSync(snapshot, 0o600);
      else {
        chmodSync(snapshot, 0o600);
        writeFileSync(snapshot, `${readFileSync(snapshot, 'utf8')} `);
        chmodSync(snapshot, 0o400);
      }
      return controlled.inspector(request, env);
    };
    await expect(runSdkRelease(value, 'fixture-token', controlled.executor, {
      root: value.root,
      sourceInspector: cleanSource,
      registryInspector: inspector,
    })).rejects.toThrow(/record snapshot.*(integrity|content)/i);
    expect(existsSync(value.resultPath)).toBe(false);
  }
});

test('release blocks result symlinks introduced after initial path validation', async () => {
  const value = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'sdk-release-race-'));
  roots.push(outside);
  mkdirSync(join(value.root, 'artifacts/release'), { recursive: true });
  await expect(runSdkRelease(value, 'fixture-token', vi.fn(), {
    root: value.root,
    sourceInspector: async () => {
      symlinkSync(join(outside, 'result.json'), value.resultPath);
      return cleanSource();
    },
  })).rejects.toThrow(/symbolic link/i);
});

test('release blocks result targets or ancestors replaced during publication', async () => {
  for (const mutation of ['target', 'ancestor'] as const) {
    const value = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'sdk-release-output-race-'));
    roots.push(outside);
    const controlled = registry();
    await expect(runSdkRelease(value, 'fixture-token', async (command, env) => {
      await controlled.executor(command, env);
      if (mutation === 'target') symlinkSync(join(outside, 'result.json'), value.resultPath);
      else {
        const releaseDirectory = join(value.root, 'artifacts/release');
        renameSync(releaseDirectory, `${releaseDirectory}-original`);
        symlinkSync(outside, releaseDirectory, 'dir');
      }
    }, { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector })).rejects.toThrow(/symbolic link|path identity/i);
    expect(existsSync(value.resultPath)).toBe(false);
  }
});

test('release propagates filesystem errors while validating output components', async () => {
  const value = fixture();
  const blocker = join(value.root, 'not-a-directory');
  writeFileSync(blocker, 'file');
  await expect(runSdkRelease({
    ...value,
    resultPath: join(blocker, 'release-result.json'),
    checkpointPath: join(blocker, 'release-checkpoint.json'),
  }, 'fixture-token', vi.fn(), { root: value.root, sourceInspector: cleanSource })).rejects.toMatchObject({ code: 'ENOTDIR' });
});

test('an unreadable SDK after publish leaves no success result', async () => {
  const value = fixture();
  const states = registry({ '@daqian/template-protocol': 'existing' });
  const inspector: RegistryInspector = async request => ({
    state: request.name === '@daqian/template-protocol' ? 'existing' : 'missing',
  });
  await expect(runSdkRelease(value, 'fixture-token', states.executor, {
    root: value.root,
    sourceInspector: cleanSource,
    registryInspector: inspector,
  })).rejects.toThrow(/SDK package is not readable/);
  expect(existsSync(value.resultPath)).toBe(false);
});

test('release rejects absent credentials and preserves non-Error failures in the checkpoint', async () => {
  const value = fixture();
  await expect(runSdkRelease(value, '', vi.fn(), { root: value.root, sourceInspector: cleanSource })).rejects.toThrow('release token is required');
  const controlled = registry();
  await expect(runSdkRelease(value, 'fixture-token', async () => { throw 'plain failure'; }, {
    root: value.root,
    sourceInspector: cleanSource,
    registryInspector: controlled.inspector,
  })).rejects.toBe('plain failure');
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({ status: 'failed', error: 'plain failure' });
});

test('release uses the real Git inspector when no source override is supplied', async () => {
  const value = gitFixture();
  const controlled = registry({ '@daqian/template-protocol': 'existing', '@daqian/template-sdk': 'existing' });
  await runSdkRelease(value, 'fixture-token', vi.fn(), { root: value.root, registryInspector: controlled.inspector });
  expect(existsSync(value.resultPath)).toBe(true);
});

test('release rejects dangling result symlinks and output paths outside the repository', async () => {
  const value = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'sdk-release-outside-'));
  roots.push(outside);
  mkdirSync(join(value.root, 'artifacts/release'), { recursive: true });
  symlinkSync(join(outside, 'missing.json'), value.resultPath);
  await expect(runSdkRelease(value, 'fixture-token', vi.fn(), { root: value.root, sourceInspector: cleanSource })).rejects.toThrow(/symbolic link/i);
  await expect(runSdkRelease({ ...value, resultPath: join(value.root, '..', 'outside.json') }, 'fixture-token', vi.fn(), { root: value.root, sourceInspector: cleanSource })).rejects.toThrow(/inside the repository/i);
});

test('release CLI requires explicit token input and rejects malformed or escaping paths before execution', async () => {
  const value = fixture();
  await expect(runSdkReleaseCli([], value.root)).rejects.toThrow('--input is required');
  await expect(runSdkReleaseCli(['--input', 'missing.json'], value.root)).rejects.toThrow('--token-env is required');
  vi.stubEnv('RELEASE_TEST_TOKEN', 'fixture-token');
  await expect(runSdkReleaseCli(['--input', 'missing.json', '--token-env', 'RELEASE_TEST_TOKEN'], value.root)).rejects.toThrow(/does not exist/);
  await expect(runSdkReleaseCli(['--input', '../record.json', '--token-env', 'RELEASE_TEST_TOKEN'], value.root)).rejects.toThrow(/inside the repository/);
  writeFileSync(join(value.root, 'invalid.json'), JSON.stringify({ ...value.record, sdk: { ...value.record.sdk, digest: 'not-allowed' } }));
  await expect(runSdkReleaseCli(['--input', 'invalid.json', '--token-env', 'RELEASE_TEST_TOKEN'], value.root)).rejects.toThrow(/unexpected field digest/);
  writeFileSync(join(value.root, 'valid.json'), JSON.stringify(value.record));
  await expect(runSdkReleaseCli(['--input', 'valid.json', '--token-env', 'RELEASE_TEST_TOKEN', '--output-dir', '../outside'], value.root)).rejects.toThrow(/inside the repository/);
});
