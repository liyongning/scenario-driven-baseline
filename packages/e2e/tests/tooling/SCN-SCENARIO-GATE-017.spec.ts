import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  controlledFixtureRoot,
  ownerDigest,
  runFixtureCli,
  writeOwnerFixture,
} from './fixture-gate-helpers.ts';

const alphaDelta = [
  '## ADDED Requirements',
  '',
  '### Requirement: BASE-05 A 新增',
  '',
  '系统 SHALL 提供 A 场景。',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-005 A 场景',
  '',
  '- **WHEN** A',
  '- **THEN** A',
  '',
].join('\n');

const betaDelta = [
  '## ADDED Requirements',
  '',
  '### Requirement: BASE-06 B 新增',
  '',
  '系统 SHALL 提供 B 场景。',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-006 B 场景',
  '',
  '- **WHEN** B',
  '- **THEN** B',
  '',
].join('\n');

cliEvidence(
  'SCN-SCENARIO-GATE-017',
  'change-scope-fixtures-cli',
  ['scoped-merge', 'env-scope-fallback', 'help-states-default'],
  async (context, check) => {
    const gate = controlledFixtureRoot({ changes: { alpha: alphaDelta, beta: betaDelta } });
    try {
      writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-005', {
        requirementDigest: await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-005', ['alpha']),
      });
      writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-006', {
        requirementDigest: await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-006', ['beta']),
      });

      await check('scoped-merge', () => {
        const all = runFixtureCli(gate);
        context.expect(all.status).toBe(0);
        context.expect(all.output.issues).toEqual([]);
        const scoped = runFixtureCli(gate, ['--change', 'alpha']);
        context.expect(scoped.status).toBe(1);
        context
          .expect(scoped.output.issues.join('\n'))
          .toContain('SCN-SAMPLE-CONTRACT-006: 在有效 Spec 中不存在');
        context
          .expect(
            scoped.output.issues.filter((issue) => issue.startsWith('SCN-SAMPLE-CONTRACT-005')),
          )
          .toEqual([]);
      });

      await check('env-scope-fallback', () => {
        const fromEnv = runFixtureCli(gate, [], { SCENARIO_GATE_CHANGES: 'alpha' });
        context
          .expect(fromEnv.output.issues.join('\n'))
          .toContain('SCN-SAMPLE-CONTRACT-006: 在有效 Spec 中不存在');
        context
          .expect(
            fromEnv.output.issues.filter((issue) => issue.startsWith('SCN-SAMPLE-CONTRACT-005')),
          )
          .toEqual([]);
        const overridden = runFixtureCli(gate, ['--change', 'beta'], {
          SCENARIO_GATE_CHANGES: 'alpha',
        });
        context
          .expect(overridden.output.issues.join('\n'))
          .toContain('SCN-SAMPLE-CONTRACT-005: 在有效 Spec 中不存在');
        context
          .expect(
            overridden.output.issues.filter((issue) => issue.startsWith('SCN-SAMPLE-CONTRACT-006')),
          )
          .toEqual([]);
      });

      await check('help-states-default', () => {
        const help = runFixtureCli(gate, ['--help']);
        context.expect(help.status).toBe(0);
        context
          .expect(help.output.help)
          .toContain('不带 --change 时合并主 Spec 与全部 active Change');
        context.expect(help.output.help).toContain('SCENARIO_GATE_CHANGES');
      });
    } finally {
      gate.cleanup();
    }
  },
);
