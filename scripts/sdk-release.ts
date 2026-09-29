import { execFile } from 'node:child_process';
import { type Stats } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { checkReleaseRecord, parseReleaseInput, readReleaseWorkspaceFacts, type ReleaseInput } from './check-release';

const execFileAsync = promisify(execFile);

export type ReleaseCommand = Readonly<{ file: string; args: readonly string[]; cwd?: string }>;
export type SdkReleaseStep = Readonly<{
  name: 'build-protocol' | 'publish-protocol' | 'build-sdk' | 'publish-sdk';
  command: ReleaseCommand;
}>;
export type RegistryState = 'missing' | 'existing';
export type ReleasePlanInput = Readonly<{
  record: ReleaseInput;
  resultPath: string;
  checkpointPath: string;
}>;
export type ReleasePlanDescriptionInput = Readonly<{
  record: ReleaseInput;
  protocolState?: RegistryState;
  sdkState?: RegistryState;
}>;
export type ReleaseSource = Readonly<{ headRevision: string; tagRevision: string; clean: boolean }>;

/** 从真实 checkout 独立读取发布来源，避免发布记录用自身字段完成自证。 */
export async function inspectReleaseSource(root: string, tag: string): Promise<ReleaseSource> {
  const git = async (args: readonly string[]) => (await execFileAsync('git', [...args], { cwd: root, encoding: 'utf8' })).stdout.trim();
  const [headRevision, tagRevision, status] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['rev-parse', `${tag}^{commit}`]),
    git(['status', '--porcelain', '--untracked-files=all']),
  ]);
  return { headRevision, tagRevision, clean: status.length === 0 };
}

const registryArguments = (registry: string) => ['--registry', registry, `--@daqian:registry=${registry}`] as const;

/** 正式发布构建后调用两个产品 workspace 的正常 publish；本地 pack/check:package 不属于该计划。 */
export function createSdkReleasePlan(input: ReleasePlanDescriptionInput): SdkReleaseStep[] {
  const registry = input.record.registry;
  return [
    ...(input.protocolState === 'existing' ? [] : [{
      name: 'build-protocol' as const,
      command: { file: 'pnpm', args: ['--filter', input.record.protocol.name, 'run', 'build'] },
    }, {
      name: 'publish-protocol' as const,
      command: { file: 'pnpm', args: ['--filter', input.record.protocol.name, 'publish', '--no-git-checks', ...registryArguments(registry)] },
    }]),
    ...(input.sdkState === 'existing' ? [] : [{
      name: 'build-sdk' as const,
      command: { file: 'pnpm', args: ['--filter', input.record.sdk.name, 'run', 'build'] },
    }, {
      name: 'publish-sdk' as const,
      command: { file: 'pnpm', args: ['--filter', input.record.sdk.name, 'publish', '--no-git-checks', ...registryArguments(registry)] },
    }]),
  ];
}

export type CommandExecutor = (command: ReleaseCommand, env: NodeJS.ProcessEnv) => Promise<void>;
export type RegistryInspection = Readonly<{ state: RegistryState }>;
export type RegistryInspectionRequest = Readonly<{
  name: '@daqian/payment-sdk' | '@daqian/payment-protocol';
  version: string;
  registry: string;
}>;
export type RegistryInspector = (request: RegistryInspectionRequest, env: NodeJS.ProcessEnv) => Promise<RegistryInspection>;
export type SdkReleaseOptions = Readonly<{
  root: string;
  sourceInspector?: (root: string, tag: string) => Promise<ReleaseSource>;
  env?: NodeJS.ProcessEnv;
  tokenEnv?: string;
  registryInspector?: RegistryInspector;
}>;

/* v8 ignore start -- 外部进程边界由受控 executor 注入测试，真实调用只做参数转发。 */
const execute: CommandExecutor = async (command, env) => {
  await execFileAsync(command.file, [...command.args], { cwd: command.cwd, env });
};
/* v8 ignore stop */

/* v8 ignore start -- 真实 registry 边界由注入 inspector 测试，默认实现只做版本可读性检查。 */
const inspectRegistry: RegistryInspector = async (request, env) => {
  try {
    const { stdout } = await execFileAsync('npm', [
      'view', `${request.name}@${request.version}`, 'version', '--json', ...registryArguments(request.registry),
    ], { env, encoding: 'utf8' });
    const version = JSON.parse(stdout) as unknown;
    if (version !== request.version) throw new Error(`registry returned unexpected version ${String(version)}`);
    return { state: 'existing' };
  } catch (error) {
    const text = String(error);
    if (/E404|404 Not Found|is not in this registry/i.test(text)) return { state: 'missing' };
    const issue = new Error(`registry lookup failed for ${request.name}@${request.version}: ${text}`) as Error & { cause: unknown };
    issue.cause = error;
    throw issue;
  }
};
/* v8 ignore stop */

type FileIdentity = Readonly<{ dev: number; ino: number; nlink: number }>;
type SnapshotIdentity = FileIdentity & Readonly<{ bytes: string }>;
type PathGuard = Readonly<{ path: string; label: string; ancestors: ReadonlyArray<Readonly<{ path: string; identity: FileIdentity }>> }>;
const identity = (stat: Stats): FileIdentity => ({ dev: stat.dev, ino: stat.ino, nlink: stat.nlink });
const sameIdentity = (left: FileIdentity, right: FileIdentity) => left.dev === right.dev && left.ino === right.ino && left.nlink === right.nlink;
const sameNode = (left: FileIdentity, right: FileIdentity) => left.dev === right.dev && left.ino === right.ino;

async function optionalLstat(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function captureSnapshotIdentity(path: string): Promise<SnapshotIdentity> {
  const stat = await lstat(path);
  return { ...identity(stat), bytes: await readFile(path, 'utf8') };
}

async function assertSnapshotIntegrity(path: string, expected: SnapshotIdentity): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o400 || !sameIdentity(identity(stat), expected)) {
    throw new Error('release record snapshot integrity changed during release');
  }
  if (await readFile(path, 'utf8') !== expected.bytes) throw new Error('release record snapshot content changed during release');
}

async function capturePathGuard(root: string, path: string, label: string): Promise<PathGuard> {
  const ancestors: Array<Readonly<{ path: string; identity: FileIdentity }>> = [];
  const offset = relative(root, dirname(path));
  let candidate = root;
  for (const component of offset.split(sep).filter(Boolean)) {
    candidate = join(candidate, component);
    const stat = await lstat(candidate);
    ancestors.push({ path: candidate, identity: identity(stat) });
  }
  const target = await optionalLstat(path);
  /* v8 ignore next -- pathInside 已在进入发布生命周期前拒绝现有及悬空 symlink；这里是并发替换的防御复核。 */
  if (target?.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  return { path, label, ancestors };
}

async function assertPathGuard(guard: PathGuard): Promise<void> {
  for (const ancestor of guard.ancestors) {
    const stat = await lstat(ancestor.path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !sameNode(identity(stat), ancestor.identity)) {
      throw new Error(`${guard.label} path identity changed during release`);
    }
  }
  const target = await optionalLstat(guard.path);
  if (target?.isSymbolicLink()) throw new Error(`${guard.label} must not be a symbolic link`);
}

async function writeCheckpoint(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}

async function bestEffortRemove(path: string, options: Readonly<{ recursive?: boolean }> = {}): Promise<void> {
  try {
    await rm(path, { recursive: options.recursive ?? false, force: true });
  } catch {
    /* v8 ignore next -- 最终清理不得覆盖已经确定的发布结果或原始失败。 */
  }
}

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
  const facts = await readReleaseWorkspaceFacts(root);
  const recordIssues = checkReleaseRecord(record, facts);
  if (recordIssues.length > 0) throw new Error(`invalid release record: ${recordIssues.join('; ')}`);

  const [resultPath, checkpointPath] = await Promise.all([
    pathInside(requestedRoot, input.resultPath, 'release result'),
    pathInside(requestedRoot, input.checkpointPath, 'release checkpoint'),
  ]);
  await Promise.all([mkdir(dirname(resultPath), { recursive: true }), mkdir(dirname(checkpointPath), { recursive: true })]);
  const stagingDir = await mkdtemp(join(tmpdir(), 'payment-sdk-release-'));
  const snapshotPath = join(stagingDir, 'release-record.json');
  const resultTemporaryPath = `${resultPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(snapshotPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
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
      authDir = await mkdtemp(join(tmpdir(), 'payment-sdk-release-auth-'));
      npmrc = join(authDir, 'npmrc');
      await writeFile(npmrc, `@daqian:registry=${record.registry}\n//gitlab.daqian369.com${registryPath}:_authToken=${token}\nalways-auth=true\n`, { mode: 0o600, flag: 'wx' });
    }
    return { ...baseEnv, NPM_CONFIG_USERCONFIG: npmrc };
  };

  const pathGuards = await Promise.all([
    capturePathGuard(root, resultPath, 'release result'),
    capturePathGuard(root, resultTemporaryPath, 'temporary release result'),
    capturePathGuard(root, checkpointPath, 'release checkpoint'),
  ]);
  const assertReleasePaths = async () => { for (const guard of pathGuards) await assertPathGuard(guard); };
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
      ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }),
      updatedAt: new Date().toISOString(),
    });
    await assertReleasePaths();
  };
  /* v8 ignore next -- 默认 npm view 边界由 CLI 使用；单测注入 inspector 验证编排。 */
  const inspect = options.registryInspector ?? inspectRegistry;
  const inspectPackage = async (name: RegistryInspectionRequest['name'], version: string) => {
    const result = await inspect({ name, version, registry: record.registry }, await registryEnvironment());
    await assertSnapshotIntegrity(snapshotPath, snapshotIdentity);
    await assertReleasePaths();
    return result;
  };
  const executeStep = async (step: SdkReleaseStep) => {
    const publishing = step.name.startsWith('publish-');
    await executor({ ...step.command, cwd: root }, publishing ? await registryEnvironment() : baseEnv);
    await assertSnapshotIntegrity(snapshotPath, snapshotIdentity);
    await assertReleasePaths();
    completedSteps.push({ name: step.name, result: publishing ? 'published' : 'built' });
    await checkpoint('running');
  };

  await rm(resultPath, { force: true });
  await rm(resultTemporaryPath, { force: true });
  try {
    source = await (options.sourceInspector ?? inspectReleaseSource)(root, record.tag);
    if (source.headRevision !== record.sourceRevision) throw new Error('release source revision does not match the current checkout');
    if (source.tagRevision !== source.headRevision) throw new Error('release tag does not resolve to the current checkout');
    if (!source.clean) throw new Error('release requires a clean checkout including untracked files');
    await checkpoint('running');
    const protocolInitial = await inspectPackage(record.protocol.name, record.protocol.version);
    completedSteps.push({ name: 'inspect-protocol', result: protocolInitial.state });
    await checkpoint('running');
    const protocolPlan = createSdkReleasePlan({ record, protocolState: protocolInitial.state, sdkState: 'existing' });
    for (const step of protocolPlan) await executeStep(step);
    const protocolFinal = await inspectPackage(record.protocol.name, record.protocol.version);
    if (protocolFinal.state !== 'existing') throw new Error('protocol package is not readable after publication');
    completedSteps.push({ name: 'verify-protocol', result: 'existing' });
    await checkpoint('running');

    const sdkInitial = await inspectPackage(record.sdk.name, record.sdk.version);
    completedSteps.push({ name: 'inspect-sdk', result: sdkInitial.state });
    await checkpoint('running');
    const sdkPlan = createSdkReleasePlan({ record, protocolState: 'existing', sdkState: sdkInitial.state });
    for (const step of sdkPlan) await executeStep(step);
    const sdkFinal = await inspectPackage(record.sdk.name, record.sdk.version);
    if (sdkFinal.state !== 'existing') throw new Error('SDK package is not readable after publication');
    completedSteps.push({ name: 'verify-sdk', result: 'existing' });

    await assertSnapshotIntegrity(snapshotPath, snapshotIdentity);
    await assertReleasePaths();
    await writeFile(resultTemporaryPath, `${JSON.stringify({
      version: 1,
      ...record,
      completedAt: new Date().toISOString(),
      protocol: { ...record.protocol, releaseAction: protocolInitial.state === 'existing' ? 'reused' : 'published' },
      sdk: { ...record.sdk, releaseAction: sdkInitial.state === 'existing' ? 'reused' : 'published' },
      steps: completedSteps.map(step => ({ ...step, status: 'passed' })),
    }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
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
      const issue = new Error(`release failed and failed checkpoint could not be written: ${String(checkpointError)}`) as Error & { cause: unknown };
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

function argument(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

function outsideRoot(rootPath: string, path: string): boolean {
  const offset = relative(rootPath, path);
  return offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset);
}

async function rejectSymlinkComponents(rootPath: string, path: string, label: string, mustExist: boolean): Promise<void> {
  const offset = relative(rootPath, path);
  let candidate = rootPath;
  for (const component of offset.split(sep).filter(Boolean)) {
    candidate = join(candidate, component);
    const stat = await optionalLstat(candidate);
    if (!stat) {
      if (mustExist) throw new Error(`${label} does not exist`);
      return;
    }
    if (stat.isSymbolicLink()) throw new Error(`${label} must not traverse a symbolic link`);
  }
}

async function pathInside(root: string, value: string, label: string, mustExist = false): Promise<string> {
  const lexicalRoot = resolve(root);
  const rootPath = await realpath(lexicalRoot);
  const lexicalPath = resolve(lexicalRoot, value);
  if (outsideRoot(lexicalRoot, lexicalPath)) throw new Error(`${label} must stay inside the repository`);
  const offset = relative(lexicalRoot, lexicalPath);
  const path = resolve(rootPath, offset);
  await rejectSymlinkComponents(rootPath, path, label, mustExist);
  return mustExist ? realpath(path) : path;
}

/* v8 ignore start -- CLI 参数薄壳；发布顺序与失败阻断由 runSdkRelease 的注入执行器验证。 */
export async function runSdkReleaseCli(argv: readonly string[], root = process.cwd()): Promise<void> {
  const inputArg = argument(argv, '--input');
  if (!inputArg) throw new Error('--input is required');
  const tokenEnv = argument(argv, '--token-env');
  if (!tokenEnv) throw new Error('--token-env is required');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv)) throw new Error('--token-env must name an environment variable');
  const rootPath = await realpath(resolve(root));
  const inputPath = await pathInside(rootPath, inputArg, '--input', true);
  const releaseDir = await pathInside(rootPath, argument(argv, '--output-dir') ?? 'artifacts/release', '--output-dir');
  const record = parseReleaseInput(JSON.parse(await readFile(inputPath, 'utf8')));
  const token = process.env[tokenEnv] ?? '';
  await runSdkRelease({
    record,
    resultPath: join(releaseDir, 'release-result.json'),
    checkpointPath: join(releaseDir, 'release-checkpoint.json'),
  }, token, execute, { root: rootPath, env: process.env, tokenEnv });
}
/* v8 ignore stop */

/* v8 ignore start -- CLI 壳由导出的 runSdkReleaseCli 覆盖，避免 import 时执行。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void runSdkReleaseCli(process.argv).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
