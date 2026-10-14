import { expect, test } from 'vitest';
import { normalizeContractConventions } from './conventions.ts';

const table = [
  { code: 0, meaning: 'Request succeeded', message: 'OK' },
  { code: 40001, meaning: 'Request is invalid', message: 'INVALID_REQUEST' },
  { code: 40401, meaning: 'Account does not exist', message: 'ACCOUNT_NOT_FOUND' },
];

test('replacement conventions derive names from message and numeric declarations', () => {
  expect(
    normalizeContractConventions({
      paths: {
        '/accounts/{id}': {
          get: { operationId: 'retrieveAccount', 'x-business-codes': [40401] },
        },
        '/health': { get: {} },
      },
      'x-business-code-table': table,
      'x-common-business-codes': [40001, 'INVALID_REQUEST'],
      components: {
        schemas: {
          Envelope: {
            allOf: [
              { properties: { code: { enum: [0, 40001] } } },
              { oneOf: [{ properties: { code: { enum: [40401] } } }] },
            ],
          },
        },
      },
    }),
  ).toEqual({
    codeTable: { OK: 0, INVALID_REQUEST: 40001, ACCOUNT_NOT_FOUND: 40401 },
    commonCodes: ['INVALID_REQUEST', 'INVALID_REQUEST'],
    operationCodes: { retrieveAccount: ['ACCOUNT_NOT_FOUND'] },
    issues: [],
  });
});

test('replacement conventions reject malformed, duplicate, and unknown declarations', () => {
  expect(
    normalizeContractConventions({
      paths: {
        '/accounts': {
          get: { operationId: 'retrieveAccount', 'x-business-codes': ['UNKNOWN', 50001] },
        },
      },
      'x-business-code-table': [
        { code: 0.5, meaning: 'bad', message: 'BAD' },
        { code: 0, meaning: 'ok', message: 'OK' },
        { code: 0, meaning: 'duplicate', message: 'DUP' },
        { meaning: 'missing', message: 'MISSING' },
        { code: 40001, message: 'MISSING_MEANING' },
      ],
      'x-common-business-codes': 40001,
      components: { schemas: { Envelope: { properties: { code: { enum: [1] } } } } },
    }),
  ).toMatchObject({
    codeTable: { DUP: 0 },
    commonCodes: [],
    issues: [
      'x-business-code-table contains duplicate codes',
      'envelope code enum does not equal x-business-code-table codes',
      'retrieveAccount UNKNOWN does not exist in x-business-code-table',
      'retrieveAccount 50001 does not exist in x-business-code-table',
    ],
  });
});

test('replacement conventions tolerate missing and malformed containers', () => {
  expect(normalizeContractConventions(null)).toEqual({
    codeTable: {},
    commonCodes: [],
    operationCodes: {},
    issues: [],
  });

  expect(
    normalizeContractConventions({
      paths: {
        '/malformed': null,
        '/scalar-operation': { get: 1 },
        '/valid': { post: { operationId: 'valid' } },
      },
      'x-business-code-table': 'not-an-array',
      'x-common-business-codes': 40001,
      components: {
        schemas: {
          Envelope: null,
          Other: {
            properties: 1,
            allOf: [null, { properties: { code: { enum: [0, 'ignored'] } } }],
            oneOf: [null],
          },
        },
      },
    }),
  ).toMatchObject({
    codeTable: {},
    commonCodes: [],
    operationCodes: { valid: [] },
    issues: ['envelope code enum does not equal x-business-code-table codes'],
  });
});
