import { expect, test } from 'vitest';
import { businessCodeName, createOutcomeForCode } from './outcomes';

test('create outcome table covers every generated code and fallback lookup', () => {
  expect(createOutcomeForCode('OK')).toBe('success');
  expect(createOutcomeForCode('INVALID_REQUEST')).toBe('invalid-request');
  expect(createOutcomeForCode('TRADE_CONFLICT')).toBe('trade-conflict');
  expect(createOutcomeForCode('AMOUNT_LIMIT_EXCEEDED')).toBe('amount-limit-exceeded');
  expect(businessCodeName(40001)).toBe('INVALID_REQUEST');
  expect(businessCodeName(42201)).toBe('AMOUNT_LIMIT_EXCEEDED');
  expect(businessCodeName(99999)).toBeUndefined();
});
