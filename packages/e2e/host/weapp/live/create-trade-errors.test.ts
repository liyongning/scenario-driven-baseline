import { expect, test } from 'vitest';
import { createTradeErrorCodes, mapCreateTradeCode } from './create-trade-errors';
import expected from '../../../tests/fixtures/TC-PAYSDK-CORE-023/wire-error-codes.json';

test('CreateTrade errors preserve the reviewed Go codes and explicit local mapping', () => {
  expect(Object.fromEntries(Object.entries(createTradeErrorCodes).map(([name, code]) => [name, code.toString()]))).toEqual(expected);
  expect(createTradeErrorCodes).toEqual({
    ErrInfraTradeCreateTradeInvalidParameter: 10100801001010n,
    ErrInfraTradeCreateTradeUnauthorized: 10100801001020n,
    ErrInfraTradeCreateTradeConflict: 10100801001040n,
    ErrInfraTradeCreateTradeUnavailable: 10100801001070n,
  });
  expect(mapCreateTradeCode(10100801001020n)).toBe('auth');
  expect(mapCreateTradeCode(20200002001020n)).toBe('auth');
  expect(mapCreateTradeCode(10100801001010n)).toBe('invalid_input');
  expect(mapCreateTradeCode(20200002001010n)).toBe('invalid_input');
  expect(mapCreateTradeCode(10100801001040n)).toBe('conflict');
  expect(mapCreateTradeCode(10100801001070n)).toBe('unavailable');
  expect(mapCreateTradeCode(20200002001030n)).toBe('unavailable');
  expect(mapCreateTradeCode(999n)).toBe('unavailable');
});
