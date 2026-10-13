import { expect, test } from 'vitest';
import { businessCodeName, createOutcomeForCode } from './outcomes';

test('create outcome table covers every generated code and fallback lookup', () => {
  expect(createOutcomeForCode('OK')).toBe('success');
  expect(createOutcomeForCode('INVALID_REQUEST')).toBe('invalid-request');
  expect(createOutcomeForCode('TRADE_CONFLICT')).toBe('trade-conflict');
  expect(createOutcomeForCode('TRADE_NOT_FOUND')).toBe('trade-not-found');
  expect(businessCodeName(40001)).toBe('INVALID_REQUEST');
  expect(businessCodeName(99999)).toBeUndefined();
});
