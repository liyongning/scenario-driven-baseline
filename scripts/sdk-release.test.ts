import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cleanSource,
  cleanupReleaseRoots,
  createGitFixture,
  createRegistryStub,
  createReleaseFixture,
  releaseRoots,
  registryUrl,
  releaseSnapshot,
} from '../packages/e2e/tests/tooling/sdk-release-fixture.ts';
import {
  runSdkRelease,
  runSdkReleaseCli,
  type CommandExecutor,
  type RegistryInspector,
  type ReleaseCommand,
} from './sdk-release';

afterEach(() => {
  vi.unstubAllEnvs();
  cleanupReleaseRoots();
});

/**
 * 每个用例独占一份 TMPDIR：release 的暂存目录建在系统临时目录下，并行的其它用例文件
 * （例如 `sdk-release.plan.test.ts`）会创建并清理同类目录；不隔离时按"新增目录"查找快照
 * 可能读到别人正在删除的目录，`statSync` 抛 ENOENT 盖掉真正的结论。
 */
beforeEach(() => {
  const isolated = mkdtempSync(join(tmpdir(), 'sdk-release-tmp-'));
  releaseRoots.push(isolated);
  vi.stubEnv('TMPDIR', isolated);
});

test('a product build failure blocks publication and leaves no success result', async () => {
  const value = createReleaseFixture();
  const controlled = createRegistryStub();
  const calls: ReleaseCommand[] = [];
  await expect(
    runSdkRelease(
      value,
      'fixture-token',
      async (command) => {
        calls.push(command);
        if (command.args.includes('build')) throw new Error('product build failed');
        await controlled.executor(command, {});
      },
      { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector },
    ),
  ).rejects.toThrow('product build failed');
  expect(calls.map((command) => command.args)).toEqual([
    ['--filter', '@daqian/template-protocol', 'run', 'build'],
  ]);
  expect(existsSync(value.resultPath)).toBe(false);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({
    status: 'failed',
    error: 'product build failed',
  });
});

test('default registry inspection overrides the repository scoped registry with project 245', async () => {
  const value = createReleaseFixture();
  writeFileSync(
    join(value.root, '.npmrc'),
    '@daqian:registry=https://gitlab.daqian369.com/api/v4/projects/216/packages/npm/\n',
  );
  const bin = join(value.root, 'bin');
  const log = join(value.root, 'npm-args.jsonl');
  mkdirSync(bin);
  const npm = join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.RELEASE_NPM_ARGS_LOG, JSON.stringify(args) + '\\n');
const packageSpec = args[1];
process.stdout.write(JSON.stringify(packageSpec.slice(packageSpec.lastIndexOf('@') + 1)) + '\\n');
`,
  );
  chmodSync(npm, 0o755);
  await runSdkRelease(value, 'fixture-token', vi.fn(), {
    root: value.root,
    sourceInspector: cleanSource,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, RELEASE_NPM_ARGS_LOG: log },
  });
  const invocations = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as string[]);
  expect(invocations).toHaveLength(4);
  expect(invocations.every((args) => args.includes(`--@daqian:registry=${registryUrl}`))).toBe(
    true,
  );
});

test('release publishes protocol before SDK, verifies both, and promotes the result last', async () => {
  const value = createReleaseFixture();
  const controlled = createRegistryStub();
  const calls: ReleaseCommand[] = [];
  await runSdkRelease(
    value,
    'fixture-token',
    async (command, env) => {
      calls.push(command);
      await controlled.executor(command, env);
    },
    { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector },
  );
  expect(calls.map((command) => [command.args[1], command.args[2], command.args[3]])).toEqual([
    ['@daqian/template-protocol', 'run', 'build'],
    ['@daqian/template-protocol', 'publish', '--no-git-checks'],
    ['@daqian/template-sdk', 'run', 'build'],
    ['@daqian/template-sdk', 'publish', '--no-git-checks'],
  ]);
  expect(controlled.inspections.map((item) => item.name)).toEqual([
    '@daqian/template-protocol',
    '@daqian/template-protocol',
    '@daqian/template-sdk',
    '@daqian/template-sdk',
  ]);
  const result = JSON.parse(readFileSync(value.resultPath, 'utf8')) as {
    sdk: { releaseAction: string };
    protocol: { releaseAction: string };
    steps: Array<{ name: string }>;
  };
  expect(result.protocol.releaseAction).toBe('published');
  expect(result.sdk.releaseAction).toBe('published');
  expect(result.steps.map((step) => step.name)).toEqual([
    'inspect-protocol',
    'build-protocol',
    'publish-protocol',
    'verify-protocol',
    'inspect-sdk',
    'build-sdk',
    'publish-sdk',
    'verify-sdk',
  ]);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({
    status: 'completed',
  });
});

test('release reuses readable versions without republishing or comparing artifact bytes', async () => {
  const value = createReleaseFixture();
  const controlled = createRegistryStub({
    '@daqian/template-protocol': 'existing',
    '@daqian/template-sdk': 'existing',
  });
  const executor = vi.fn<CommandExecutor>();
  await runSdkRelease(value, 'fixture-token', executor, {
    root: value.root,
    sourceInspector: cleanSource,
    registryInspector: controlled.inspector,
  });
  expect(executor).not.toHaveBeenCalled();
  const result = JSON.parse(readFileSync(value.resultPath, 'utf8')) as {
    sdk: { releaseAction: string };
    protocol: { releaseAction: string };
  };
  expect(result.protocol.releaseAction).toBe('reused');
  expect(result.sdk.releaseAction).toBe('reused');
});

test('temporary 0600 registry auth is isolated from the inherited environment and removed', async () => {
  const value = createReleaseFixture();
  const controlled = createRegistryStub();
  const calls: Array<{
    command: ReleaseCommand;
    config?: string;
    token?: string;
    lower?: string;
    mixed?: string;
  }> = [];
  await runSdkRelease(
    value,
    'fixture-token',
    async (command, env) => {
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
    },
    {
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
    },
  );
  expect(
    calls.every(
      (call) => call.token === undefined && call.lower === undefined && call.mixed === undefined,
    ),
  ).toBe(true);
  expect(
    calls
      .filter((call) => call.command.args.includes('build'))
      .every((call) => call.config === undefined),
  ).toBe(true);
  const config = calls.find((call) => call.command.args.includes('publish'))!.config!;
  expect(() => readFileSync(config)).toThrow();
});

test('protocol publication failure blocks SDK publication and leaves only a failed checkpoint', async () => {
  const value = createReleaseFixture();
  mkdirSync(join(value.root, 'artifacts/release'), { recursive: true });
  writeFileSync(value.resultPath, '{"stale":true}\n', { flag: 'wx' });
  const controlled = createRegistryStub();
  const calls: ReleaseCommand[] = [];
  await expect(
    runSdkRelease(
      value,
      'fixture-token',
      async (command) => {
        calls.push(command);
        if (command.args.includes('publish')) throw new Error('protocol upload failed');
      },
      { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector },
    ),
  ).rejects.toThrow('protocol upload failed');
  expect(calls.map((command) => [command.args[1], command.args[2]])).toEqual([
    ['@daqian/template-protocol', 'run'],
    ['@daqian/template-protocol', 'publish'],
  ]);
  expect(existsSync(value.resultPath)).toBe(false);
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({
    status: 'failed',
    error: 'protocol upload failed',
  });
});

test('an unreadable protocol after publish blocks the SDK', async () => {
  const value = createReleaseFixture();
  const calls: ReleaseCommand[] = [];
  const inspector: RegistryInspector = async () => ({ state: 'missing' });
  await expect(
    runSdkRelease(
      value,
      'fixture-token',
      async (command) => {
        calls.push(command);
      },
      {
        root: value.root,
        sourceInspector: cleanSource,
        registryInspector: inspector,
      },
    ),
  ).rejects.toThrow(/protocol package is not readable/);
  expect(calls.map((command) => [command.args[1], command.args[2]])).toEqual([
    ['@daqian/template-protocol', 'run'],
    ['@daqian/template-protocol', 'publish'],
  ]);
  expect(existsSync(value.resultPath)).toBe(false);
});

test('a retry reuses the published protocol after a partial SDK failure', async () => {
  const value = createReleaseFixture();
  const controlled = createRegistryStub();
  await expect(
    runSdkRelease(
      value,
      'fixture-token',
      async (command, env) => {
        if (command.args[1] === '@daqian/template-sdk') throw new Error('SDK upload failed');
        await controlled.executor(command, env);
      },
      { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector },
    ),
  ).rejects.toThrow('SDK upload failed');
  expect(controlled.states.get('@daqian/template-protocol')).toBe('existing');
  expect(existsSync(value.resultPath)).toBe(false);

  const retryCalls: ReleaseCommand[] = [];
  await runSdkRelease(
    value,
    'fixture-token',
    async (command, env) => {
      retryCalls.push(command);
      await controlled.executor(command, env);
    },
    { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector },
  );
  expect(retryCalls.map((command) => [command.args[1], command.args[2]])).toEqual([
    ['@daqian/template-sdk', 'run'],
    ['@daqian/template-sdk', 'publish'],
  ]);
});

test('late checkpoint failure cannot leave a formal success result', async () => {
  const value = createReleaseFixture();
  const controlled = createRegistryStub();
  const inspector: RegistryInspector = async (request, env) => {
    const result = await controlled.inspector(request, env);
    if (request.name === '@daqian/template-sdk' && result.state === 'existing') {
      rmSync(value.checkpointPath, { force: true });
      mkdirSync(value.checkpointPath);
    }
    return result;
  };
  await expect(
    runSdkRelease(value, 'fixture-token', controlled.executor, {
      root: value.root,
      sourceInspector: cleanSource,
      registryInspector: inspector,
    }),
  ).rejects.toThrow(/checkpoint|release failed/i);
  expect(existsSync(value.resultPath)).toBe(false);
});

test('release rejects permission and content changes to its frozen record snapshot', async () => {
  for (const mutation of ['permission', 'content'] as const) {
    const value = createReleaseFixture();
    const controlled = createRegistryStub();
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
    await expect(
      runSdkRelease(value, 'fixture-token', controlled.executor, {
        root: value.root,
        sourceInspector: cleanSource,
        registryInspector: inspector,
      }),
    ).rejects.toThrow(/record snapshot.*(integrity|content)/i);
    expect(existsSync(value.resultPath)).toBe(false);
  }
});

test('release blocks result symlinks introduced after initial path validation', async () => {
  const value = createReleaseFixture();
  const outside = mkdtempSync(join(tmpdir(), 'sdk-release-race-'));
  releaseRoots.push(outside);
  mkdirSync(join(value.root, 'artifacts/release'), { recursive: true });
  await expect(
    runSdkRelease(value, 'fixture-token', vi.fn(), {
      root: value.root,
      sourceInspector: async () => {
        symlinkSync(join(outside, 'result.json'), value.resultPath);
        return cleanSource();
      },
    }),
  ).rejects.toThrow(/symbolic link/i);
});

test('release blocks result targets or ancestors replaced during publication', async () => {
  for (const mutation of ['target', 'ancestor'] as const) {
    const value = createReleaseFixture();
    const outside = mkdtempSync(join(tmpdir(), 'sdk-release-output-race-'));
    releaseRoots.push(outside);
    const controlled = createRegistryStub();
    await expect(
      runSdkRelease(
        value,
        'fixture-token',
        async (command, env) => {
          await controlled.executor(command, env);
          if (mutation === 'target') symlinkSync(join(outside, 'result.json'), value.resultPath);
          else {
            const releaseDirectory = join(value.root, 'artifacts/release');
            renameSync(releaseDirectory, `${releaseDirectory}-original`);
            symlinkSync(outside, releaseDirectory, 'dir');
          }
        },
        { root: value.root, sourceInspector: cleanSource, registryInspector: controlled.inspector },
      ),
    ).rejects.toThrow(/symbolic link|path identity/i);
    expect(existsSync(value.resultPath)).toBe(false);
  }
});

test('release propagates filesystem errors while validating output components', async () => {
  const value = createReleaseFixture();
  const blocker = join(value.root, 'not-a-directory');
  writeFileSync(blocker, 'file');
  await expect(
    runSdkRelease(
      {
        ...value,
        resultPath: join(blocker, 'release-result.json'),
        checkpointPath: join(blocker, 'release-checkpoint.json'),
      },
      'fixture-token',
      vi.fn(),
      { root: value.root, sourceInspector: cleanSource },
    ),
  ).rejects.toMatchObject({ code: 'ENOTDIR' });
});

test('an unreadable SDK after publish leaves no success result', async () => {
  const value = createReleaseFixture();
  const states = createRegistryStub({ '@daqian/template-protocol': 'existing' });
  const inspector: RegistryInspector = async (request) => ({
    state: request.name === '@daqian/template-protocol' ? 'existing' : 'missing',
  });
  await expect(
    runSdkRelease(value, 'fixture-token', states.executor, {
      root: value.root,
      sourceInspector: cleanSource,
      registryInspector: inspector,
    }),
  ).rejects.toThrow(/SDK package is not readable/);
  expect(existsSync(value.resultPath)).toBe(false);
});

test('release rejects absent credentials and preserves non-Error failures in the checkpoint', async () => {
  const value = createReleaseFixture();
  await expect(
    runSdkRelease(value, '', vi.fn(), { root: value.root, sourceInspector: cleanSource }),
  ).rejects.toThrow('release token is required');
  const controlled = createRegistryStub();
  await expect(
    runSdkRelease(
      value,
      'fixture-token',
      async () => {
        throw 'plain failure';
      },
      {
        root: value.root,
        sourceInspector: cleanSource,
        registryInspector: controlled.inspector,
      },
    ),
  ).rejects.toBe('plain failure');
  expect(JSON.parse(readFileSync(value.checkpointPath, 'utf8'))).toMatchObject({
    status: 'failed',
    error: 'plain failure',
  });
});

test('release uses the real Git inspector when no source override is supplied', async () => {
  const value = createGitFixture();
  const controlled = createRegistryStub({
    '@daqian/template-protocol': 'existing',
    '@daqian/template-sdk': 'existing',
  });
  await runSdkRelease(value, 'fixture-token', vi.fn(), {
    root: value.root,
    registryInspector: controlled.inspector,
  });
  expect(existsSync(value.resultPath)).toBe(true);
});

test('release rejects dangling result symlinks and output paths outside the repository', async () => {
  const value = createReleaseFixture();
  const outside = mkdtempSync(join(tmpdir(), 'sdk-release-outside-'));
  releaseRoots.push(outside);
  mkdirSync(join(value.root, 'artifacts/release'), { recursive: true });
  symlinkSync(join(outside, 'missing.json'), value.resultPath);
  await expect(
    runSdkRelease(value, 'fixture-token', vi.fn(), {
      root: value.root,
      sourceInspector: cleanSource,
    }),
  ).rejects.toThrow(/symbolic link/i);
  await expect(
    runSdkRelease(
      { ...value, resultPath: join(value.root, '..', 'outside.json') },
      'fixture-token',
      vi.fn(),
      { root: value.root, sourceInspector: cleanSource },
    ),
  ).rejects.toThrow(/inside the repository/i);
});

test('release CLI requires explicit token input and rejects malformed or escaping paths before execution', async () => {
  const value = createReleaseFixture();
  await expect(runSdkReleaseCli([], value.root)).rejects.toThrow('--input is required');
  await expect(runSdkReleaseCli(['--input', 'missing.json'], value.root)).rejects.toThrow(
    '--token-env is required',
  );
  vi.stubEnv('RELEASE_TEST_TOKEN', 'fixture-token');
  await expect(
    runSdkReleaseCli(['--input', 'missing.json', '--token-env', 'RELEASE_TEST_TOKEN'], value.root),
  ).rejects.toThrow(/does not exist/);
  await expect(
    runSdkReleaseCli(
      ['--input', '../record.json', '--token-env', 'RELEASE_TEST_TOKEN'],
      value.root,
    ),
  ).rejects.toThrow(/inside the repository/);
  writeFileSync(
    join(value.root, 'invalid.json'),
    JSON.stringify({ ...value.record, sdk: { ...value.record.sdk, digest: 'not-allowed' } }),
  );
  await expect(
    runSdkReleaseCli(['--input', 'invalid.json', '--token-env', 'RELEASE_TEST_TOKEN'], value.root),
  ).rejects.toThrow(/unexpected field digest/);
  writeFileSync(join(value.root, 'valid.json'), JSON.stringify(value.record));
  await expect(
    runSdkReleaseCli(
      ['--input', 'valid.json', '--token-env', 'RELEASE_TEST_TOKEN', '--output-dir', '../outside'],
      value.root,
    ),
  ).rejects.toThrow(/inside the repository/);
});
