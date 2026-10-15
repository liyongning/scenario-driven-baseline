import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { defineCase } from '../../src/cases/define-case.ts';
import { readRepositoryFile, repositoryRoot } from './openapi-contract-fixture.ts';

const engineContractPath = 'packages/openapi/testing/engine/trade-v1.yaml';
const engineConfigPath = 'packages/openapi/testing/engine/redocly.yaml';

function adjustments(config: string) {
  const lines = config.split('\n');
  return lines.flatMap((line, index) =>
    /^ {2}[a-z0-9-]+:/.test(line)
      ? [{ line: line.trim(), previous: (lines[index - 1] ?? '').trim() }]
      : [],
  );
}

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-004',
    caseId: 'redocly-config-and-lint',
    fixtureCase: 'redocly-config-and-lint',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-004',
        caseKey: 'redocly-config-and-lint',
        checks: ['rule-adjustments-justified', 'example-zero-warnings'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const configs = [readRepositoryFile('redocly.yaml'), readRepositoryFile(engineConfigPath)];
    await checkpoint('rule-adjustments-justified', () => {
      for (const config of configs) {
        const configured = adjustments(config);
        expect(configured.length).toBeGreaterThan(0);
        for (const adjustment of configured) {
          expect(adjustment.previous).toMatch(/^#\s*\S/);
        }
      }
    });
    await checkpoint('example-zero-warnings', () => {
      const result = spawnSync(
        join(repositoryRoot, 'node_modules/.bin/redocly'),
        [
          'lint',
          engineContractPath,
          '--config',
          join(repositoryRoot, engineConfigPath),
          '--format',
          'json',
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      );
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout) as {
        totals: { errors: number; warnings: number };
      };
      expect(report.totals).toEqual({ errors: 0, warnings: 0, ignored: 0 });
    });
  },
  { timeoutMs: 30_000 },
);
