import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { collectFiles } from '../../../../scripts/lib/fingerprints.ts';
import { loadProjectManifest, packagesByRole } from '../../../../scripts/lib/project-manifest.ts';
import { cliEvidence } from './scenario-gate-helpers.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

function dependencyRoot() {
  const root = mkdtempSync(join(tmpdir(), 'protocol-adapter-boundary-'));
  for (const file of [
    'package.json',
    'project.manifest.json',
    'tsconfig.base.json',
    '.dependency-cruiser.cjs',
  ])
    cpSync(resolve(repositoryRoot, file), join(root, file));
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  cpSync(
    resolve(repositoryRoot, 'scripts/lib/dependency-rules.cjs'),
    join(root, 'scripts/lib/dependency-rules.cjs'),
  );
  mkdirSync(join(root, 'packages/protocol'), { recursive: true });
  for (const directory of ['src', 'testing']) {
    cpSync(
      resolve(repositoryRoot, 'packages/protocol', directory),
      join(root, 'packages/protocol', directory),
      { recursive: true },
    );
  }
  cpSync(
    resolve(repositoryRoot, 'packages/protocol/package.json'),
    join(root, 'packages/protocol/package.json'),
  );
  symlinkSync(resolve(repositoryRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function depcruise(root: string, target: string) {
  return spawnSync(
    resolve(repositoryRoot, 'node_modules/.bin/depcruise'),
    ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', target],
    { cwd: root, encoding: 'utf8' },
  );
}

cliEvidence(
  'SCN-PROTOCOL-CONTRACT-016',
  'adapter-artifact-boundary',
  ['adapter-not-in-dist', 'production-import-blocked', 'adapter-boundary-restorable'],
  async (context, check) => {
    const manifest = loadProjectManifest(repositoryRoot);

    await check('adapter-not-in-dist', () => {
      for (const protocol of packagesByRole(manifest, 'protocol')) {
        const built = spawnSync('pnpm', ['--filter', protocol.name, 'build'], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        });
        context.expect(built.status, `${built.stdout}${built.stderr}`).toBe(0);
        const files = collectFiles(
          resolve(repositoryRoot, 'packages', protocol.directory, 'dist'),
          () => true,
        ).map((path) => path.slice(repositoryRoot.length + 1));
        context.expect(files.some((path) => path.includes('/testing/'))).toBe(false);
        context.expect(files.some((path) => /(?:^|\/)adapter(?:[./]|$)/.test(path))).toBe(false);
      }
    });

    await check('production-import-blocked', () => {
      const root = dependencyRoot();
      try {
        const entry = join(root, 'packages/protocol/src/index.ts');
        writeFileSync(entry, `${readFileSync(entry, 'utf8')}\nimport '../testing/adapter.ts';\n`);
        const result = depcruise(root, 'packages/protocol/src/index.ts');
        context.expect(result.status).not.toBe(0);
        context.expect(`${result.stdout}${result.stderr}`).toContain('production-no-test');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    await check('adapter-boundary-restorable', () => {
      const root = dependencyRoot();
      try {
        const result = depcruise(root, 'packages/protocol/src');
        context.expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
  { timeoutMs: 60_000 },
);
