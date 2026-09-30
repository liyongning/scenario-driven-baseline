import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence, enableInventory, fixtureRoot, runGate, verification, writeSpec } from './scenario-gate-helpers.ts';

cliEvidence('SCN-SCENARIO-GATE-005', 'payment-baseline-cli', ['single-config', 'multi-pattern', 'payment-baseline-unchanged'], async (context, check) => {
  const fixture = fixtureRoot();
  try {
    writeSpec(fixture.root, `### Requirement: PAYMENT baseline\n#### Scenario: TC-PAYSDK-CORE-001 Existing\n${verification()}\n### Requirement: EXAMPLE generic\n#### Scenario: SCN-TEST-001 Example\n${verification()}`);
    enableInventory(fixture.root);
    const result = runGate(fixture.root, ['--inventory']);
    const ids = (result.output?.scenarios as Array<{ id: string }> ?? []).map(item => item.id);
    await check('single-config', () => context.expect(ids).toEqual(context.expect.arrayContaining(['TC-PAYSDK-CORE-001', 'SCN-TEST-001'])));
    await check('multi-pattern', () => context.expect(ids.filter(id => id.startsWith('TC-'))).toHaveLength(1));
    const baselineRoot = process.cwd();
    const baselineDirectory = join(baselineRoot, 'packages/e2e/tests/fixtures/SCN-SCENARIO-GATE-005');
    const baseline = JSON.parse(readFileSync(join(baselineDirectory, 'payment-inventory.json'), 'utf8')) as { scenarios: unknown[]; flows: unknown[] };
    const current = runGate(baselineRoot, ['--inventory']);
    const expectedCoverage = JSON.parse(readFileSync(join(baselineDirectory, 'payment-coverage-output.json'), 'utf8')) as {
      required: number; executed: number; passed: number; summaries: unknown; issues: string[];
    };
    const coverage = runGate(baselineRoot, ['--input', join(baselineDirectory, 'payment-coverage-input.json')]);
    await check('payment-baseline-unchanged', () => {
      context.expect((current.output?.scenarios as Array<{ id: string }>).filter(item => item.id.startsWith('TC-PAYSDK-'))).toEqual(baseline.scenarios);
      context.expect((current.output?.flows as Array<{ id: string }>).filter(item => item.id.startsWith('FLOW-PAYSDK-'))).toEqual(baseline.flows);
      context.expect(coverage.status).toBe(1);
      context.expect(coverage.output).toEqual(expectedCoverage);
    });
  } finally { fixture.cleanup(); }
});

cliEvidence('SCN-SCENARIO-GATE-005', 'removed-pattern-cli', ['removed-pattern-reported'], async (context, check) => {
  const fixture = fixtureRoot();
  try {
    writeFileSync(join(fixture.root, 'scenario-gate.config.json'), JSON.stringify({ scenarioIdPatterns: ['^TC-PAYSDK-[A-Z0-9-]+$'], flowIdPatterns: ['^FLOW-PAYSDK-[A-Z0-9-]+$'], ownerIdPattern: '^[A-Z][A-Z0-9-]+$' }));
    writeSpec(fixture.root, '### Requirement: EXAMPLE generic\n#### Scenario: SCN-TEST-001 Example\n' + verification());
    enableInventory(fixture.root);
    const result = runGate(fixture.root, ['--inventory']);
    await check('removed-pattern-reported', () => { context.expect(result.status).toBe(1); context.expect(result.output?.issues.join('\n')).toContain('Scenario ID SCN-TEST-001 does not match'); });
  } finally { fixture.cleanup(); }
});
