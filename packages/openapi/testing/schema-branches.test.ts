import Ajv2020 from 'ajv/dist/2020.js';
import { afterEach, expect, test, vi } from 'vitest';
import type { OpenApiOperationContract } from './contract.ts';
import { createResponseValidator, validateResponse } from './schema.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

function operation(id: string, schema?: unknown): OpenApiOperationContract {
  return {
    id,
    method: 'get',
    path: `/${id}`,
    security: [],
    codes: [],
    implemented: true,
    parameters: [],
    codeTable: {},
    componentSchemas: {},
    responses: schema ? { '200': { content: { 'application/json': { schema } } } } : {},
  };
}

test('OpenAPI schema validator keeps uncached missing schemas when hooks are supplied', () => {
  const validate = createResponseValidator(operation('missingHooked'), [() => ({})]);
  expect(validate({}, 404)).toEqual(['missingHooked: HTTP 404 未声明响应 schema']);
});

test('OpenAPI schema validator covers nested additional properties and fallback messages', () => {
  const strict = operation('strict', {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'message', 'data'],
    properties: {
      code: { type: 'integer' },
      message: { type: 'string' },
      data: { type: 'object', additionalProperties: false, properties: { known: {} } },
    },
  });
  expect(
    validateResponse(
      strict,
      { code: 0, message: 'ok', data: { known: true, extra: true } },
      200,
    ).join('\n'),
  ).toContain('extra');
  expect(
    validateResponse(strict, { code: 0, message: 'ok', data: 'not-object' }, 200).join('\n'),
  ).toContain('must be object');

  const compile = vi.spyOn(Ajv2020.prototype, 'compile').mockReturnValue(
    Object.assign(() => false, {
      errors: [{ instancePath: '/data', params: {}, message: undefined }],
    }) as never,
  );
  expect(
    validateResponse(
      operation('fallbackMessage', { type: 'object' }),
      {
        code: 0,
        message: 'ok',
        data: {},
      },
      200,
    ).join('\n'),
  ).toContain('不符合契约');
  compile.mockRestore();

  vi.spyOn(Ajv2020.prototype, 'compile').mockReturnValue(
    Object.assign(() => false, { errors: undefined }) as never,
  );
  expect(
    validateResponse(
      operation('undefinedErrors', { type: 'object' }),
      {
        code: 0,
        message: 'ok',
        data: {},
      },
      200,
    ),
  ).toEqual([]);
});
