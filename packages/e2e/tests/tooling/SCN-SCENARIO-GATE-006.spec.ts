import { cliEvidence, fixtureRoot, runGate, verification, writeSpec } from './scenario-gate-helpers.ts';

cliEvidence('SCN-SCENARIO-GATE-006', 'missing-metadata-cli', ['missing-block-rejected', 'stays-in-denominator'], async (context, check) => {
  const fixture = fixtureRoot();
  try { writeSpec(fixture.root, '### Requirement: metadata\n#### Scenario: SCN-TEST-001 Missing\n'); const result = runGate(fixture.root); await check('missing-block-rejected', () => context.expect(result.output?.issues.join('\n')).toContain('verification metadata missing')); await check('stays-in-denominator', () => context.expect(result.output?.scenarios).toHaveLength(1)); } finally { fixture.cleanup(); }
});

cliEvidence('SCN-SCENARIO-GATE-006', 'multiple-metadata-cli', ['multiple-blocks-rejected'], async (context, check) => {
  const fixture = fixtureRoot();
  try { writeSpec(fixture.root, `### Requirement: metadata\n#### Scenario: SCN-TEST-001 Multiple\n${verification()}\n${verification()}`); const result = runGate(fixture.root); await check('multiple-blocks-rejected', () => context.expect(result.output?.issues.join('\n')).toContain('multiple verification metadata blocks')); } finally { fixture.cleanup(); }
});

cliEvidence('SCN-SCENARIO-GATE-006', 'invalid-metadata-cli', ['schema-enforced', 'stays-in-denominator'], async (context, check) => {
  const fixture = fixtureRoot();
  try { writeSpec(fixture.root, '### Requirement: metadata\n#### Scenario: SCN-TEST-001 Invalid\n```json verification\n{}\n```'); const result = runGate(fixture.root); await check('schema-enforced', () => context.expect(result.output?.issues.join('\n')).toContain('invalid verification metadata')); await check('stays-in-denominator', () => context.expect(result.output?.scenarios).toHaveLength(1)); } finally { fixture.cleanup(); }
});
