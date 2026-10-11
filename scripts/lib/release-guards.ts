import { type Stats } from 'node:fs';
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

type FileIdentity = Readonly<{ dev: number; ino: number; nlink: number }>;
type SnapshotIdentity = FileIdentity & Readonly<{ bytes: string }>;
type PathGuard = Readonly<{
  path: string;
  label: string;
  ancestors: ReadonlyArray<Readonly<{ path: string; identity: FileIdentity }>>;
}>;
const identity = (stat: Stats): FileIdentity => ({
  dev: stat.dev,
  ino: stat.ino,
  nlink: stat.nlink,
});
const sameIdentity = (left: FileIdentity, right: FileIdentity) =>
  left.dev === right.dev && left.ino === right.ino && left.nlink === right.nlink;
const sameNode = (left: FileIdentity, right: FileIdentity) =>
  left.dev === right.dev && left.ino === right.ino;

async function optionalLstat(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function captureSnapshotIdentity(path: string): Promise<SnapshotIdentity> {
  const stat = await lstat(path);
  return { ...identity(stat), bytes: await readFile(path, 'utf8') };
}

export async function assertSnapshotIntegrity(
  path: string,
  expected: SnapshotIdentity,
): Promise<void> {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o777) !== 0o400 ||
    !sameIdentity(identity(stat), expected)
  ) {
    throw new Error('release record snapshot integrity changed during release');
  }
  if ((await readFile(path, 'utf8')) !== expected.bytes)
    throw new Error('release record snapshot content changed during release');
}

export async function capturePathGuard(
  root: string,
  path: string,
  label: string,
): Promise<PathGuard> {
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

export async function assertPathGuard(guard: PathGuard): Promise<void> {
  for (const ancestor of guard.ancestors) {
    const stat = await lstat(ancestor.path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      !sameNode(identity(stat), ancestor.identity)
    ) {
      throw new Error(`${guard.label} path identity changed during release`);
    }
  }
  const target = await optionalLstat(guard.path);
  if (target?.isSymbolicLink()) throw new Error(`${guard.label} must not be a symbolic link`);
}

export async function writeCheckpoint(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}

export async function bestEffortRemove(
  path: string,
  options: Readonly<{ recursive?: boolean }> = {},
): Promise<void> {
  try {
    await rm(path, { recursive: options.recursive ?? false, force: true });
  } catch {
    /* v8 ignore next -- 最终清理不得覆盖已经确定的发布结果或原始失败。 */
  }
}

export function argument(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

function outsideRoot(rootPath: string, path: string): boolean {
  const offset = relative(rootPath, path);
  return offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset);
}

async function rejectSymlinkComponents(
  rootPath: string,
  path: string,
  label: string,
  mustExist: boolean,
): Promise<void> {
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

export async function pathInside(
  root: string,
  value: string,
  label: string,
  mustExist = false,
): Promise<string> {
  const lexicalRoot = resolve(root);
  const rootPath = await realpath(lexicalRoot);
  const lexicalPath = resolve(lexicalRoot, value);
  if (outsideRoot(lexicalRoot, lexicalPath))
    throw new Error(`${label} must stay inside the repository`);
  const offset = relative(lexicalRoot, lexicalPath);
  const path = resolve(rootPath, offset);
  await rejectSymlinkComponents(rootPath, path, label, mustExist);
  return mustExist ? realpath(path) : path;
}
