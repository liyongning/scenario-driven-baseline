import { defineCase } from '../../src/cases/define-case.ts';
import { baseCoverage, runScenarioCli, type MutableCoverageInput } from './helpers.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;

for (const caseKey of ['missing-scenario-case', 'missing-idl-field-case', 'owner-id-without-checkpoint'] as const) {
  const checks = caseKey === 'owner-id-without-checkpoint'
    ? ['missing-binding-rejected']
    : ['fact-derived-inventory', 'missing-binding-rejected', 'scope-cannot-shrink'];
  defineCase({
    ownerId: 'TC-PAYSDK-CORE-015', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'TC-PAYSDK-CORE-015', caseKey, checks }],
  }, async ({ checkpoint, expect }) => {
    const input = structuredClone(baseCoverage()) as MutableCoverageInput;
    if (caseKey === 'missing-scenario-case') {
      input.scenarios[0]!.cases.push({ key: 'new-required-case', kind: 'behavior', requiredIn: ['integration'], checks: ['result'] });
    } else if (caseKey === 'missing-idl-field-case') {
      input.contracts.push({ id: 'idl.method#request#new_field', cases: ['present'], requiredIn: ['integration'] });
    } else {
      input.bindings[0]!.covers[0]!.checks.splice(0);
    }
    const result = runScenarioCli(input);
    const output = JSON.parse(result.stdout);
    if (checks.includes('fact-derived-inventory')) await checkpoint('fact-derived-inventory', () => expect(output.required).toBeGreaterThan(output.passed));
    await checkpoint('missing-binding-rejected', () => {
      expect(result.status).toBe(1);
      expect(output.issues.join('\n')).toMatch(caseKey === 'owner-id-without-checkpoint' ? /has no checkpoints/ : /missing binding/);
    });
    if (checks.includes('scope-cannot-shrink')) await checkpoint('scope-cannot-shrink', () => expect(output.issues).not.toEqual([]));
  }, { fixtureRoot });
}
