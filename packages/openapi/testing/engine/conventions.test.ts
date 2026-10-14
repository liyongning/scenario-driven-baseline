import { expect, test } from 'vitest';
import { normalizeContractConventions } from './conventions.ts';

test('引擎侧约定模块支持数组码表并生成稳定码名', () => {
  expect(
    normalizeContractConventions({
      paths: {},
      'x-business-code-table': [
        { code: 0, meaning: 'OK' },
        { code: 40001, meaning: '通用参数错误' },
      ],
      'x-common-business-codes': [40001],
      components: {
        schemas: {
          Envelope: { properties: { code: { enum: [0, 40001] } } },
        },
      },
    }),
  ).toMatchObject({
    codeTable: { OK: 0, CODE_40001: 40001 },
    commonCodes: ['CODE_40001'],
    issues: [],
  });
});

test('数组码表跳过缺码项并用含义生成码名回退', () => {
  expect(
    normalizeContractConventions({
      paths: {},
      'x-business-code-table': [
        { meaning: 'OK' },
        { code: 40001.5, meaning: 'IGNORED' },
        { code: 42201, meaning: 'AMOUNT_LIMIT_EXCEEDED' },
        { code: 42202, meaning: '金额超限' },
      ],
      components: { schemas: { Envelope: { properties: { code: { enum: [42201, 42202] } } } } },
    }),
  ).toMatchObject({
    codeTable: { AMOUNT_LIMIT_EXCEEDED: 42201, CODE_42202: 42202 },
    issues: [],
  });
});

test('约定模块拒绝未登记码并跳过畸形容器', () => {
  const normalized = normalizeContractConventions({
    components: [],
    paths: {
      '/malformed': null,
      '/without-id': {
        get: { 'x-business-codes': ['CUSTOM'] },
      },
      '/unknown': {
        get: { operationId: 'unknown', 'x-business-codes': ['CUSTOM', 'MISSING', 999] },
      },
    },
    'x-business-code-table': [
      { name: 'CUSTOM', code: 1 },
      { code: 2, meaning: 'MEANING_NAME' },
      { code: 3 },
      { code: 4.5, meaning: 'IGNORED' },
      'invalid',
    ],
    'x-common-business-codes': ['CUSTOM', 'MISSING', 999],
  });

  expect(normalized.codeTable).toEqual({
    CUSTOM: 1,
    MEANING_NAME: 2,
    CODE_3: 3,
  });
  expect(normalized.operationCodes).toEqual({ unknown: ['CUSTOM'] });
  expect(normalized.issues).toEqual([
    'envelope code enum [] does not equal x-business-code-table [1,2,3]',
    'top-level MISSING 不在 x-business-code-table 中',
    'top-level 999 不在 x-business-code-table 中',
    'unknown MISSING 不在 x-business-code-table 中',
    'unknown 999 不在 x-business-code-table 中',
  ]);
});

test('约定模块对非对象根和缺失容器返回空约定', () => {
  expect(normalizeContractConventions(null)).toEqual({
    codeTable: {},
    commonCodes: [],
    operationCodes: {},
    issues: [],
  });
  expect(
    normalizeContractConventions({
      components: {},
      paths: {},
      'x-business-code-table': { VALID: 1, INVALID: 'not-a-number' },
    }).codeTable,
  ).toEqual({ VALID: 1 });

  expect(
    normalizeContractConventions({
      components: { schemas: { Envelope: null } },
      paths: {},
      'x-business-code-table': { OK: 0 },
    }).issues.join('\n'),
  ).toContain('envelope code enum []');

  expect(
    normalizeContractConventions({
      components: {
        schemas: {
          Envelope: { properties: [] },
          Other: { properties: { code: { enum: [0] } } },
        },
      },
      paths: {},
      'x-business-code-table': { OK: 0 },
    }).codeTable,
  ).toEqual({ OK: 0 });

  expect(
    normalizeContractConventions({
      components: { schemas: { Envelope: { properties: { code: { enum: [1] } } } } },
      paths: {},
      'x-business-code-table': [
        { name: 'DUPLICATE', code: 1 },
        { name: 'DUPLICATE', code: 2 },
      ],
    }).issues,
  ).toContain('x-business-code-table 存在重复码值或码名');
});
