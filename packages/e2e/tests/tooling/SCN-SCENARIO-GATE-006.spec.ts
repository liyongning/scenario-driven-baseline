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
  try {
    writeSpec(fixture.root, '### Requirement: metadata\n#### Scenario: SCN-TEST-001 Invalid\n```json verification\n{}\n```');
    const result = runGate(fixture.root);
    const unregistered = fixtureRoot();
    const wrongKind = fixtureRoot();
    try {
      writeSpec(unregistered.root, `### Requirement: metadata\n#### Scenario: SCN-TEST-002 Unregistered\n${verification([{ key: 'ok', kind: 'behavior', requiredIn: ['unregistered-project'], checks: ['done'] }])}`);
      const unregisteredResult = runGate(unregistered.root);
      writeSpec(wrongKind.root, `### Requirement: metadata\n#### Scenario: SCN-TEST-003 WrongKind\n${verification([{ key: 'ok', kind: 'module', requiredIn: ['integration'], checks: ['done'] }])}`);
      const wrongKindResult = runGate(wrongKind.root);
      await check('schema-enforced', () => {
        context.expect(result.output?.issues.join('\n')).toContain('invalid verification metadata');
        context.expect(unregisteredResult.output?.issues.join('\n')).toContain('requiredIn project unregistered-project is not registered in project.manifest.json');
        context.expect(wrongKindResult.output?.issues.join('\n')).toContain('kind module cannot run in integration project integration');
      });
    } finally { unregistered.cleanup(); wrongKind.cleanup(); }
    await check('stays-in-denominator', () => context.expect(result.output?.scenarios).toHaveLength(1));
  } finally { fixture.cleanup(); }
});
