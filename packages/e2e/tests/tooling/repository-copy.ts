import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadProjectManifest,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import { listGitFiles } from '../../../../scripts/lib/source-inventory.ts';

export const repositoryRoot = resolve(import.meta.dirname, '../../../..');

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

export type RepositoryCopy = Readonly<{ root: string; cleanup: () => void }>;

/**
 * 最小受控副本：按清单复制构建输入、链接依赖并做一次初始提交。
 * Task 5 把它收敛为统一的仓库副本 helper（pnpm install、OpenSpec 归档、TEMPLATE_COPY 守卫）。
 */
export function createBuildCopy(
  options: Readonly<{ source?: string; prefix?: string }> = {},
): RepositoryCopy {
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
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
