import { execFileSync } from 'node:child_process';
import { loadProjectManifest, packageByRole, type ProjectManifest } from './project-manifest.ts';

/** 手写源码清单中的文件分类：手写代码、测试支撑与静态资源。 */
export type SourceClass = 'code' | 'test' | 'asset';

/** 清单中的一个文件及其分类，路径相对仓库根。 */
export type SourceFile = Readonly<{ path: string; class: SourceClass }>;

/** 按清单源码目录收集到的手写源码文件清单。 */
export type SourceInventory = Readonly<{ files: ReadonlyArray<SourceFile> }>;

const codeExtensions = ['.ts', '.js', '.mjs', '.cjs'] as const;
const excludedDirectories = new Set(['generated', '.generated']);
const excludedFileNames = new Set(['AGENTS.md', 'CLAUDE.md']);

/** 仓库根必须是 git 工作区；否则源码清单会退化为全目录扫描，必须报错退出。 */
export function assertGitWorkTree(root: string): void {
  let inside: string;
  try {
    inside = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (error) {
    const issue = new Error(`${root} is not a git work tree: ${String(error)}`) as Error & {
      cause: unknown;
    };
    issue.cause = error;
    throw issue;
  }
  if (inside !== 'true') throw new Error(`${root} is not a git work tree`);
}

/**
 * 用 git 列出路径下的已跟踪文件与未被忽略的新文件。
 * 路径按 git pathspec 处理（支持末段与其他段通配），被 `.gitignore` 忽略的产物自然排除。
 */
export function listGitFiles(root: string, patterns: ReadonlyArray<string>): string[] {
  if (patterns.length === 0) return [];
  const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...patterns], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\n').filter((path) => path.length > 0);
}

/** 固定排除：生成代码目录，以及各级 AGENTS.md 与 CLAUDE.md。 */
export function isExcludedPath(path: string): boolean {
  const segments = path.split('/');
  if (segments.some((segment) => excludedDirectories.has(segment))) return true;
  return excludedFileNames.has(segments[segments.length - 1]!);
}

/** 按 ENG-07 的顺序给单个文件分类：先 test，再 code，其余为 asset。 */
export function classifySourceFile(path: string, testPackagePrefix: string): SourceClass {
  const segments = path.split('/');
  const name = segments[segments.length - 1]!;
  if (/\.(?:test|spec)\./.test(name)) return 'test';
  if (testPackagePrefix && path.startsWith(`${testPackagePrefix}/tests/`)) return 'test';
  if (codeExtensions.some((extension) => name.endsWith(extension))) return 'code';
  return 'asset';
}

/** test 角色包 `tests/` 目录的相对前缀。 */
function testPackageTestsPrefix(manifest: ProjectManifest): string {
  return `packages/${packageByRole(manifest, 'test').directory}`;
}

/**
 * 读取手写源码文件清单：对每个 `sourceRoots` 目录取 git 已跟踪与未忽略的新文件，
 * 固定排除生成代码与 AGENTS.md/CLAUDE.md，并按 code、test、asset 分类。
 */
export function readSourceInventory(
  root: string,
  manifest: ProjectManifest = loadProjectManifest(root),
): SourceInventory {
  assertGitWorkTree(root);
  const prefix = testPackageTestsPrefix(manifest);
  const seen = new Set<string>();
  const files: SourceFile[] = [];
  for (const sourceRoot of manifest.fingerprints.sourceRoots) {
    for (const path of listGitFiles(root, [sourceRoot])) {
      if (isExcludedPath(path) || seen.has(path)) continue;
      seen.add(path);
      files.push({ path, class: classifySourceFile(path, prefix) });
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files };
}

/** 清单中的 code 类文件，按路径排序。 */
export function codeFiles(inventory: SourceInventory): string[] {
  return inventory.files.filter((file) => file.class === 'code').map((file) => file.path);
}
