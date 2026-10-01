import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence, enableInventory, fixtureRoot, runGate, verification, writeSpec } from './scenario-gate-helpers.ts';

cliEvidence('SCN-SCENARIO-GATE-011', 'multi-pattern-cli', ['single-config', 'multi-pattern'], async (context, check) => {
  const fixture = fixtureRoot();
  try {
    writeSpec(fixture.root, `### Requirement: LEGACY sample\n#### Scenario: LEGACY-SAMPLE-001 Example\n${verification()}\n### Requirement: GENERIC sample\n#### Scenario: SCN-TEST-001 Example\n${verification()}`);
    enableInventory(fixture.root);
    const result = runGate(fixture.root, ['--inventory']);
    const ids = (result.output?.scenarios as Array<{ id: string }> ?? []).map(item => item.id);
    await check('single-config', () => context.expect(ids).toEqual(context.expect.arrayContaining(['LEGACY-SAMPLE-001', 'SCN-TEST-001'])));
    await check('multi-pattern', () => context.expect(ids.filter(id => id.startsWith('LEGACY-'))).toHaveLength(1));
  } finally { fixture.cleanup(); }
});

cliEvidence('SCN-SCENARIO-GATE-011', 'removed-pattern-cli', ['removed-pattern-reported'], async (context, check) => {
  const fixture = fixtureRoot();
  try {
    writeFileSync(join(fixture.root, 'scenario-gate.config.json'), JSON.stringify({ scenarioIdPatterns: ['^LEGACY-[A-Z0-9]+-[0-9]{3}$'], flowIdPatterns: ['^LEGACY-FLOW-[A-Z0-9]+-[0-9]{3}$'], ownerIdPattern: '^[A-Z][A-Z0-9-]+$' }));
    writeSpec(fixture.root, '### Requirement: GENERIC sample\n#### Scenario: SCN-TEST-001 Example\n' + verification());
    enableInventory(fixture.root);
    const result = runGate(fixture.root, ['--inventory']);
    await check('removed-pattern-reported', () => { context.expect(result.status).toBe(1); context.expect(result.output?.issues.join('\n')).toContain('Scenario ID SCN-TEST-001 does not match'); });
  } finally { fixture.cleanup(); }
});
