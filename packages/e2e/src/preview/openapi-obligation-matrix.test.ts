import type { RestOperation } from '@daqian/template-openapi';
import { expect, test } from 'vitest';
import {
  createOpenApiContract,
  type OpenApiBundle,
  type OpenApiContract,
  type OpenApiOperationContract,
} from '../../../openapi/testing/contract.ts';
import {
  matrixIdentity,
  matrixInput,
  matrixPlan,
  matrixScenario,
  matrixSecuritySchemes,
} from './openapi-obligation-matrix.ts';

test(
  'SCN-OPENAPI-CONTRACT-017 matrix-samples',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-OPENAPI-CONTRACT-017',
        caseId: 'matrix-samples',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-OPENAPI-CONTRACT-017',
            caseKey: 'matrix-samples',
            checks: ['matrix-samples-normalized'],
          },
        ],
      },
    },
  },
  async (context) => {
    const executed: string[] = [];
    const checkpoint = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };
    await checkpoint('matrix-samples-normalized', () => {
      const stringOperation = operation('readCode', '/codes/{id}');
      const objectOperation = operation('readObject', '/objects/{id}');
      const contract = matrixContract({
        readCode: {
          nullable: true,
          allOf: [{ type: 'string', pattern: '^[A-Z]{3}$' }],
        },
        readObject: {
          nullable: true,
          allOf: [
            {
              type: 'object',
              required: ['kind'],
              properties: { kind: { type: 'string', pattern: '^[A-Z]+$' } },
            },
          ],
        },
      });

      const scenarios = matrixScenario(
        { readCode: stringOperation, readObject: objectOperation },
        contract,
      );
      const stringData = bodyData(scenarios.readCode);
      const objectData = bodyData(scenarios.readObject);
      context.expect(stringData).toMatch(/^[A-Z]{3}$/);
      context.expect(objectData).toMatchObject({
        kind: context.expect.stringMatching(/^[A-Z]+$/),
      });
      context.expect(objectData).not.toBeNull();
    });
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);

test('matrix helpers derive nested samples, plans, and responses from the contract', () => {
  const nested: Record<string, unknown> = { type: 'string' };
  for (let index = 0; index < 14; index += 1)
    Object.assign(nested, { type: 'object', properties: { value: nested } });

  const sampleData = {
    type: 'object',
    required: 'invalid',
    properties: {
      enumValue: { enum: ['enum-value'] },
      oneOfValue: { oneOf: [{ type: 'string', example: 'one-of' }] },
      anyOfValue: { anyOf: [{ type: 'boolean' }] },
      arrayValue: { type: 'array', items: { type: 'integer' } },
      numberValue: { type: 'number' },
      patternedValue: { type: 'string', pattern: '^ABC$' },
      unmatchedValue: { type: 'string', pattern: '^NEVER$' },
      nestedNullable: {
        type: 'object',
        properties: { value: { type: 'string', nullable: true } },
      },
      freeform: { type: 'object' },
      unknown: { format: 'custom' },
      deep: nested,
    },
  };
  const sampleOperation = definition('sample', sampleData, {
    requestBody: sampleData,
    parameters: [
      { name: 'id', in: 'path', schema: { type: 'string', pattern: '^fixture-value$' } },
      { name: 'ignored', in: 'query', schema: { type: 'string' } },
      { name: 1, in: 'path', schema: { type: 'string' } },
      { name: 'empty', in: 'path' },
    ],
  });

  const variants = definition(
    'variants',
    { $ref: '#/components/schemas/Variants' },
    { codes: ['FIRST', 'SECOND'] },
  );

  const contract = contractFrom(
    [sampleOperation, variants, definition('noCodes', { type: 'object' })],
    {
      Variants: {
        oneOf: [
          null,
          {
            type: 'object',
            required: ['one', 'two'],
            properties: { one: { type: 'string' }, two: { type: 'string' } },
          },
          {
            type: 'object',
            properties: { one: { type: 'string' } },
          },
          {
            type: 'object',
            required: ['one'],
            properties: { one: { type: 'string' } },
          },
        ],
      },
    },
    { FIRST: 41001, SECOND: 41002 },
  );

  expect(matrixInput(contract, operation('sample', '/samples/{id}'))).toEqual({
    path: { id: 'fixture-value', empty: null },
    body: {
      enumValue: 'enum-value',
      oneOfValue: 'one-of',
      anyOfValue: true,
      arrayValue: [1],
      numberValue: 1,
      patternedValue: 'ABC',
      unmatchedValue: 'fixture-value',
      nestedNullable: { value: null },
      freeform: {},
      unknown: {},
      deep: expect.any(Object),
    },
  });

  const plan = matrixPlan(
    {
      sample: operation('sample', '/samples/{id}'),
      variants: operation('variants', '/variants', ['FIRST', 'SECOND']),
      noCodes: operationWithoutCodes('noCodes', '/no-codes'),
    },
    contract,
  );
  expect(plan.slice(-2)).toEqual([
    { method: 'noCodes', input: {}, timeoutMs: 100 },
    { method: 'noCodes', input: {}, cancel: 'before-send' },
  ]);

  const scenarios = matrixScenario(
    {
      sample: operation('sample', '/samples/{id}'),
      variants: operation('variants', '/variants', ['FIRST', 'SECOND']),
      noCodes: operationWithoutCodes('noCodes', '/no-codes'),
    },
    contract,
  );
  const variantSteps = (
    scenarios.variants as { steps: ReadonlyArray<{ body?: { data?: unknown } }> }
  ).steps.map((step) => step.body?.data);
  expect(variantSteps.slice(0, 3)).toEqual([
    null,
    null,
    { one: 'fixture-value', two: 'fixture-value' },
  ]);
});

test('matrix helpers derive security schemes and reject undeclared operations', () => {
  const secured = definition('secured', { type: 'object' }, { security: [{ HeaderToken: [] }] });
  const anonymous = definition('anonymous', { type: 'object' });
  const contract = contractFrom(
    [secured, anonymous],
    {},
    {},
    {
      HeaderToken: { type: 'apiKey', in: 'header', name: 'X-Token' },
      QueryToken: { type: 'apiKey', in: 'query', name: 'token' },
      MissingName: { type: 'apiKey', in: 'header' },
      HttpBearer: { type: 'http', scheme: 'bearer' },
    },
  );

  expect(matrixSecuritySchemes(contract)).toEqual({
    HeaderToken: { type: 'apiKey', in: 'header', name: 'X-Token' },
  });
  expect(matrixIdentity(contract)).toEqual({ scheme: 'HeaderToken', token: 'fixture-token' });
  expect(matrixIdentity(contract, { anonymous: operation('anonymous', '/anonymous') })).toBe(
    undefined,
  );
  expect(() => matrixInput(contract, operation('missing', '/missing'))).toThrow(
    'OpenAPI 契约中不存在接口 missing',
  );
});

test('schema resolution handles references, unions, allOf intersections, and cycles', () => {
  const requestBody = {
    allOf: [
      null,
      {
        required: ['required', 1],
        description: 'same',
        enum: ['shared', 'first'],
        properties: null,
      },
      {
        required: 'invalid',
        description: 'same',
        enum: ['shared', 'second'],
        properties: { required: { type: 'string' }, optional: { type: 'integer' } },
      },
    ],
  };
  const request = definition('request', requestBody, {
    requestBody,
    parameters: [{ name: 'loop', in: 'path', schema: { $ref: '#/components/schemas/Loop' } }],
  });
  const contract = contractFrom([request], {
    Loop: { $ref: '#/components/schemas/Loop' },
    Union: { anyOf: [{ type: 'string', example: 'union' }] },
  });

  expect(matrixInput(contract, operation('request', '/requests/{loop}'))).toEqual({
    path: { loop: null },
    body: 'shared',
  });

  const union = definition('union', { $ref: '#/components/schemas/Union' });
  const scenarios = matrixScenario(
    { union: operation('union', '/union') },
    contractFrom([union], { Union: { anyOf: [{ type: 'string', example: 'union' }] } }),
  );
  expect(
    (scenarios.union as { steps: ReadonlyArray<{ body?: { data?: unknown } }> }).steps[0]?.body
      ?.data,
  ).toBe('union');
});

test(
  'SCN-OPENAPI-CONTRACT-030 inheritance-matrix',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-OPENAPI-CONTRACT-030',
        caseId: 'inheritance-matrix',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-OPENAPI-CONTRACT-030',
            caseKey: 'inheritance-matrix',
            checks: ['matrix-derives-inherited'],
          },
        ],
      },
    },
  },
  async (context) => {
    const contract = createOpenApiContract(
      {
        info: { title: 'inheritance-matrix' },
        security: [{ PlayerToken: [] }],
        paths: {
          '/games/{game_id}': {
            parameters: [{ name: 'game_id', in: 'path', schema: { type: 'string' } }],
            get: { operationId: 'readGame', responses: {} },
          },
        },
        components: {
          securitySchemes: {
            PlayerToken: { type: 'apiKey', in: 'header', name: 'X-Player-Token' },
          },
        },
      } as unknown as OpenApiBundle,
      () => ({ codeTable: {}, commonCodes: [], operationCodes: {}, issues: [] }),
    );
    const readGame = operation('readGame', '/games/{game_id}');
    const executed: string[] = [];
    const checkpoint = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };

    await checkpoint('matrix-derives-inherited', () => {
      context.expect(matrixInput(contract, readGame)).toEqual({
        path: { game_id: 'fixture-value' },
      });
      context.expect(matrixIdentity(contract, { readGame })).toEqual({
        scheme: 'PlayerToken',
        token: 'fixture-token',
      });
    });
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);

function operation(id: string, path: string, codes: ReadonlyArray<string> = []): RestOperation {
  return { meta: { id, method: 'get', path, codes } } as RestOperation;
}

function operationWithoutCodes(id: string, path: string): RestOperation {
  return { meta: { id, method: 'get', path } } as RestOperation;
}

function definition(
  id: string,
  data: Record<string, unknown>,
  overrides: Partial<OpenApiOperationContract> = {},
): OpenApiOperationContract {
  return {
    id,
    method: 'get',
    path: `/${id}`,
    security: [],
    codes: [],
    implemented: true,
    parameters: [],
    responses: {
      '200': {
        content: {
          'application/json': { schema: envelope(data) },
        },
      },
    },
    codeTable: {},
    componentSchemas: {},
    ...overrides,
  };
}

function contractFrom(
  operations: ReadonlyArray<OpenApiOperationContract>,
  componentSchemas: Readonly<Record<string, unknown>> = {},
  businessCodeTable: Readonly<Record<string, number>> = {},
  securitySchemes: Readonly<Record<string, Record<string, unknown>>> = {},
): OpenApiContract {
  return {
    name: 'matrix',
    operations,
    businessCodeTable,
    commonBusinessCodes: [],
    securitySchemes,
    componentSchemas,
    schemaNormalizers: [],
    bundle: {} as OpenApiContract['bundle'],
  };
}

function envelope(data: Record<string, unknown>) {
  return {
    type: 'object',
    required: ['code', 'message', 'data'],
    properties: {
      code: { type: 'integer' },
      message: { type: 'string' },
      data,
    },
  };
}

function matrixContract(schemas: Readonly<Record<string, unknown>>): OpenApiContract {
  const operations = Object.entries(schemas).map(([id, data]) => ({
    id,
    method: 'get',
    path: `/${id}/{id}`,
    security: [],
    codes: [],
    implemented: true,
    parameters: [],
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: envelope(data as Record<string, unknown>),
          },
        },
      },
    },
    codeTable: {},
    componentSchemas: {},
  }));
  return {
    name: 'matrix',
    operations,
    businessCodeTable: {},
    commonBusinessCodes: [],
    securitySchemes: {},
    componentSchemas: {},
    schemaNormalizers: [],
    bundle: {} as OpenApiContract['bundle'],
  } satisfies OpenApiContract;
}

function bodyData(scenario: unknown): unknown {
  const step = (scenario as { steps?: ReadonlyArray<{ body?: { data?: unknown } }> } | undefined)
    ?.steps?.[0];
  return step?.body?.data;
}
