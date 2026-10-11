import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { defineCase } from '../../src/cases/define-case.ts';
import { contractPath, readRepositoryFile, repositoryRoot } from './openapi-contract-fixture.ts';

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
    const config = readRepositoryFile('redocly.yaml');
    await checkpoint('rule-adjustments-justified', () => {
      const lines = config.split('\n');
      const adjustments = lines.flatMap((line, index) =>
        /^ {2}[a-z0-9-]+:/.test(line)
          ? [{ line: line.trim(), previous: lines[index - 1] ?? '' }]
          : [],
      );
      expect(adjustments).toEqual([
        {
          line: 'operation-4xx-response: off',
          previous: '  # 该协议统一以 HTTP 200 业务信封表达失败，不把业务错误展开为 4xx 状态码。',
        },
      ]);
    });
    await checkpoint('example-zero-warnings', () => {
      const result = spawnSync(
        join(repositoryRoot, 'node_modules/.bin/redocly'),
        [
          'lint',
          contractPath,
          '--config',
          join(repositoryRoot, 'redocly.yaml'),
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
