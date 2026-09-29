import { expect, test } from 'vitest';
import { evaluateCoverage } from '../../../../scripts/check-scenarios.ts';
import { baseCoverage, type MutableCoverageInput } from './helpers.ts';

test('GATE-004 rejects bindings that reference an unregistered FLOW', () => {
  const input = structuredClone(baseCoverage()) as MutableCoverageInput;
  input.bindings[0]!.flowId = 'FLOW-SCENARIO-GATE-999';
  const result = evaluateCoverage(input);
  expect(result.issues).toContain('integration/normal: unknown FLOW reference FLOW-SCENARIO-GATE-999');
});
