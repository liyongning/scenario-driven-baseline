import { expect, test } from 'vitest';
import { createOpenApiContract, type OpenApiBundle } from './contract.ts';
import { normalizeStandardContractConventions } from './conventions.ts';
import { checkOpenApiFixture } from './fixture-check.ts';

const valid = {
  code: 0,
  message: 'ok',
  data: { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1 },
};

function json(body: unknown) {
  return { 'case.json': JSON.stringify(body) };
}

test('Fixture checker walks arrays and reports unresolved computed and nested paths', () => {
  const issues = checkOpenApiFixture(
    {
      envelopes: {
        '$.list[0]': 'createTrade',
        '$["hyphen-key"]': 'createTrade',
        'not-a-path': 'createTrade',
        '$.list[0].missing.value': 'createTrade',
      },
    },
    json({ list: [valid], 'hyphen-key': valid }),
  );

  expect(issues.join('\n')).toContain('$["hyphen-key"] 登记路径不存在');
  expect(issues.join('\n')).toContain('not-a-path 登记路径不存在');
  expect(issues.join('\n')).toContain('$.list[0].missing.value 登记路径不存在');
});

test('Fixture checker ignores malformed claims and validates document-local claims', () => {
  expect(
    checkOpenApiFixture(
      {
        envelopes: {
          '$.invalid': 42,
          '$.other': { contract: 'createTrade', malformed: { reason: 1 } },
        },
      },
      json({ other: valid }),
    ).join('\n'),
  ).toContain('malformed reason 不得为空');

  expect(
    checkOpenApiFixture(
      {
        envelopes: {
          '$.plain': { contract: 'createTrade' },
          '$.reason': { contract: 'createTrade', malformed: { reason: 'counter-proof' } },
        },
      },
      json({ plain: valid, reason: { code: 999, message: 'invalid', data: {} } }),
    ),
  ).toEqual([]);

  expect(checkOpenApiFixture({}, json({ contract: 'createTrade', body: valid }))).toEqual([]);
  expect(checkOpenApiFixture(null, json(42))).toEqual([]);
  expect(checkOpenApiFixture({}, { manifest: {}, note: 'not json', data: 1 })).toEqual([]);
  expect(checkOpenApiFixture({}, { 'broken.json': '{' })).toEqual([]);
});

test('Fixture checker accepts manifest malformed claims and rejects unknown contracts', () => {
  const manifestMalformed = checkOpenApiFixture(
    {
      contract: 'createTrade',
      malformed: { reason: 1 },
      body: true,
    },
    json({ body: valid }),
  );
  expect(manifestMalformed.join('\n')).toContain('malformed reason 不得为空');

  expect(
    checkOpenApiFixture(
      { envelopes: { '$.body': 'unknownOperation' } },
      json({ body: valid }),
    ).join('\n'),
  ).toContain('未知接口 unknownOperation');
});

test('Fixture checker applies the selected contract schema normalizers', () => {
  const bundle = {
    info: { title: 'hooked-fixture' },
    paths: {
      '/items': {
        get: {
          operationId: 'readItem',
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['code', 'message', 'data'],
                    properties: {
                      code: { type: 'integer' },
                      message: { type: 'string' },
                      data: {
                        type: 'object',
                        required: ['note'],
                        properties: { note: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: { schemas: {} },
  } as unknown as OpenApiBundle;
  const withoutHook = createOpenApiContract(bundle, normalizeStandardContractConventions);
  const withHook = createOpenApiContract(bundle, normalizeStandardContractConventions, [
    (schema: unknown) => {
      const value = schema as {
        properties?: { data?: { properties?: { note?: Record<string, unknown> } } };
      };
      const note = value.properties?.data?.properties?.note;
      if (!note || note.type !== 'string') return schema;
      return {
        ...value,
        properties: {
          ...value.properties,
          data: {
            ...value.properties?.data,
            properties: {
              ...value.properties?.data?.properties,
              note: { ...note, type: ['string', 'null'] },
            },
          },
        },
      };
    },
  ]);
  const files = json({ code: 0, message: 'ok', data: { note: null } });

  expect(checkOpenApiFixture({ contract: 'readItem' }, files, withoutHook).join('\n')).toContain(
    'note',
  );
  expect(checkOpenApiFixture({ contract: 'readItem' }, files, withHook)).toEqual([]);
});
