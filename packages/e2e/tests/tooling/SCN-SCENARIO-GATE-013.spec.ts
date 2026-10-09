import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  baseSpecText,
  controlledFixtureRoot,
  manifestText,
  runFixtureCli,
  runRefreshCli,
  writeOwnerFixture,
} from './fixture-gate-helpers.ts';

cliEvidence(
  'SCN-SCENARIO-GATE-013',
  'fixture-refresh-cli',
  ['refresh-recomputes', 'refresh-scoped', 'refresh-rejects-invalid'],
  async (context, check) => {
    await check('refresh-recomputes', async () => {
      const gate = controlledFixtureRoot();
      try {
        const directory = writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
          requirementDigest: '0'.repeat(64),
        });
        writeFileSync(gate.specPath, baseSpecText.replace('返回订单号', '返回订单号与支付链接'));
        writeFileSync(join(directory, 'case.json'), '{"request":"changed","response":{}}');
        const refreshed = runRefreshCli(gate, ['SCN-SAMPLE-CONTRACT-001']);
        context.expect(refreshed.status).toBe(0);
        context.expect(refreshed.output.updated).toEqual(['SCN-SAMPLE-CONTRACT-001']);
        const result = runFixtureCli(gate);
        context.expect(result.status).toBe(0);
        context.expect(result.output.issues).toEqual([]);
      } finally {
        gate.cleanup();
      }
    });

    await check('refresh-scoped', async () => {
      const gate = controlledFixtureRoot();
      try {
        const first = writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
          requirementDigest: '0'.repeat(64),
        });
        const second = writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-002', {
          requirementDigest: '0'.repeat(64),
        });
        const beforeFirst = manifestText(first);
        const untouched = manifestText(second);
        const refreshed = runRefreshCli(gate, ['SCN-SAMPLE-CONTRACT-001']);
        context.expect(refreshed.status).toBe(0);
        context.expect(manifestText(first)).not.toBe(beforeFirst);
        context.expect(manifestText(second)).toBe(untouched);
        const result = runFixtureCli(gate);
        context
          .expect(result.output.issues.join('\n'))
          .toContain('SCN-SAMPLE-CONTRACT-002: 来源摘要过期');
        context
          .expect(
            result.output.issues.filter((issue) => issue.startsWith('SCN-SAMPLE-CONTRACT-001')),
          )
          .toEqual([]);
      } finally {
        gate.cleanup();
      }
    });

    await check('refresh-rejects-invalid', async () => {
      const missing = controlledFixtureRoot();
      try {
        const directory = writeOwnerFixture(missing, 'SCN-SAMPLE-CONTRACT-001', {
          requirementDigest: '0'.repeat(64),
        });
        const unknown = writeOwnerFixture(missing, 'SCN-SAMPLE-MISSING-001', {
          requirementDigest: '0'.repeat(64),
        });
        const untouched = manifestText(directory) + manifestText(unknown);
        const result = runRefreshCli(missing, ['SCN-SAMPLE-MISSING-001']);
        context.expect(result.status).toBe(1);
        context.expect(result.output.issues.join('\n')).toContain('在有效 Spec 中不存在');
        context.expect(manifestText(directory) + manifestText(unknown)).toBe(untouched);
      } finally {
        missing.cleanup();
      }

      const ambiguous = controlledFixtureRoot({
        changes: {
          alpha:
            '## MODIFIED Requirements\n\n### Requirement: BASE-01 交易示例（A）\n\n系统 SHALL 提供交易示例。\n\n#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n\n- **WHEN** A\n- **THEN** A\n',
          beta: '## MODIFIED Requirements\n\n### Requirement: BASE-01 交易示例（B）\n\n系统 SHALL 提供交易示例。\n\n#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n\n- **WHEN** B\n- **THEN** B\n',
        },
      });
      try {
        const directory = writeOwnerFixture(ambiguous, 'SCN-SAMPLE-CONTRACT-001', {
          requirementDigest: '0'.repeat(64),
        });
        const untouched = manifestText(directory);
        const result = runRefreshCli(ambiguous, ['SCN-SAMPLE-CONTRACT-001']);
        context.expect(result.status).toBe(1);
        context
          .expect(result.output.issues.join('\n'))
          .toContain('多个 active Change 修改同一 Requirement');
        context.expect(manifestText(directory)).toBe(untouched);
      } finally {
        ambiguous.cleanup();
      }
    });
  },
);
