import { expect, test } from 'vitest';
import { normalizeContractConventions } from './conventions.ts';

test('产品侧约定模块规范化为码名并保留问题列表', () => {
  expect(
    normalizeContractConventions({
      paths: {},
      'x-business-code-table': { OK: 0, INVALID_REQUEST: 40001 },
      'x-common-business-codes': ['INVALID_REQUEST'],
      components: {
        schemas: {
          Envelope: { properties: { code: { enum: [0, 40001] } } },
        },
      },
    }),
  ).toMatchObject({
    codeTable: { OK: 0, INVALID_REQUEST: 40001 },
    commonCodes: ['INVALID_REQUEST'],
    issues: [],
  });
});
