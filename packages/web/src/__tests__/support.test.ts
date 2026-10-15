import { expect, test } from 'vitest';
import {
  optionalFlowBinding,
  recordScenarioFlow,
  scenarioFlowEvidence,
  validateScenarioExecution,
  type CaseBinding,
} from './support';

test('scenario helpers expose optional FLOW metadata and reject missing evidence', () => {
  expect(optionalFlowBinding()).toEqual({});
  expect(optionalFlowBinding('FLOW-WEB-EXAMPLE-001')).toEqual({
    flowId: 'FLOW-WEB-EXAMPLE-001',
  });
  expect(optionalFlowBinding(undefined, 'normal')).toEqual({ flowCase: 'normal' });
  expect(optionalFlowBinding('FLOW-WEB-EXAMPLE-001', 'normal')).toEqual({
    flowId: 'FLOW-WEB-EXAMPLE-001',
    flowCase: 'normal',
  });

  const complete: CaseBinding = {
    ownerId: 'SCN-WEB-EXAMPLE-006',
    caseId: 'flow',
    checks: ['continuous'],
    flowId: 'FLOW-WEB-EXAMPLE-001',
    flowCase: 'normal',
  };
  expect(scenarioFlowEvidence(complete, 'continuity', ['open', 'submit'])).toContain(
    'FLOW-WEB-EXAMPLE-001',
  );
  const missingFlowId: CaseBinding = {
    ownerId: 'SCN-WEB-EXAMPLE-006',
    caseId: 'flow',
    checks: ['continuous'],
    flowCase: 'normal',
  };
  const missingFlowCase: CaseBinding = {
    ownerId: 'SCN-WEB-EXAMPLE-006',
    caseId: 'flow',
    checks: ['continuous'],
    flowId: 'FLOW-WEB-EXAMPLE-001',
  };
  expect(() => scenarioFlowEvidence(missingFlowId, 'continuity', [])).toThrow(/flow binding/);
  expect(() => scenarioFlowEvidence(missingFlowCase, 'continuity', [])).toThrow(/flow binding/);

  expect(() => validateScenarioExecution('case', ['check'], 0, new Set())).toThrow(/no assertions/);
  expect(() => validateScenarioExecution('case', ['check'], 1, new Set())).toThrow(
    /did not execute checkpoint check/,
  );
  expect(validateScenarioExecution('case', ['check'], 1, new Set(['check']))).toBeUndefined();

  const annotations: string[] = [];
  return recordScenarioFlow(
    {
      async annotate(value: string) {
        annotations.push(String(value));
      },
    } as never,
    complete,
    'continuity',
    ['open'],
  ).then(() => {
    expect(annotations).toEqual([
      JSON.stringify({
        id: 'FLOW-WEB-EXAMPLE-001',
        caseKey: 'normal',
        continuityId: 'continuity',
        stages: ['open'],
      }),
    ]);
  });
});
