import { expect, test, type TestContext } from 'vitest';
import {
  componentSchemas,
  contract,
  mergeObjectSchema,
  operationById,
  resolveSchemaReference,
  schemaProperties,
  schemaRequired,
  type OpenApiOperationContract,
} from './contract';
import {
  createResponseValidator,
  normalizeSchema,
  validateResponse,
  type NormalizeHook,
} from './schema';

type Checkpoint = (name: string, assertion: () => void | Promise<void>) => Promise<void>;

function evidence(
  ownerId: string,
  caseId: string,
  checks: string[],
  body: (context: TestContext, checkpoint: Checkpoint) => Promise<void>,
) {
  test(
    `${ownerId} ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId,
          caseId,
          fixtureCase: null,
          environment: 'openapi-unit',
          covers: [{ id: ownerId, caseKey: caseId, checks }],
        },
      },
    },
    async (context) => {
      const executed: string[] = [];
      await body(context, async (checkpoint, assertion) => {
        await assertion();
        executed.push(checkpoint);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

function operation(
  schema: unknown,
  codes: string[] = [],
  id = 'synthetic',
): OpenApiOperationContract {
  return {
    id,
    method: 'post',
    path: '/synthetic',
    security: [],
    codes,
    implemented: true,
    parameters: [],
    codeTable: {},
    componentSchemas: {},
    responses: {
      '200': { content: { 'application/json': { schema } } },
      '202': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['code', 'message', 'data'],
              properties: {
                code: { type: 'integer', enum: [0] },
                message: { type: 'string' },
                data: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  };
}

evidence(
  'SCN-OPENAPI-CONTRACT-022',
  'normalization-hooks',
  ['nullable-normalized', 'exclusive-normalized', 'hook-extensible', 'example-needs-no-hook'],
  async (context, checkpoint) => {
    const nullableAndExclusive = operation({
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'data'],
      properties: {
        code: { type: 'integer', enum: [0] },
        message: { type: 'string' },
        data: { type: 'integer', minimum: 1, exclusiveMinimum: true, nullable: true },
      },
    });
    await checkpoint('nullable-normalized', () =>
      context
        .expect(validateResponse(nullableAndExclusive, { code: 0, message: 'ok', data: null }, 200))
        .toEqual([]),
    );
    await checkpoint('exclusive-normalized', () => {
      context
        .expect(
          validateResponse(nullableAndExclusive, { code: 0, message: 'ok', data: 1 }, 200).join(
            '\n',
          ),
        )
        .toContain('data');
      context
        .expect(validateResponse(nullableAndExclusive, { code: 0, message: 'ok', data: 2 }, 200))
        .toEqual([]);
    });
    await checkpoint('hook-extensible', () => {
      const hook: NormalizeHook = (schema) => {
        const value = structuredClone(schema) as Record<string, unknown>;
        const properties = value.properties as Record<string, Record<string, unknown>>;
        properties.data!.maximum = 1;
        return value;
      };
      const validator = createResponseValidator(nullableAndExclusive, [hook]);
      context
        .expect(validator({ code: 0, message: 'ok', data: 2 }, 200).join('\n'))
        .toContain('<= 1');
    });
    await checkpoint('example-needs-no-hook', () =>
      context
        .expect(
          validateResponse(
            operationById('createTrade')!,
            {
              code: 0,
              message: 'ok',
              data: { trade_no: 'T', status: 'CREATED', amount: 1, merchant_id: 1 },
            },
            200,
          ),
        )
        .toEqual([]),
    );
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-023',
  'strict-shape-validator',
  [
    'conforming-accepted',
    'extra-field-rejected',
    'type-mismatch-rejected',
    'status-aware',
    'no-loose-claim',
  ],
  async (context, checkpoint) => {
    const createTrade = operationById('createTrade')!;
    const valid = {
      code: 0,
      message: 'ok',
      data: { trade_no: 'T', status: 'CREATED', amount: 1, merchant_id: 1 },
    };
    await checkpoint('conforming-accepted', () =>
      context.expect(validateResponse(createTrade, valid, 200)).toEqual([]),
    );
    await checkpoint('extra-field-rejected', () => {
      context
        .expect(validateResponse(createTrade, { ...valid, extra: true }, 200).join('\n'))
        .toContain('extra');
      context
        .expect(
          validateResponse(
            createTrade,
            { ...valid, data: { ...valid.data, extra: true } },
            200,
          ).join('\n'),
        )
        .toContain('extra');
    });
    await checkpoint('type-mismatch-rejected', () =>
      context
        .expect(
          validateResponse(
            createTrade,
            { ...valid, data: { ...valid.data, amount: '1' } },
            200,
          ).join('\n'),
        )
        .toContain('amount'),
    );
    await checkpoint('status-aware', () => {
      context
        .expect(validateResponse(operation({ type: 'object' }), {}, 202).join('\n'))
        .toContain('data');
      context
        .expect(validateResponse(operation({ type: 'object' }), {}, 404).join('\n'))
        .toContain('HTTP 404');
    });
    await checkpoint('no-loose-claim', () => {
      context
        .expect(validateResponse(createTrade, null, 200).join('\n'))
        .toContain('响应不是信封对象');
      context.expect(Object.keys(createTrade)).not.toContain('additionalProperties');
    });
  },
);

test('normalization covers OAS 3.0 schema shapes', () => {
  expect(normalizeSchema([{ nullable: true, type: 'string' }])).toEqual([
    { type: ['string', 'null'] },
  ]);
  expect(normalizeSchema('value')).toBe('value');
  expect(normalizeSchema({ $ref: '#/components/schemas/Sample' })).toEqual({
    $ref: '#/$defs/Sample',
  });
  expect(
    normalizeSchema({
      minimum: 1,
      maximum: 9,
      exclusiveMinimum: true,
      exclusiveMaximum: true,
    }),
  ).toEqual({ exclusiveMinimum: 1, exclusiveMaximum: 9 });
  expect(normalizeSchema({ nullable: true, enum: ['x'] })).toEqual({ enum: ['x', null] });
  expect(normalizeSchema({ nullable: true, oneOf: [{ type: 'string' }] })).toEqual({
    oneOf: [{ type: 'string' }, { type: 'null' }],
  });
  expect(normalizeSchema({ nullable: true, anyOf: [{ type: 'string' }] })).toEqual({
    anyOf: [{ type: 'string' }, { type: 'null' }],
  });
  expect(
    normalizeSchema({
      nullable: true,
      type: 'object',
      oneOf: [{ type: 'object', required: ['value'], properties: { value: { type: 'string' } } }],
    }),
  ).toEqual({
    type: ['object', 'null'],
    oneOf: [
      { type: 'object', required: ['value'], properties: { value: { type: 'string' } } },
      { type: 'null' },
    ],
  });
  expect(normalizeSchema({ nullable: true, type: ['string', 'null'] })).toEqual({
    type: ['string', 'null'],
  });
  expect(normalizeSchema({ nullable: true, type: ['string'] })).toEqual({
    type: ['string', 'null'],
  });
  const nullableUnion = operation(
    {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'data'],
      properties: {
        code: { type: 'integer', enum: [0] },
        message: { type: 'string' },
        data: {
          nullable: true,
          type: 'object',
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['value'],
              properties: { value: { type: 'string' } },
            },
          ],
        },
      },
    },
    [],
    'nullableUnion',
  );
  expect(validateResponse(nullableUnion, { code: 0, message: 'ok', data: null }, 200)).toEqual([]);
  expect(
    validateResponse(nullableUnion, { code: 0, message: 'ok', data: {} }, 200).join('\n'),
  ).toContain('required');
});

test('contract helpers resolve references and merge allOf without changing source', () => {
  expect(contract.info.title).toBe('trade.v1');
  expect(Object.keys(componentSchemas).length).toBeGreaterThan(0);
  expect(resolveSchemaReference('#/components/schemas/Envelope')).toBeDefined();
  expect(resolveSchemaReference(42)).toBeUndefined();
  expect(resolveSchemaReference('#/components/schemas/Missing')).toBeUndefined();
  expect(schemaProperties(null)).toEqual({});
  expect(schemaRequired(null)).toEqual([]);
  expect(
    mergeObjectSchema({
      allOf: [
        {
          required: ['one'],
          properties: { one: { type: 'string' } },
        },
        42,
        { $ref: '#/components/schemas/Envelope' },
      ],
    }),
  ).toMatchObject({
    required: expect.arrayContaining(['one', 'code', 'message']),
    properties: expect.objectContaining({ one: { type: 'string' }, code: expect.anything() }),
  });
});
