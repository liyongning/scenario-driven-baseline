import {
  cliEvidence,
  enableInventory,
  fixtureRoot,
  runGate,
  verification,
  writeSpec,
} from './scenario-gate-helpers.ts';

const mainSpec =
  '### Requirement: BASE-01 交易示例\n#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n' +
  verification();
const alphaSpec =
  '## ADDED Requirements\n### Requirement: BASE-05 A 新增\n#### Scenario: SCN-SAMPLE-CONTRACT-005 A 场景\n' +
  verification();
const betaBrokenSpec =
  '## ADDED Requirements\n### Requirement: BASE-06 B 新增\n' +
  '#### Scenario: SCN-SAMPLE-CONTRACT-006 B 场景（缺 verification）\n\n- **WHEN** B\n- **THEN** B';
const betaFixedSpec =
  '## ADDED Requirements\n### Requirement: BASE-06 B 新增\n#### Scenario: SCN-SAMPLE-CONTRACT-006 B 场景\n' +
  verification();

const scenarioIds = (output: Readonly<{ scenarios?: unknown }> | undefined) =>
  ((output?.scenarios as Array<{ id: string }> | undefined) ?? []).map((item) => item.id);

cliEvidence(
  'SCN-SCENARIO-GATE-019',
  'unscoped-format-cli',
  ['format-checks-unscoped', 'coverage-scoped-after-fix'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(fixture.root, mainSpec);
      writeSpec(fixture.root, alphaSpec, 'openspec/changes/alpha/specs/sample/spec.md');
      writeSpec(fixture.root, betaBrokenSpec, 'openspec/changes/beta/specs/sample/spec.md');
      enableInventory(fixture.root);

      await check('format-checks-unscoped', () => {
        const result = runGate(fixture.root, ['--inventory', '--change', 'alpha']);
        context.expect(result.status).toBe(1);
        context.expect(result.output?.issues.join('\n')).toContain('SCN-SAMPLE-CONTRACT-006');
        context.expect(result.output?.issues.join('\n')).toContain('verification');
        context
          .expect(scenarioIds(result.output))
          .toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-005']);
      });

      await check('coverage-scoped-after-fix', () => {
        writeSpec(fixture.root, betaFixedSpec, 'openspec/changes/beta/specs/sample/spec.md');
        const result = runGate(fixture.root, ['--inventory', '--change', 'alpha']);
        context.expect(result.output?.issues.join('\n')).not.toContain('SCN-SAMPLE-CONTRACT-006');
        context
          .expect(scenarioIds(result.output))
          .toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-005']);
      });
    } finally {
      fixture.cleanup();
    }
  },
);
