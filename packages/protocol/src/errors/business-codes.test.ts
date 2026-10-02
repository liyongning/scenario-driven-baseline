import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as protocol from '../index';
const expected = JSON.parse(readFileSync('packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/idl-errors.json', 'utf8'));

test('精确错误码命中只读 IDL 描述；未知值不能按位段或 canonical 猜测身份', () => {
  expect(protocol).toHaveProperty('getBusinessError');
  for (const entry of expected) {
    const actual = protocol.getBusinessError(BigInt(entry.statusCode));
    expect(actual).toMatchObject({ statusCode: BigInt(entry.statusCode), bizCodeName: entry.bizCodeName, retryable: entry.retryable });
    expect(Object.isFrozen(actual)).toBe(true);
    expect(() => Object.assign(actual!, { retryable: !entry.retryable })).toThrow(TypeError);
  }
  expect(protocol.getBusinessError(99999999999999n)).toBeUndefined();
  expect(protocol.getBusinessError(0n)).toBeUndefined();
  expect(Object.isFrozen(protocol.businessErrors)).toBe(true);
  expect(() => Object.assign(protocol.businessErrors, { injected: {} })).toThrow(TypeError);
});
