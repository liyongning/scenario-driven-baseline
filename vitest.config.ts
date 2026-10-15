import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { ScenarioReporter } from './packages/e2e/src/reporters/scenario-reporter.ts';
import { buildVerificationFingerprints } from './scripts/lib/fingerprints.ts';
import { coverageScope } from './scripts/lib/coverage-scope.ts';
import { loadProjectManifest, testProjectConfigs } from './scripts/lib/project-manifest.ts';

const repositoryRoot = import.meta.dirname;
const runId = process.env.VERIFY_RUN_ID ?? 'local';

const fingerprints = buildVerificationFingerprints(repositoryRoot);
const coverage = coverageScope(repositoryRoot);
const manifest = loadProjectManifest(repositoryRoot);
const projectEnvironments = Object.fromEntries(
  manifest.testProjects.map((project) => [project.name, project.environment ?? project.name]),
);
const reportFile = process.env.VERIFY_REPORT_FILE
  ? resolve(repositoryRoot, process.env.VERIFY_REPORT_FILE)
  : resolve(repositoryRoot, `artifacts/${runId}/reports/scenarios.json`);

export default defineConfig({
  test: {
    projects: [...testProjectConfigs(manifest)],
    reporters: [
      'default',
      new ScenarioReporter({
        outputFile: reportFile,
        runId,
        projectEnvironments,
        fingerprints,
        // 按需运行经 TEST_AFFECTED_PARTIAL 标记报告，场景门禁据此拒收（GATE-13）。
        partial: process.env.TEST_AFFECTED_PARTIAL === '1',
      }),
    ],
    coverage: {
      provider: 'v8',
      include: [...coverage.include],
      exclude: [...coverage.exclude],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
      reporter: ['text', 'json', 'html'],
      reportsDirectory: `artifacts/${runId}/coverage`,
    },
  },
});
