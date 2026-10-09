import {
  cliEvidence,
  enableInventory,
  fixtureRoot,
  runGate,
  verification,
  writeSpec,
} from './scenario-gate-helpers.ts';
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

const mainSpec =
  '### Requirement: BASE-01 交易示例\n#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n' +
  verification();

/** 场景门禁部分使用带 verification 的 delta：013 的 Fixture delta 只需 WHEN/THEN。 */
const alphaScenarioDelta =
  '## ADDED Requirements\n### Requirement: BASE-05 A 新增\n#### Scenario: SCN-SAMPLE-CONTRACT-005 A 场景\n' +
  verification();
const betaScenarioDelta =
  '## ADDED Requirements\n### Requirement: BASE-06 B 新增\n#### Scenario: SCN-SAMPLE-CONTRACT-006 B 场景\n' +
  verification();

const scenarioIds = (output: Readonly<{ scenarios?: unknown }> | undefined) =>
  ((output?.scenarios as Array<{ id: string }> | undefined) ?? []).map((item) => item.id);

cliEvidence(
  'SCN-SCENARIO-GATE-017',
  'change-scope-scenarios-cli',
  [
    'default-all-active',
    'scoped-merge',
    'multi-value-forms',
    'env-scope-fallback',
    'help-states-default',
  ],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(fixture.root, mainSpec);
      writeSpec(fixture.root, alphaScenarioDelta, 'openspec/changes/alpha/specs/sample/spec.md');
      writeSpec(fixture.root, betaScenarioDelta, 'openspec/changes/beta/specs/sample/spec.md');
      enableInventory(fixture.root);

      await check('default-all-active', () => {
        const all = runGate(fixture.root, ['--inventory']);
        context
          .expect(scenarioIds(all.output))
          .toEqual([
            'SCN-SAMPLE-CONTRACT-001',
            'SCN-SAMPLE-CONTRACT-005',
            'SCN-SAMPLE-CONTRACT-006',
          ]);
      });

      await check('scoped-merge', () => {
        const scoped = runGate(fixture.root, ['--inventory', '--change', 'alpha']);
        context
          .expect(scenarioIds(scoped.output))
          .toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-005']);
        context.expect(scenarioIds(scoped.output)).not.toContain('SCN-SAMPLE-CONTRACT-006');
      });

      await check('multi-value-forms', () => {
        const repeated = runGate(fixture.root, [
          '--inventory',
          '--change',
          'alpha',
          '--change',
          'beta',
        ]);
        const comma = runGate(fixture.root, ['--inventory', '--change', 'alpha,beta']);
        context
          .expect(scenarioIds(repeated.output))
          .toEqual([
            'SCN-SAMPLE-CONTRACT-001',
            'SCN-SAMPLE-CONTRACT-005',
            'SCN-SAMPLE-CONTRACT-006',
          ]);
        context.expect(scenarioIds(comma.output)).toEqual(scenarioIds(repeated.output));
      });

      await check('env-scope-fallback', () => {
        const fromEnv = runGate(fixture.root, ['--inventory'], true, {
          SCENARIO_GATE_CHANGES: 'alpha',
        });
        context
          .expect(scenarioIds(fromEnv.output))
          .toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-005']);
        const overridden = runGate(fixture.root, ['--inventory', '--change', 'beta'], true, {
          SCENARIO_GATE_CHANGES: 'alpha',
        });
        context
          .expect(scenarioIds(overridden.output))
          .toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-006']);
      });

      await check('help-states-default', () => {
        const help = runGate(fixture.root, ['--help']);
        context.expect(help.status).toBe(0);
        context
          .expect(help.output?.help)
          .toContain('不带 --change 时合并主 Spec 与全部 active Change');
        context.expect(help.output?.help).toContain('SCENARIO_GATE_CHANGES');
      });
    } finally {
      fixture.cleanup();
    }
  },
);
