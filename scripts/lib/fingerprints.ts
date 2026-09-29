import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export type VerificationFingerprints = Readonly<{
  sourceDigest: string;
  specDigest: string;
  idlDigest: string;
  fixtureDigest: string;
}>;

export function digestFiles(repositoryRoot: string, paths: ReadonlyArray<string>): string {
  const hash = createHash('sha256');
  for (const path of [...paths].sort((left, right) => relative(repositoryRoot, left).localeCompare(relative(repositoryRoot, right)))) {
    hash.update(relative(repositoryRoot, path));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function collectFiles(root: string, accept: (path: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const output: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!['dist', 'generated', '.generated', '.generated-live', 'node_modules'].includes(entry.name)) visit(path);
      } else if (accept(path)) output.push(path);
    }
  };
  visit(root);
  return output;
}

export function buildVerificationFingerprints(repositoryRoot: string): VerificationFingerprints {
  const sourceRoots = [
    'packages/payment-sdk/src',
    'packages/payment-protocol/src',
    'packages/payment-protocol/testing',
    'packages/e2e/src',
    'packages/e2e/tests',
    'scripts',
  ];
  const sourcePaths = [
    ...sourceRoots.flatMap(root => collectFiles(resolve(repositoryRoot, root), path => /\.(?:ts|js)$/.test(path))),
    ...collectFiles(
      resolve(repositoryRoot, 'packages/e2e/host'),
      path => /\.(?:ts|js|json|wxml|wxss)$/.test(path),
    ),
  ];
  const specPaths = [
    resolve(repositoryRoot, 'openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk/spec.md'),
    resolve(repositoryRoot, 'openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk-contract/spec.md'),
  ];
  const fixturePaths = collectFiles(resolve(repositoryRoot, 'packages/e2e/tests/fixtures'), path => path.endsWith('.json'));
  return {
    sourceDigest: digestFiles(repositoryRoot, sourcePaths),
    specDigest: digestFiles(repositoryRoot, specPaths),
    idlDigest: digestFiles(repositoryRoot, [resolve(repositoryRoot, 'proto-gen.lock')]),
    fixtureDigest: digestFiles(repositoryRoot, fixturePaths),
  };
}
