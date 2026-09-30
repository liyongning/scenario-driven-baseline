import { cliEvidence, enableInventory, fixtureRoot, flowHeader, runGate, writeSpec } from './scenario-gate-helpers.ts';

cliEvidence('SCN-SCENARIO-GATE-007', 'invalid-flow-row-cli', ['flow-row-schema'], async (context, check) => {
  const fixture = fixtureRoot();
  try { writeSpec(fixture.root, `### Requirement: flow\n${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | sdk-unit | invalid |`); const result = runGate(fixture.root); await check('flow-row-schema', () => context.expect(result.output?.issues.join('\n')).toContain('invalid FLOW row')); } finally { fixture.cleanup(); }
});

cliEvidence('SCN-SCENARIO-GATE-007', 'outside-flow-table-cli', ['outside-table-rejected', 'inside-table-accepted'], async (context, check) => {
  const fixture = fixtureRoot();
  try { writeSpec(fixture.root, `${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | integration | outside |`); const result = runGate(fixture.root); await check('outside-table-rejected', () => context.expect(result.output?.issues.join('\n')).toContain('would be lost during archive')); writeSpec(fixture.root, `### Requirement: flow\n${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | integration | inside |`); enableInventory(fixture.root); const restored = runGate(fixture.root, ['--inventory']); await check('inside-table-accepted', () => context.expect((restored.output?.flows as Array<{ id: string }> ?? []).map(item => item.id)).toContain('FLOW-TEST-001')); } finally { fixture.cleanup(); }
});
