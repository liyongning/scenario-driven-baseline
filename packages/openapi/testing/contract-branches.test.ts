import { expect, test, vi } from 'vitest';

const bundle = vi.hoisted(() => ({
  info: { title: 'synthetic' },
  paths: {
    '/valid': {
      post: {
        operationId: 'valid',
        parameters: [null, { in: 'path', name: 'id' }],
        'x-business-codes': ['OWN', 7],
        security: [{ accessToken: [] }],
        requestBody: {
          content: {
            'application/json': { schema: { properties: { name: { type: 'string' } } } },
          },
        },
        responses: {
          '200': {
            content: {
              'application/json': { schema: { type: 'object', properties: { ok: {} } } },
            },
          },
          '400': null,
        },
        'x-implemented': false,
      },
      noId: {},
      notObject: 42,
    },
    '/minimal': {
      get: { operationId: 'minimal' },
    },
  },
  components: {},
  'x-business-code-table': { OWN: 7 },
}));

vi.mock('node:fs', () => ({
  readFileSync: () => JSON.stringify(bundle),
}));

const {
  businessCodeTable,
  commonBusinessCodes,
  componentSchemas,
  contractName,
  createOpenApiContract,
  operations,
  responseSchema,
  schemaProperties,
  securitySchemes,
} = await import('./contract.ts');

test('OpenAPI bundle parsing keeps optional fields and skips malformed entries', () => {
  expect(contractName).toBe('synthetic');
  expect(businessCodeTable).toEqual({ OWN: 7 });
  expect(commonBusinessCodes).toEqual([]);
  expect(securitySchemes).toEqual({});
  expect(componentSchemas).toEqual({});
  expect(operations.map((operation) => operation.id)).toEqual(['valid', 'minimal']);

  const valid = operations[0]!;
  expect(valid).toMatchObject({
    parameters: [{ in: 'path', name: 'id' }],
    codes: ['OWN'],
    implemented: false,
    security: [{ accessToken: [] }],
  });
  expect(valid.requestBody).toBeDefined();
  expect(Object.keys(valid.responses)).toEqual(['200']);
  expect(responseSchema(valid, 200)).toBeDefined();
  expect(responseSchema(valid, 400)).toBeUndefined();
  expect(responseSchema(operations[1]!, 200)).toBeUndefined();
  expect(schemaProperties(valid.requestBody)).toEqual({ name: { type: 'string' } });
  expect(schemaProperties(1)).toEqual({});
});

test('OpenAPI contract construction accepts a conventions module without operation codes', () => {
  const contract = createOpenApiContract(
    {
      info: { title: 'sparse' },
      paths: { '/minimal': { get: { operationId: 'minimal' } } },
      components: {},
    },
    () => ({ codeTable: {}, commonCodes: [], operationCodes: {}, issues: [] }),
  );
  expect(contract.operations[0]?.codes).toEqual([]);
});
