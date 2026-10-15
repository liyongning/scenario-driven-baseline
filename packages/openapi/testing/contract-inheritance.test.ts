import { expect, test } from 'vitest';
import { createOpenApiAdapter } from './adapter.ts';
import {
  createOpenApiContract,
  type OpenApiBundle,
  type OpenApiOperationContract,
} from './contract.ts';

const normalize = () => ({ codeTable: {}, commonCodes: [], operationCodes: {}, issues: [] });

const bundle = {
  info: { title: 'inheritance' },
  security: [{ PlayerToken: [] }, { GuestToken: [] }],
  paths: {
    '/games/{game_id}': {
      parameters: [
        { name: 'game_id', in: 'path', schema: { type: 'string' } },
        { name: 'X-Request-Id', in: 'header', schema: { type: 'string' } },
        null,
      ],
      get: {
        operationId: 'inherits',
        parameters: [
          { name: 'X-Request-Id', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: response(),
      },
      post: { operationId: 'anonymous', security: [], responses: response() },
    },
  },
  components: {
    securitySchemes: {
      PlayerToken: { type: 'apiKey', in: 'header', name: 'X-Player-Token' },
      GuestToken: { type: 'apiKey', in: 'header', name: 'X-Guest-Token' },
    },
  },
} as unknown as OpenApiBundle;

test(
  'SCN-OPENAPI-CONTRACT-030 inheritance-derivation',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-OPENAPI-CONTRACT-030',
        caseId: 'inheritance-derivation',
        fixtureCase: null,
        environment: 'openapi-unit',
        covers: [
          {
            id: 'SCN-OPENAPI-CONTRACT-030',
            caseKey: 'inheritance-derivation',
            checks: ['top-level-security-inherited', 'path-item-parameters-merged'],
          },
        ],
      },
    },
  },
  async (context) => {
    const contract = createOpenApiContract(bundle, normalize);
    const inherits = contract.operations.find((operation) => operation.id === 'inherits')!;
    const anonymous = contract.operations.find((operation) => operation.id === 'anonymous')!;
    const adapter = createOpenApiAdapter({
      productContract: () => contract,
      engineContract: contract,
    });
    const executed: string[] = [];
    const checkpoint = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };

    await checkpoint('top-level-security-inherited', async () => {
      context.expect(inherits.security).toEqual([{ PlayerToken: [] }, { GuestToken: [] }]);
      context.expect(anonymous.security).toEqual([]);
      context
        .expect(obligationsFor(adapter, contract.name, inherits).map((item) => item.id))
        .toContain(`${contract.name}.inherits#identity#$`);
      context
        .expect(obligationCases(adapter, contract.name, inherits, 'identity'))
        .toEqual(['header:PlayerToken']);
      context
        .expect(obligationCases(adapter, contract.name, anonymous, 'identity'))
        .toEqual(['anonymous']);
    });

    await checkpoint('path-item-parameters-merged', () => {
      context
        .expect(
          inherits.parameters.map((parameter) => [
            parameter.name,
            parameter.in,
            parameter.required,
          ]),
        )
        .toEqual([
          ['game_id', 'path', undefined],
          ['X-Request-Id', 'header', true],
        ]);
      context
        .expect(obligationsFor(adapter, contract.name, inherits).map((item) => item.id))
        .toContain(`${contract.name}.inherits#route#path.game_id`);
      context
        .expect(anonymous.parameters.map((parameter) => parameter.name))
        .toEqual(['game_id', 'X-Request-Id']);
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

function response() {
  return {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['code', 'message', 'data'],
            properties: {
              code: { type: 'integer' },
              message: { type: 'string' },
              data: { type: 'object' },
            },
          },
        },
      },
    },
  };
}

function obligationsFor(
  adapter: ReturnType<typeof createOpenApiAdapter>,
  prefix: string,
  operation: OpenApiOperationContract,
) {
  const issues: string[] = [];
  const result = adapter.deriveObligations({
    operation: {
      key: operation.id,
      prefix,
      methodName: operation.id,
      httpMethod: operation.method,
      path: operation.path,
      requestFields: {
        'path.game_id': { cases: ['encoded'], authority: 'fixture' },
      },
      position: 'contract-inheritance.test.ts:1',
      meta: operation,
    },
    checker: undefined,
    program: undefined,
    protocolSrc: 'packages/openapi/src',
    requiredIn: ['integration'],
    integrationOnly: ['integration'],
    issues,
  });
  expect(issues).toEqual([]);
  return result.obligations;
}

function obligationCases(
  adapter: ReturnType<typeof createOpenApiAdapter>,
  prefix: string,
  operation: Parameters<typeof obligationsFor>[2],
  category: string,
) {
  return obligationsFor(adapter, prefix, operation)
    .filter((item) => item.id.split('#')[1] === category)
    .flatMap((item) => item.cases);
}
