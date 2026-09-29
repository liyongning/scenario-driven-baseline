import { describe, expect, it } from 'vitest';
import { validateCaseBinding } from './define-case.ts';

const valid = {
  ownerId: 'TC-PAYSDK-CONTRACT-023', caseId: 'presence-omitted', environment: 'integration' as const,
  fixtureCase: 'omitted', covers: [{ id: 'TC-PAYSDK-CONTRACT-023', caseKey: 'omitted', checks: ['absence'] }],
};

describe('validateCaseBinding', () => {
  it('accepts a concrete owner/case/checkpoint/environment/fixture binding', () => {
    expect(validateCaseBinding(valid)).toEqual([]);
  });

  it('rejects file-only IDs, empty checks, and partial FLOW bindings', () => {
    expect(validateCaseBinding({ ...valid, ownerId: 'invalid' })).toContain('ownerId is invalid');
    expect(validateCaseBinding({ ...valid, caseId: '' })).toContain('caseId must not be empty');
    expect(validateCaseBinding({ ...valid, fixtureCase: '' })).toContain('fixtureCase must not be empty');
    expect(validateCaseBinding({ ...valid, covers: [] })).toContain('covers must contain at least one concrete case binding');
    expect(validateCaseBinding({ ...valid, covers: [{ id: '', caseKey: '', checks: ['x'] }] })).toContain('covers[0] must identify an id and caseKey');
    expect(validateCaseBinding({ ...valid, covers: [{ id: valid.ownerId, caseKey: 'omitted', checks: [] }] })).toContain('covers[0].checks must not be empty');
    expect(validateCaseBinding({ ...valid, flowId: 'FLOW-PAYSDK-008' })).toContain('flowId and flowCase must be provided together');
    expect(validateCaseBinding({ ...valid, flowCase: 'normal' })).toContain('flowId and flowCase must be provided together');
  });

  it('accepts generic uppercase owner IDs for non-payment scenarios', () => {
    expect(validateCaseBinding({ ...valid, ownerId: 'SCN-TEMPLATE-EXAMPLE-001' })).toEqual([]);
  });
});
