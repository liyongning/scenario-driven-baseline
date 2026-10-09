import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence, runGate } from './scenario-gate-helpers.ts';
import { controlledFixtureRoot, runFixtureCli, writeOwnerFixture } from './fixture-gate-helpers.ts';

cliEvidence(
  'SCN-SCENARIO-GATE-018',
  'change-arg-cli',
  ['empty-value-rejected', 'unknown-change-rejected', 'no-fallback'],
  async (context, check) => {
    const gate = controlledFixtureRoot();
    try {
      // 有意写入过期摘要：合法运行会报过期，非法参数不得退化为该运行。
      writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', { requirementDigest: '0'.repeat(64) });
      mkdirSync(join(gate.root, 'openspec/changes/archive/2026-01-01-old'), { recursive: true });

      await check('empty-value-rejected', () => {
        for (const args of [['--change'], ['--change', '']]) {
          const result = runFixtureCli(gate, args);
          context.expect(result.status).toBe(1);
          context.expect(result.output.issues.join('\n')).toContain('--change 需要 Change 名');
          const scenarios = runGate(gate.root, args);
          context.expect(scenarios.status).toBe(1);
          context.expect(scenarios.output?.issues.join('\n')).toContain('--change 需要 Change 名');
        }
        const fromEnv = runFixtureCli(gate, [], { SCENARIO_GATE_CHANGES: '' });
        context.expect(fromEnv.status).toBe(1);
        context
          .expect(fromEnv.output.issues.join('\n'))
          .toContain('SCENARIO_GATE_CHANGES 已设置但为空值');
        const fromEnvScenarios = runGate(gate.root, [], true, { SCENARIO_GATE_CHANGES: '' });
        context.expect(fromEnvScenarios.status).toBe(1);
        context
          .expect(fromEnvScenarios.output?.issues.join('\n'))
          .toContain('SCENARIO_GATE_CHANGES 已设置但为空值');
      });

      await check('unknown-change-rejected', () => {
        const direct = runFixtureCli(gate, ['--change', 'nope']);
        context.expect(direct.status).toBe(1);
        context.expect(direct.output.issues.join('\n')).toContain('--change nope');
        context.expect(direct.output.issues.join('\n')).toContain('不存在于 active 目录');
        const directScenarios = runGate(gate.root, ['--change', 'nope']);
        context.expect(directScenarios.status).toBe(1);
        context.expect(directScenarios.output?.issues.join('\n')).toContain('--change nope');
        context.expect(directScenarios.output?.issues.join('\n')).toContain('不存在于 active 目录');
        const archived = runFixtureCli(gate, ['--change', '2026-01-01-old']);
        context.expect(archived.status).toBe(1);
        context.expect(archived.output.issues.join('\n')).toContain('--change 2026-01-01-old');
        const archivedScenarios = runGate(gate.root, ['--change', '2026-01-01-old']);
        context.expect(archivedScenarios.status).toBe(1);
        context
          .expect(archivedScenarios.output?.issues.join('\n'))
          .toContain('--change 2026-01-01-old');
        const fromEnv = runFixtureCli(gate, [], { SCENARIO_GATE_CHANGES: 'nope' });
        context.expect(fromEnv.status).toBe(1);
        context.expect(fromEnv.output.issues.join('\n')).toContain('SCENARIO_GATE_CHANGES nope');
        const fromEnvScenarios = runGate(gate.root, [], true, { SCENARIO_GATE_CHANGES: 'nope' });
        context.expect(fromEnvScenarios.status).toBe(1);
        context
          .expect(fromEnvScenarios.output?.issues.join('\n'))
          .toContain('SCENARIO_GATE_CHANGES nope');
      });

      await check('no-fallback', () => {
        const result = runFixtureCli(gate, ['--change', 'nope']);
        context.expect(result.status).toBe(1);
        context.expect(result.output).not.toHaveProperty('manifests');
        context.expect(result.output.issues.join('\n')).not.toContain('来源摘要过期');
        const scenarios = runGate(gate.root, ['--change', 'nope']);
        context.expect(scenarios.status).toBe(1);
        context.expect(scenarios.output).not.toHaveProperty('scenarios');
        context.expect(scenarios.output).not.toHaveProperty('flows');
        context.expect(scenarios.output?.issues.join('\n')).not.toContain('missing binding');
      });
    } finally {
      gate.cleanup();
    }
  },
);
