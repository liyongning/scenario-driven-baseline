import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { ScenarioReporter } from './packages/e2e/src/reporters/scenario-reporter.ts';
import { buildVerificationFingerprints } from './scripts/lib/fingerprints.ts';

const repositoryRoot = import.meta.dirname;
const runId = process.env.PAYMENT_RUN_ID ?? 'local';

const fingerprints = buildVerificationFingerprints(repositoryRoot);
const reportFile = process.env.PAYMENT_REPORT_FILE
  ? resolve(repositoryRoot, process.env.PAYMENT_REPORT_FILE)
  : resolve(repositoryRoot, `artifacts/${runId}/reports/scenarios.json`);

export default defineConfig({ test: {
  projects: ['packages/sdk/vitest.config.ts', 'packages/protocol/vitest.config.ts', 'packages/e2e/vitest.config.unit.ts', 'packages/e2e/vitest.config.integration.ts', 'packages/e2e/vitest.config.weapp.ts'],
  reporters: ['default', new ScenarioReporter({
    outputFile: reportFile,
    runId,
    fingerprints,
  })],
  coverage: {
    provider: 'v8',
    include: ['packages/sdk/src/**/*.ts', 'packages/protocol/src/**/*.ts', 'packages/protocol/testing/**/*.ts', 'packages/e2e/src/**/*.ts', 'packages/e2e/host/**/*.js', 'scripts/**/*.ts'],
    exclude: [
      '**/*.test.ts',
      '**/*.d.ts',
      '**/.generated/**',
      'packages/protocol/src/generated/**',
    ],
    thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    reporter: ['text', 'json', 'html'],
    reportsDirectory: `artifacts/${runId}/coverage`,
  },
} });
