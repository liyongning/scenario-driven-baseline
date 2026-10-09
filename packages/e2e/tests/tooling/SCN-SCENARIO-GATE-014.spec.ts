import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  controlledFixtureRoot,
  ownerDigest,
  runFixtureCli,
  writeOwnerFixture,
} from './fixture-gate-helpers.ts';

const alpha =
  '## MODIFIED Requirements\n\n### Requirement: BASE-01 交易示例（A）\n\n系统 SHALL 提供交易示例。\n\n#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n\n- **WHEN** A\n- **THEN** A\n';
const beta =
  '## MODIFIED Requirements\n\n### Requirement: BASE-01 交易示例（B）\n\n系统 SHALL 提供交易示例。\n\n#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n\n- **WHEN** B\n- **THEN** B\n';

cliEvidence(
  'SCN-SCENARIO-GATE-014',
  'fixture-ambiguity-cli',
  ['ambiguity-reported', 'scope-resolves'],
  async (context, check) => {
    const gate = controlledFixtureRoot({ changes: { alpha, beta } });
    try {
      writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
        requirementDigest: await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001', ['alpha']),
      });

      await check('ambiguity-reported', () => {
        const result = runFixtureCli(gate);
        context.expect(result.status).toBe(1);
        const issues = result.output.issues.join('\n');
        context.expect(issues).toContain('多个 active Change 修改同一 Requirement');
        context.expect(issues).toContain('alpha');
        context.expect(issues).toContain('beta');
      });

      await check('scope-resolves', () => {
        const scoped = runFixtureCli(gate, ['--change', 'alpha']);
        context.expect(scoped.status).toBe(0);
        context.expect(scoped.output.issues).toEqual([]);
        const other = runFixtureCli(gate, ['--change', 'beta']);
        context.expect(other.status).toBe(1);
        context
          .expect(other.output.issues.join('\n'))
          .toContain('来源摘要过期（运行 pnpm fixtures:refresh SCN-SAMPLE-CONTRACT-001）');
      });
    } finally {
      gate.cleanup();
    }
  },
);
