import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { loadProjectManifest } from './project-manifest.ts';
import { isExcludedPath, listGitFiles, readSourceInventory } from './source-inventory.ts';

/** 一次验收运行的输入摘要；files 是各摘要输入文件的 sha256 明细。 */
export type VerificationFingerprints = Readonly<{
  sourceDigest: string;
  specDigest: string;
  protocolDigest: string;
  fixtureDigest: string;
  files: Readonly<Record<string, string>>;
}>;

const generatedDirectories = new Set(['dist', 'generated', '.generated', 'node_modules']);

export function digestFiles(repositoryRoot: string, paths: ReadonlyArray<string>): string {
  return digestPaths(
    repositoryRoot,
    paths.map((path) => relative(repositoryRoot, path)),
  );
}

function digestPaths(repositoryRoot: string, paths: ReadonlyArray<string>): string {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(join(repositoryRoot, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function fileDigests(
  repositoryRoot: string,
  paths: ReadonlyArray<string>,
): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const path of [...paths].sort()) {
    digests[path] = createHash('sha256')
      .update(readFileSync(join(repositoryRoot, path)))
      .digest('hex');
  }
  return digests;
}

export function collectFiles(root: string, accept: (path: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const output: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!generatedDirectories.has(entry.name)) visit(path);
      } else if (accept(path)) output.push(path);
    }
  };
  visit(root);
  return output;
}

/** 展开清单的构建输入/协议输入：按 git pathspec 取已跟踪与未忽略文件，结果去重排序。 */
function expandInputs(repositoryRoot: string, patterns: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  for (const path of listGitFiles(repositoryRoot, patterns)) {
    if (isExcludedPath(path)) continue;
    seen.add(path);
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

function uniqueSorted(paths: ReadonlyArray<string>): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

export function buildVerificationFingerprints(repositoryRoot: string): VerificationFingerprints {
  const manifest = loadProjectManifest(repositoryRoot);
  const sourcePaths = uniqueSorted([
    ...readSourceInventory(repositoryRoot, manifest).files.map((file) => file.path),
    ...expandInputs(repositoryRoot, manifest.fingerprints.buildInputs),
  ]);
  const protocolPaths = uniqueSorted(
    expandInputs(repositoryRoot, manifest.fingerprints.protocolInputs),
  );
  const specPaths = uniqueSorted(
    [
      ...collectFiles(resolve(repositoryRoot, 'openspec/specs'), (path) =>
        path.endsWith('/spec.md'),
      ),
      ...collectFiles(
        resolve(repositoryRoot, 'openspec/changes'),
        (path) =>
          path.endsWith('/spec.md') &&
          path.split('/').includes('specs') &&
          !path.split('/').includes('archive'),
      ),
    ].map((path) => relative(repositoryRoot, path)),
  );
  const fixturePaths = uniqueSorted(
    collectFiles(resolve(repositoryRoot, 'packages/e2e/tests/fixtures'), (path) =>
      path.endsWith('.json'),
    ).map((path) => relative(repositoryRoot, path)),
  );
  return {
    sourceDigest: digestPaths(repositoryRoot, sourcePaths),
    specDigest: digestPaths(repositoryRoot, specPaths),
    protocolDigest: digestPaths(repositoryRoot, protocolPaths),
    fixtureDigest: digestPaths(repositoryRoot, fixturePaths),
    files: fileDigests(repositoryRoot, [
      ...sourcePaths,
      ...specPaths,
      ...protocolPaths,
      ...fixturePaths,
    ]),
  };
}
