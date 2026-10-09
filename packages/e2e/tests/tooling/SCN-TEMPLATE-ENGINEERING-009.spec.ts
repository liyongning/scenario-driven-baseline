import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createControlledRoot, minimalManifest } from './controlled-root.ts';
import { coverageExclude, coverageInclude } from '../../../../scripts/lib/coverage-scope.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import { repositoryRoot } from './helpers.ts';

const tsx = resolve(repositoryRoot, 'node_modules/.bin/tsx');
const coverageScript = resolve(repositoryRoot, 'scripts/check-coverage.ts');

const allowedExclusions = [
  'packages/e2e/host/weapp/example-runner.ts',
  'packages/e2e/host/weapp/protocol-runner.ts',
  'packages/e2e/host/weapp/setup.ts',
  'packages/e2e/host/weapp/vite.config.ts',
];

function manifestWith(quality: Record<string, unknown>) {
  return {
    ...minimalManifest(),
    fingerprints: { sourceRoots: ['scripts'], buildInputs: [], protocolInputs: ['proto-gen.lock'] },
    quality: { coverageExclusions: [], maxLinesExemptions: [], ...quality },
  };
}

function writeReport(root: string, paths: ReadonlyArray<string>): string {
  const directory = join(root, 'coverage');
  mkdirSync(directory, { recursive: true });
  const report = join(directory, 'coverage-final.json');
  writeFileSync(
    report,
    JSON.stringify(Object.fromEntries(paths.map((path) => [join(root, path), {}]))),
  );
  return report;
}

function runCoverage(root: string, coveragePath: string) {
  const result = spawnSync(tsx, [coverageScript, '--root', root, '--coverage', coveragePath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.stdout ? (JSON.parse(result.stdout) as { issues: string[] }) : undefined,
  };
}

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-009',
  'missing-file-cli',
  ['missing-file-reported', 'coverage-restorable'],
  async (context, check) => {
    const fixture = createControlledRoot({
      manifest: manifestWith({}),
      files: { 'scripts/a.ts': 'a', 'scripts/b.ts': 'b' },
    });
    try {
      const partial = runCoverage(fixture.root, writeReport(fixture.root, ['scripts/a.ts']));
      const complete = runCoverage(
        fixture.root,
        writeReport(fixture.root, ['scripts/a.ts', 'scripts/b.ts']),
      );
      await check('missing-file-reported', () => {
        context.expect(partial.status).not.toBe(0);
        context.expect(partial.output?.issues.join('\n')).toContain('scripts/b.ts');
      });
      await check('coverage-restorable', () => {
        context.expect(complete.output?.issues, complete.stderr).toEqual([]);
        context.expect(complete.status).toBe(0);
      });
    } finally {
      fixture.cleanup();
    }
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-009',
  'stale-exclusion-cli',
  ['stale-exclusion-reported', 'coverage-restorable'],
  async (context, check) => {
    const stale = createControlledRoot({
      manifest: manifestWith({
        coverageExclusions: [{ path: 'scripts/missing.ts', reason: '宿主专用' }],
      }),
      files: { 'scripts/a.ts': 'a' },
    });
    const valid = createControlledRoot({
      manifest: manifestWith({
        coverageExclusions: [{ path: 'scripts/a.ts', reason: '宿主专用' }],
      }),
      files: { 'scripts/a.ts': 'a' },
    });
    try {
      const staleResult = runCoverage(stale.root, writeReport(stale.root, ['scripts/a.ts']));
      const validResult = runCoverage(valid.root, writeReport(valid.root, []));
      await check('stale-exclusion-reported', () => {
        context.expect(staleResult.status).not.toBe(0);
        context
          .expect(staleResult.output?.issues.join('\n'))
          .toContain('scripts/missing.ts does not match any hand-written code file');
      });
      await check('coverage-restorable', () => {
        context.expect(validResult.output?.issues, validResult.stderr).toEqual([]);
        context.expect(validResult.status).toBe(0);
      });
    } finally {
      stale.cleanup();
      valid.cleanup();
    }
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-009',
  'template-exclusions-fact',
  ['template-exclusions-allowed'],
  async (context, check) => {
    await check('template-exclusions-allowed', () => {
      const manifest = loadProjectManifest(repositoryRoot);
      const exclusions = manifest.quality?.coverageExclusions ?? [];
      context.expect(exclusions.map((item) => item.path).sort()).toEqual(allowedExclusions);
      context.expect(exclusions.every((item) => item.reason.trim().length > 0)).toBe(true);
      const include = coverageInclude(repositoryRoot, manifest);
      const exclude = coverageExclude(repositoryRoot, manifest);
      for (const hostFile of ['packages/e2e/host/weapp/app.js']) {
        context.expect(include).toContain(hostFile);
        context.expect(exclude).not.toContain(hostFile);
      }
    });
  },
);
