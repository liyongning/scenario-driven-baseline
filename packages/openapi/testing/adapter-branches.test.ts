import { afterEach, expect, test } from 'vitest';
import adapter from './adapter.ts';
import { contractName, operations, type OpenApiOperationContract } from './contract.ts';

const added: OpenApiOperationContract[] = [];
const mutableOperations = operations as unknown as OpenApiOperationContract[];

afterEach(() => {
  while (added.length > 0) {
    const operation = added.pop()!;
    const index = mutableOperations.indexOf(operation);
    if (index >= 0) mutableOperations.splice(index, 1);
  }
});

function addOperation(operation: OpenApiOperationContract) {
  added.push(operation);
  mutableOperations.push(operation);
  return operation;
}

test('OpenAPI adapter derives pending presence and security-specific obligations', () => {
  const operation = addOperation({
    id: 'pendingPresence',
    method: 'post',
    path: '/pending',
    security: [{ accessToken: [] }],
    codes: [],
    implemented: true,
    parameters: [{ in: 'path', name: 'id' }],
    requestBody: { properties: { name: { type: 'string' } } },
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
                  oneOf: [
                    {
                      type: 'object',
                      required: ['a'],
                      properties: { a: { type: 'string' } },
                    },
                    {
                      type: 'object',
                      required: ['b'],
                      properties: { b: { type: 'string' } },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });
  const issues: string[] = [];
  const result = adapter.deriveObligations({
    operation: {
      key: operation.id,
      prefix: contractName,
      methodName: operation.id,
      httpMethod: operation.method,
      path: operation.path,
      requestFields: {
        'path.id': { cases: ['encoded'], authority: 'fixture' },
        'body.name': { cases: ['mapped-value'], authority: 'fixture' },
        'header.content-type': { cases: ['content-type'], authority: 'fixture' },
      },
      position: 'fixture.ts:1',
      meta: operation,
    },
    checker: undefined,
    program: undefined,
    protocolSrc: 'packages/openapi/src',
    requiredIn: ['integration'],
    integrationOnly: ['integration'],
    issues,
  });

  expect(issues.join('\n')).toContain('presence data 联合类型无法判定');
  expect(result.obligations).toContainEqual({
    id: `${contractName}.pendingPresence#identity#$`,
    cases: ['header:accessToken'],
    requiredIn: ['integration'],
  });
});

test('OpenAPI adapter rejects unknown operations and resolves validator input shapes', () => {
  const issues: string[] = [];
  expect(
    adapter.deriveObligations({
      operation: {
        key: 'missing',
        prefix: contractName,
        methodName: 'missing',
        httpMethod: 'get',
        path: '/missing',
        requestFields: {},
        position: 'fixture.ts:1',
        meta: {},
      },
      checker: undefined,
      program: undefined,
      protocolSrc: 'packages/openapi/src',
      requiredIn: ['integration'],
      integrationOnly: ['integration'],
      issues,
    }).obligations,
  ).toEqual([]);
  expect(issues.join('\n')).toContain('OpenAPI 契约中不存在接口 missing');

  expect(adapter.responseValidator(false)).toBeUndefined();
  expect(adapter.responseValidator({ meta: 'invalid' })).toBeUndefined();
  expect(adapter.responseValidator({ meta: { id: 1 } })).toBeUndefined();
  expect(adapter.responseValidator({ meta: { id: 'missing' } })).toBeUndefined();
  const response = {
    code: 0,
    message: 'ok',
    data: { trade_no: 'T', status: 'CREATED', amount: 1, merchant_id: 1 },
  };
  expect(adapter.responseValidator('createTrade')!(response, 200)).toEqual([]);
  expect(adapter.responseValidator({ meta: { id: 'createTrade' } })!(response, 200)).toEqual([]);

  const anonymousIssues: string[] = [];
  adapter.deriveObligations({
    operation: {
      key: 'listTrades',
      prefix: contractName,
      methodName: 'listTrades',
      httpMethod: 'get',
      path: '/list',
      requestFields: {},
      position: 'fixture.ts:1',
      meta: {},
    },
    checker: undefined,
    program: undefined,
    protocolSrc: 'packages/openapi/src',
    requiredIn: ['integration'],
    integrationOnly: ['integration'],
    issues: anonymousIssues,
  });
  expect(anonymousIssues).toEqual([]);
  expect(adapter.checkFixture({}, {})).toEqual([]);
});
