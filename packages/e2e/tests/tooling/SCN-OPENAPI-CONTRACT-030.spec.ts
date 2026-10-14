import {
  createFetchHttp,
  createRestClient,
  type RestOperation,
  type SecurityScheme,
} from '@daqian/template-openapi';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { createOpenApiContract, type OpenApiBundle } from '../../../openapi/testing/contract.ts';
import { matrixIdentity, matrixInput } from '../../src/preview/openapi-obligation-matrix.ts';

const normalize = () => ({ codeTable: {}, commonCodes: [], operationCodes: {}, issues: [] });

const bundle = {
  info: { title: 'inheritance-wire' },
  security: [{ PlayerToken: [] }],
  paths: {
    '/games/{game_id}': {
      parameters: [{ name: 'game_id', in: 'path', schema: { type: 'string' } }],
      get: {
        operationId: 'inheritedWire',
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
                      required: ['game_id'],
                      properties: { game_id: { type: 'string' } },
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
  components: {
    securitySchemes: {
      PlayerToken: { type: 'apiKey', in: 'header', name: 'X-Player-Token' },
    },
  },
} as unknown as OpenApiBundle;

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-030',
    caseId: 'inheritance-wire',
    fixtureCase: 'inheritance-wire',
    environment: 'integration',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-030',
        caseKey: 'inheritance-wire',
        checks: ['matrix-request-reaches-shadow'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const expected = fixture as Readonly<{ path: string; token: string }>;
    const contract = createOpenApiContract(bundle, normalize);
    const inherited = contract.operations.find((operation) => operation.id === 'inheritedWire')!;
    const operation: RestOperation = {
      meta: {
        id: inherited.id,
        method: inherited.method,
        path: inherited.path,
        security: inherited.security,
        codes: inherited.codes,
        implemented: inherited.implemented,
      },
    };
    const input = matrixInput(contract, operation);
    const identity = matrixIdentity(contract, { inheritedWire: operation });
    const server = await createShadowServer({
      routes: [
        {
          methodName: inherited.id,
          httpMethod: inherited.method,
          path: inherited.path,
        },
      ],
      environmentClass: 'integration',
      scenarios: [
        {
          id: 'inheritance-wire',
          routes: {
            inheritedWire: {
              expectedRequests: [{ recordOnly: true }],
              steps: [
                {
                  body: {
                    code: 0,
                    message: 'ok',
                    data: { game_id: (input.path as { game_id: string }).game_id },
                  },
                },
              ],
            },
          },
        },
      ],
    }).start();
    try {
      const client = createRestClient({
        gatewayBaseUrl: server.url,
        http: createFetchHttp(),
        securitySchemes: Object.fromEntries(
          Object.entries(contract.securitySchemes).map(([name, scheme]) => [
            name,
            scheme as SecurityScheme,
          ]),
        ),
        identity: identity!,
      });
      const result = await client.request(operation, input);
      const record = server.records()[0];

      await checkpoint('matrix-request-reaches-shadow', () => {
        expect(input.path).toEqual({ game_id: expected.path });
        expect(identity).toEqual({ scheme: 'PlayerToken', token: expected.token });
        expect(result.kind, JSON.stringify(result)).toBe('success');
        expect(record?.methodName).toBe('inheritedWire');
        expect(record?.path).toBe(`/games/${expected.path}`);
        expect(record?.headers['x-player-token']).toBe(expected.token);
        expect(result).not.toEqual({ kind: 'transport-failure', reason: 'CODEC_ERROR' });
        expect(result).not.toEqual({ kind: 'transport-failure', reason: 'EMPTY_ACCESS_TOKEN' });
        expect(server.verify()).toEqual([]);
      });
    } finally {
      await server.close();
    }
  },
  { timeoutMs: 30_000 },
);
