import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadProjectManifest,
  packageByRole,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import { listGitFiles } from '../../../../scripts/lib/source-inventory.ts';

export const repositoryRoot = resolve(import.meta.dirname, '../../../..');

/** 仓库副本内的运行环境：标记副本、清除作用域（被归档的 Change 已不在 active 目录）。 */
export type RepositoryCopy = Readonly<{
  root: string;
  env: Readonly<Record<string, string>>;
  cleanup: () => void;
}>;

/**
 * 临时构建/受控副本的输入集合：清单 `sourceRoots` 与 `buildInputs`、各包 package.json 与 tsconfig，
 * 加上仓库根级工程文件（包管理器与工作区配置）。不维护写死的文件名清单；清单新增输入后自动纳入。
 */
export function buildCopyInputs(root: string, manifest = loadProjectManifest(root)): string[] {
  const files = new Set<string>();
  for (const sourceRoot of manifest.fingerprints.sourceRoots)
    for (const path of listGitFiles(root, [sourceRoot])) files.add(path);
  for (const path of listGitFiles(root, manifest.fingerprints.buildInputs)) files.add(path);
  for (const pkg of manifest.packages)
    for (const path of listGitFiles(root, [
      `packages/${pkg.directory}/package.json`,
      `packages/${pkg.directory}/tsconfig*.json`,
    ]))
      files.add(path);
  for (const path of listGitFiles(root, ['.'])) if (!path.includes('/')) files.add(path);
  return [...files].sort();
}

function git(root: string, args: ReadonlyArray<string>): void {
  const result = spawnSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'template-fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'template-fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    },
  });
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed in ${root}: ${result.stderr}`);
}

/**
 * 链接依赖：根 node_modules 指向仓库依赖存储；工作区包之间的链接指向副本内的包目录，
 * 保证副本测的是复制来的代码而不是原仓库。
 */
function linkDependencies(source: string, target: string, manifest: ProjectManifest): void {
  symlinkSync(join(source, 'node_modules'), join(target, 'node_modules'), 'dir');
  for (const pkg of manifest.packages) {
    const packageModules = join(source, 'packages', pkg.directory, 'node_modules');
    if (!existsSync(packageModules)) continue;
    const destination = join(target, 'packages', pkg.directory, 'node_modules');
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(packageModules)) {
      if (!entry.startsWith('@')) {
        symlinkSync(join(packageModules, entry), join(destination, entry));
        continue;
      }
      mkdirSync(join(destination, entry), { recursive: true });
      for (const name of readdirSync(join(packageModules, entry))) {
        const workspace = manifest.packages.find((item) => item.name === `${entry}/${name}`);
        symlinkSync(
          workspace
            ? join(target, 'packages', workspace.directory)
            : join(packageModules, entry, name),
          join(destination, entry, name),
        );
      }
    }
  }
}

/**
 * 最小受控副本：按清单复制构建输入、链接依赖并做一次初始提交。
 * Task 5 把它收敛为统一的仓库副本 helper（pnpm install、OpenSpec 归档、TEMPLATE_COPY 守卫）。
 */
export function createBuildCopy(
  options: Readonly<{ source?: string; prefix?: string }> = {},
): RepositoryCopy {
  assertNotTemplateCopy();
  const source = options.source ?? repositoryRoot;
  const manifest = loadProjectManifest(source);
  const root = mkdtempSync(join(tmpdir(), options.prefix ?? 'template-build-copy-'));
  for (const path of buildCopyInputs(source, manifest)) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(source, path), destination);
  }
  linkDependencies(source, root, manifest);
  git(root, ['init', '-q']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'copy: initial state']);
  return {
    root,
    env: copyEnvironment(),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * 副本内运行环境：标记 TEMPLATE_COPY 以阻止递归建副本，并清除作用域变量
 * （作用域内 Change 已归档，继续生效会报"Change 不存在"）。
 */
export function copyEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // 去掉外层 Vitest 的运行标记，副本才能独立启动自己的 Vitest；
    // 同时去掉验收报告变量，避免副本内的运行覆盖调用方的报告文件。
    if (key.startsWith('VITEST') || key === 'TEST') continue;
    if (key === 'VERIFY_REPORT_FILE' || key === 'VERIFY_RUN_ID' || key === 'TEST_AFFECTED_PARTIAL')
      continue;
    if (value !== undefined) env[key] = value;
  }
  env.TEMPLATE_COPY = '1';
  delete env.SCENARIO_GATE_CHANGES;
  return env;
}

/** 副本用例的防递归守卫：在副本内再次创建副本会让门禁无限递归。 */
export function assertNotTemplateCopy(): void {
  if (process.env.TEMPLATE_COPY)
    throw new Error('repository copy must not be created inside a copy');
}

/** 解析作用域变量；空值与未设置都视为空列表。 */
export function scopedChangeNames(value = process.env.SCENARIO_GATE_CHANGES): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** 解析副本内固定版本的 OpenSpec CLI，版本必须与根 package.json 的精确版本一致。 */
export function pinnedOpenspecCli(root: string): string {
  const packageDirectory = join(root, 'node_modules', '@fission-ai', 'openspec');
  const installed = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
    version: string;
  };
  const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  const expected = declared.devDependencies?.['@fission-ai/openspec'];
  if (!expected || expected !== installed.version)
    throw new Error(`openspec CLI version ${installed.version} does not match ${expected}`);
  return join(root, 'node_modules', '.bin', 'openspec');
}

function run(
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env?: Readonly<Record<string, string>>,
): void {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed in ${cwd}: ${result.stderr}${result.stdout}`,
    );
}

/**
 * 归档前置：delta 里同 ID 的 Scenario 标题以 delta 为准，机械对齐主 Spec 的标题。
 * OpenSpec 的归档校验比它自己的合并语义更严：MODIFIED 块里被改写的 Scenario 标题会被判成
 * "主 Spec 有、修改块没有"，从而拒绝归档；先对齐标题再交给真实 CLI 归档，产物与归档一致。
 */
function harmonizeScenarioTitles(root: string, change: string): void {
  const deltaRoot = join(root, 'openspec', 'changes', change, 'specs');
  if (!existsSync(deltaRoot)) return;
  for (const capability of readdirSync(deltaRoot)) {
    const deltaPath = join(deltaRoot, capability, 'spec.md');
    const mainPath = join(root, 'openspec', 'specs', capability, 'spec.md');
    if (!existsSync(deltaPath) || !existsSync(mainPath)) continue;
    const titles = new Map<string, string>();
    for (const match of readFileSync(deltaPath, 'utf8').matchAll(
      /^#### Scenario: (SCN-[A-Z0-9-]+)\s*(.*)$/gm,
    ))
      titles.set(match[1]!, match[2]!.trim());
    let main = readFileSync(mainPath, 'utf8');
    let changed = false;
    for (const [id, title] of titles) {
      const pattern = new RegExp(`^(#### Scenario: ${id}\\s*)(.*)$`, 'm');
      const found = main.match(pattern);
      if (found && found[2]!.trim() !== title) {
        main = main.replace(pattern, `$1${title}`);
        changed = true;
      }
    }
    if (changed) writeFileSync(mainPath, main);
  }
}

/** 副本内 workspace 产品包的 realpath；workspace 链接可能落在任一包的 node_modules 下。 */
export function workspaceRealpath(root: string): string {
  const manifest = loadProjectManifest(root);
  const product = packageByRole(manifest, 'product');
  const candidates = [
    join(root, 'node_modules'),
    ...manifest.packages.map((pkg) => join(root, 'packages', pkg.directory, 'node_modules')),
  ];
  const link = candidates
    .map((modules) => join(modules, product.name))
    .find((candidate) => existsSync(candidate));
  if (!link) throw new Error(`${product.name} is not installed in the copy`);
  return realpathSync(link);
}

/** 副本内 workspace 包的 realpath 必须落在副本内，否则副本测的是原仓库代码。 */
function assertWorkspaceInsideCopy(root: string): void {
  const resolved = workspaceRealpath(root);
  if (!resolved.startsWith(realpathSync(root)))
    throw new Error(`${resolved} resolves outside the copy ${root}`);
}

/** 把作用域内的 active Change 归档，其余 active Change 直接移出副本。 */
function applyChangeScope(root: string): void {
  const changes = join(root, 'openspec', 'changes');
  if (!existsSync(changes)) return;
  const scoped = new Set(scopedChangeNames());
  const cli = pinnedOpenspecCli(root);
  const openspecEnv = { OPENSPEC_TELEMETRY: '0', DO_NOT_TRACK: '1' };
  for (const entry of readdirSync(changes, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    if (scoped.has(entry.name)) {
      harmonizeScenarioTitles(root, entry.name);
      run(cli, ['archive', entry.name, '-y'], root, openspecEnv);
    } else rmSync(join(changes, entry.name), { recursive: true, force: true });
  }
}

/**
 * 隔离副本：按 `git ls-files -co --exclude-standard` 复制工作区、提交一次初始状态，
 * 在副本内安装依赖（workspace 链接指向副本自身），再按作用域归档/移除 active Change。
 * 需要真实外部环境（微信开发者工具、registry）的用例不得使用本 helper。
 */
export function createRepositoryCopy(
  options: Readonly<{ source?: string; prefix?: string }> = {},
): RepositoryCopy {
  assertNotTemplateCopy();
  const source = options.source ?? repositoryRoot;
  const root = mkdtempSync(join(tmpdir(), options.prefix ?? 'template-copy-'));
  for (const path of listGitFiles(source, ['.'])) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(source, path), destination);
  }
  rmSync(join(root, 'artifacts'), { recursive: true, force: true });
  git(root, ['init', '-q']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'copy: initial state']);
  run('pnpm', ['install', '--offline', '--frozen-lockfile'], root);
  assertWorkspaceInsideCopy(root);
  applyChangeScope(root);
  return {
    root,
    env: copyEnvironment(),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
