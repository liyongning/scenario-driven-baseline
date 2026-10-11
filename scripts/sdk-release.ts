import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkReleaseRecord,
  parseReleaseInput,
  readReleaseWorkspaceFacts,
  releaseMissingMessage,
} from './check-release';
import { loadProjectManifest } from './lib/project-manifest';
import {
  createSdkReleasePlan,
  inspectReleaseSource,
  scopeOf,
  type ReleasePlanInput,
  type ReleaseSource,
  type SdkReleaseStep,
} from './lib/release-plan.ts';
import {
  execute,
  inspectRegistry,
  type CommandExecutor,
  type RegistryInspectionRequest,
  type SdkReleaseOptions,
} from './lib/release-execution.ts';
import {
  argument,
  assertPathGuard,
  assertSnapshotIntegrity,
  bestEffortRemove,
  capturePathGuard,
  captureSnapshotIdentity,
  pathInside,
  writeCheckpoint,
} from './lib/release-guards.ts';

// 拆分后保持既有公共出口：发布计划与执行边界由 lib/ 下的模块提供。
export { createSdkReleasePlan, inspectReleaseSource } from './lib/release-plan.ts';
export type {
  RegistryState,
  ReleaseCommand,
  ReleasePlanDescriptionInput,
  ReleasePlanInput,
  ReleaseSource,
  SdkReleaseStep,
} from './lib/release-plan.ts';
export type {
  CommandExecutor,
  RegistryInspection,
  RegistryInspectionRequest,
  RegistryInspector,
  SdkReleaseOptions,
} from './lib/release-execution.ts';

export async function runSdkRelease(
  input: ReleasePlanInput,
  token: string,
  executor: CommandExecutor = execute,
  options: SdkReleaseOptions,
): Promise<void> {
  if (token.length === 0) throw new Error('release token is required');
  const record = parseReleaseInput(input.record);
  const requestedRoot = resolve(options.root);
  const root = await realpath(requestedRoot);
  const manifest = loadProjectManifest(root);
  if (!manifest.release) throw new Error(releaseMissingMessage);
  const facts = await readReleaseWorkspaceFacts(root);
  const recordIssues = checkReleaseRecord(record, facts, manifest.release);
  if (recordIssues.length > 0)
    throw new Error(`invalid release record: ${recordIssues.join('; ')}`);

  const [resultPath, checkpointPath] = await Promise.all([
    pathInside(requestedRoot, input.resultPath, 'release result'),
    pathInside(requestedRoot, input.checkpointPath, 'release checkpoint'),
  ]);
  await Promise.all([
    mkdir(dirname(resultPath), { recursive: true }),
    mkdir(dirname(checkpointPath), { recursive: true }),
  ]);
  const stagingDir = await mkdtemp(join(tmpdir(), 'template-sdk-release-'));
  const snapshotPath = join(stagingDir, 'release-record.json');
  const resultTemporaryPath = `${resultPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(snapshotPath, `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  await chmod(snapshotPath, 0o400);
  const snapshotIdentity = await captureSnapshotIdentity(snapshotPath);

  const baseEnv = { ...(options.env ?? process.env) };
  if (options.tokenEnv) delete baseEnv[options.tokenEnv];
  for (const key of Object.keys(baseEnv)) {
    if (key.toLowerCase() === 'npm_config_userconfig') delete baseEnv[key];
  }
  let authDir: string | undefined;
  let npmrc: string | undefined;
  const registryPath = new URL(record.registry).pathname;
  const registryEnvironment = async () => {
    if (!npmrc) {
      authDir = await mkdtemp(join(tmpdir(), 'template-sdk-release-auth-'));
      npmrc = join(authDir, 'npmrc');
      const registryHost = new URL(record.registry).host;
      await writeFile(
        npmrc,
        `${scopeOf(record.sdk.name)}:registry=${record.registry}\n//${registryHost}${registryPath}:_authToken=${token}\nalways-auth=true\n`,
        { mode: 0o600, flag: 'wx' },
      );
    }
    return { ...baseEnv, NPM_CONFIG_USERCONFIG: npmrc };
  };

  const pathGuards = await Promise.all([
    capturePathGuard(root, resultPath, 'release result'),
    capturePathGuard(root, resultTemporaryPath, 'temporary release result'),
    capturePathGuard(root, checkpointPath, 'release checkpoint'),
  ]);
  const assertReleasePaths = async () => {
    for (const guard of pathGuards) await assertPathGuard(guard);
  };
  const completedSteps: Array<Readonly<{ name: string; result: string }>> = [];
  let source: ReleaseSource | undefined;
  const checkpoint = async (status: 'running' | 'failed' | 'completed', error?: unknown) => {
    await assertReleasePaths();
    await writeCheckpoint(checkpointPath, {
      status,
      sourceRevision: source?.headRevision ?? record.sourceRevision,
      tag: record.tag,
      sdk: record.sdk,
      protocol: record.protocol,
      completedSteps,
      ...(error === undefined
        ? {}
        : { error: error instanceof Error ? error.message : String(error) }),
      updatedAt: new Date().toISOString(),
    });
    await assertReleasePaths();
  };
  /* v8 ignore next -- 默认 npm view 边界由 CLI 使用；单测注入 inspector 验证编排。 */
  const inspect = options.registryInspector ?? inspectRegistry;
  const inspectPackage = async (name: RegistryInspectionRequest['name'], version: string) => {
    const result = await inspect(
      { name, version, registry: record.registry },
      await registryEnvironment(),
    );
    await assertSnapshotIntegrity(snapshotPath, snapshotIdentity);
    await assertReleasePaths();
    return result;
  };
  const executeStep = async (step: SdkReleaseStep) => {
    const publishing = step.name.startsWith('publish-');
    await executor(
      { ...step.command, cwd: root },
      publishing ? await registryEnvironment() : baseEnv,
    );
    await assertSnapshotIntegrity(snapshotPath, snapshotIdentity);
    await assertReleasePaths();
    completedSteps.push({ name: step.name, result: publishing ? 'published' : 'built' });
    await checkpoint('running');
  };

  await rm(resultPath, { force: true });
  await rm(resultTemporaryPath, { force: true });
  try {
    source = await (options.sourceInspector ?? inspectReleaseSource)(root, record.tag);
    if (source.headRevision !== record.sourceRevision)
      throw new Error('release source revision does not match the current checkout');
    if (source.tagRevision !== source.headRevision)
      throw new Error('release tag does not resolve to the current checkout');
    if (!source.clean)
      throw new Error('release requires a clean checkout including untracked files');
    await checkpoint('running');
    const protocolInitial = await inspectPackage(record.protocol.name, record.protocol.version);
    completedSteps.push({ name: 'inspect-protocol', result: protocolInitial.state });
    await checkpoint('running');
    const protocolPlan = createSdkReleasePlan({
      record,
      protocolState: protocolInitial.state,
      sdkState: 'existing',
      release: manifest.release,
    });
    for (const step of protocolPlan) await executeStep(step);
    const protocolFinal = await inspectPackage(record.protocol.name, record.protocol.version);
    if (protocolFinal.state !== 'existing')
      throw new Error('protocol package is not readable after publication');
    completedSteps.push({ name: 'verify-protocol', result: 'existing' });
    await checkpoint('running');

    const sdkInitial = await inspectPackage(record.sdk.name, record.sdk.version);
    completedSteps.push({ name: 'inspect-sdk', result: sdkInitial.state });
    await checkpoint('running');
    const sdkPlan = createSdkReleasePlan({
      record,
      protocolState: 'existing',
      sdkState: sdkInitial.state,
      release: manifest.release,
    });
    for (const step of sdkPlan) await executeStep(step);
    const sdkFinal = await inspectPackage(record.sdk.name, record.sdk.version);
    if (sdkFinal.state !== 'existing')
      throw new Error('SDK package is not readable after publication');
    completedSteps.push({ name: 'verify-sdk', result: 'existing' });

    await assertSnapshotIntegrity(snapshotPath, snapshotIdentity);
    await assertReleasePaths();
    await writeFile(
      resultTemporaryPath,
      `${JSON.stringify(
        {
          version: 1,
          ...record,
          completedAt: new Date().toISOString(),
          protocol: {
            ...record.protocol,
            releaseAction: protocolInitial.state === 'existing' ? 'reused' : 'published',
          },
          sdk: {
            ...record.sdk,
            releaseAction: sdkInitial.state === 'existing' ? 'reused' : 'published',
          },
          steps: completedSteps.map((step) => ({ ...step, status: 'passed' })),
        },
        null,
        2,
      )}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    await assertSnapshotIntegrity(snapshotPath, snapshotIdentity);
    await assertReleasePaths();
    completedSteps.push({ name: 'write-result', result: 'prepared' });
    await checkpoint('completed');
    await rm(authDir!, { recursive: true, force: true });
    authDir = undefined;
    npmrc = undefined;
    await assertSnapshotIntegrity(snapshotPath, snapshotIdentity);
    await assertReleasePaths();
    await rename(resultTemporaryPath, resultPath);
  } catch (error) {
    await bestEffortRemove(resultPath);
    try {
      await checkpoint('failed', error);
    } catch (checkpointError) {
      const issue = new Error(
        `release failed and failed checkpoint could not be written: ${String(checkpointError)}`,
      ) as Error & { cause: unknown };
      issue.cause = error;
      throw issue;
    }
    throw error;
  } finally {
    if (authDir) await bestEffortRemove(authDir, { recursive: true });
    await bestEffortRemove(resultTemporaryPath);
    await bestEffortRemove(stagingDir, { recursive: true });
  }
}

/* v8 ignore start -- CLI 参数薄壳；发布顺序与失败阻断由 runSdkRelease 的注入执行器验证。 */
export async function runSdkReleaseCli(
  argv: readonly string[],
  root = process.cwd(),
): Promise<void> {
  const inputArg = argument(argv, '--input');
  if (!inputArg) throw new Error('--input is required');
  const tokenEnv = argument(argv, '--token-env');
  if (!tokenEnv) throw new Error('--token-env is required');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv))
    throw new Error('--token-env must name an environment variable');
  const rootPath = await realpath(resolve(root));
  const inputPath = await pathInside(rootPath, inputArg, '--input', true);
  const releaseDir = await pathInside(
    rootPath,
    argument(argv, '--output-dir') ?? 'artifacts/release',
    '--output-dir',
  );
  const record = parseReleaseInput(JSON.parse(await readFile(inputPath, 'utf8')));
  const token = process.env[tokenEnv] ?? '';
  await runSdkRelease(
    {
      record,
      resultPath: join(releaseDir, 'release-result.json'),
      checkpointPath: join(releaseDir, 'release-checkpoint.json'),
    },
    token,
    execute,
    { root: rootPath, env: process.env, tokenEnv },
  );
}
/* v8 ignore stop */

/* v8 ignore start -- CLI 壳由导出的 runSdkReleaseCli 覆盖，避免 import 时执行。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void runSdkReleaseCli(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
