import { expect, test, type TestContext } from 'vitest';
import { createTrade, getTrade, listTrades } from '../../testing/engine/generated/operations';
import type { HttpPort, HttpRequest } from '../ports/http';
import { createRestClient, defaultEnvelopeConvention, type RestClientOptions } from './client';

const securitySchemes = {
  accessToken: { type: 'apiKey', in: 'header', name: 'X-Access-Token' },
  operatorToken: { type: 'apiKey', in: 'header', name: 'X-Operator-Token' },
} as const;

type Checkpoint = (name: string, assertion: () => void | Promise<void>) => Promise<void>;

function evidence(
  name: string,
  ownerId: string,
  caseId: string,
  checks: string[],
  body: (context: TestContext, checkpoint: Checkpoint) => Promise<void>,
) {
  test(
    name,
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

function setup(overrides: Partial<RestClientOptions> = {}, includeIdentity = true) {
  const requests: HttpRequest[] = [];
  const http: HttpPort = {
    send: async (request) => {
      requests.push(request);
      return {
        ok: true as const,
        value: {
          status: 200,
          headers: {},
          body: '{"code":0,"message":"ok","data":{"trade_no":"T-1"}}',
        },
      };
    },
  };
  const options: RestClientOptions = {
    gatewayBaseUrl: 'https://api.example.invalid/',
    http,
    securitySchemes,
    ...(includeIdentity ? { identity: { scheme: 'accessToken', token: 'fixture-token' } } : {}),
    runtime: { nowMs: () => 1_000 },
    ...overrides,
  };
  return { client: createRestClient(options), requests, http };
}

type Operation = Parameters<ReturnType<typeof createRestClient>['request']>[0];

async function request(
  client: ReturnType<typeof createRestClient>,
  operation: Operation,
  input: Parameters<ReturnType<typeof createRestClient>['request']>[1] = {},
  context: Parameters<ReturnType<typeof createRestClient>['request']>[2] = {
    deadlineAtMs: Date.now() + 2_000,
  },
) {
  return client.request(operation, input, context);
}

test('SCN-OPENAPI-CONTRACT-007 default-envelope-results', async (context) => {
  const checkpoint = async (_name: string, assertion: () => void | Promise<void>) => {
    await assertion();
  };
  const responses = [
    { status: 200, headers: {}, body: '{"code":0,"message":"ok","data":{"trade_no":"T-1"}}' },
    {
      status: 200,
      headers: {},
      body: '{"code":40901,"message":"conflict","data":{"trade_no":"T-1"}}',
    },
    { status: 500, headers: {}, body: '{"code":0,"message":"ok","data":{}}' },
    { status: 200, headers: {}, body: '{"not":"an envelope"}' },
  ];
  const client = createRestClient({
    gatewayBaseUrl: 'https://api.example.invalid',
    http: { send: async () => ({ ok: true as const, value: responses.shift()! }) },
    securitySchemes,
    identity: { scheme: 'accessToken', token: 'fixture-token' },
  });

  await checkpoint('success-result', async () =>
    context.expect(await request(client, createTrade, { body: {} })).toEqual({
      kind: 'success',
      data: { trade_no: 'T-1' },
    }),
  );
  await checkpoint('business-failure-result', async () =>
    context.expect(await request(client, createTrade, { body: {} })).toEqual({
      kind: 'business-failure',
      code: 40901,
      message: 'conflict',
      data: { trade_no: 'T-1' },
    }),
  );
  await checkpoint('http-status-result', async () =>
    context.expect(await request(client, createTrade, { body: {} })).toEqual({
      kind: 'transport-failure',
      reason: 'HTTP_STATUS',
    }),
  );
  await checkpoint('invalid-envelope-result', async () =>
    context.expect(await request(client, createTrade, { body: {} })).toEqual({
      kind: 'transport-failure',
      reason: 'INVALID_ENVELOPE',
    }),
  );
  await checkpoint('no-throw', () =>
    context.expect(defaultEnvelopeConvention).toEqual({
      successStatus: 200,
      successCode: 0,
      codeField: 'code',
      messageField: 'message',
      dataField: 'data',
    }),
  );
});

evidence(
  'SCN-OPENAPI-CONTRACT-008 envelope-configurable',
  'SCN-OPENAPI-CONTRACT-008',
  'envelope-config',
  ['default-envelope', 'custom-envelope', 'not-hardcoded'],
  async (context, checkpoint) => {
    const custom = createRestClient({
      gatewayBaseUrl: 'https://api.example.invalid',
      securitySchemes,
      identity: { scheme: 'accessToken', token: 'fixture-token' },
      envelope: {
        successStatus: 202,
        successCode: 'OK',
        codeField: 'status',
        messageField: 'detail',
        dataField: 'payload',
      },
      http: {
        send: async () => ({
          ok: true as const,
          value: {
            status: 202,
            headers: {},
            body: '{"status":"OK","detail":"done","payload":{"id":1}}',
          },
        }),
      },
    });
    await checkpoint('default-envelope', () =>
      context.expect(defaultEnvelopeConvention.successCode).toBe(0),
    );
    await checkpoint('custom-envelope', async () =>
      context.expect(await request(custom, createTrade, { body: {} })).toEqual({
        kind: 'success',
        data: { id: 1 },
      }),
    );
    await checkpoint('not-hardcoded', async () => {
      const customFailure = createRestClient({
        gatewayBaseUrl: 'https://api.example.invalid',
        securitySchemes,
        identity: { scheme: 'accessToken', token: 'fixture-token' },
        envelope: {
          successStatus: 200,
          successCode: 0,
          codeField: 'state',
          messageField: 'reason',
          dataField: 'result',
        },
        http: {
          send: async () => ({
            ok: true as const,
            value: { status: 200, headers: {}, body: '{"code":0,"message":"ok","data":{}}' },
          }),
        },
      });
      context.expect(await request(customFailure, createTrade, { body: {} })).toEqual({
        kind: 'transport-failure',
        reason: 'INVALID_ENVELOPE',
      });
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-009 path-params-unit',
  'SCN-OPENAPI-CONTRACT-009',
  'path-params-unit',
  ['path-encoded', 'missing-param-codec-error'],
  async (context, checkpoint) => {
    const { client, requests } = setup();
    await checkpoint('path-encoded', async () => {
      await request(client, getTrade, { path: { trade_no: 'T/测试 1' } });
      context
        .expect(requests[0]!.url)
        .toBe('https://api.example.invalid/api/v1/trades/T%2F%E6%B5%8B%E8%AF%95%201');
    });
    await checkpoint('missing-param-codec-error', async () => {
      const missing = setup();
      context
        .expect(await request(missing.client, getTrade, { path: {} }))
        .toEqual({ kind: 'transport-failure', reason: 'CODEC_ERROR' });
      context.expect(missing.requests).toEqual([]);
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-010 identity-unit',
  'SCN-OPENAPI-CONTRACT-010',
  'identity-unit',
  [
    'header-name-from-scheme',
    'anonymous-no-identity',
    'empty-token-rejected',
    'scheme-mismatch-rejected',
    'no-hardcoded-header',
  ],
  async (context, checkpoint) => {
    const required = setup();
    await checkpoint('header-name-from-scheme', async () => {
      await request(required.client, getTrade, { path: { trade_no: 'T-1' } });
      const cancel = setup({ identity: { scheme: 'operatorToken', token: 'operator' } });
      const { cancelTrade } = await import('../../testing/engine/generated/operations');
      await request(cancel.client, cancelTrade, { path: { trade_no: 'T-1' }, body: {} });
      context.expect(required.requests[0]!.headers['X-Access-Token']).toBe('fixture-token');
      context.expect(cancel.requests[0]!.headers['X-Operator-Token']).toBe('operator');
    });
    await checkpoint('anonymous-no-identity', async () => {
      const anonymous = setup();
      await request(anonymous.client, listTrades, { path: { merchant_id: 7 } });
      context.expect(anonymous.requests[0]!.headers['X-Access-Token']).toBeUndefined();
      context.expect(anonymous.requests[0]!.headers['X-Operator-Token']).toBeUndefined();
    });
    await checkpoint('empty-token-rejected', async () => {
      const missing = setup({}, false);
      const empty = setup({ identity: { scheme: 'accessToken', token: '  ' } });
      context
        .expect(await request(missing.client, getTrade, { path: { trade_no: 'T-1' } }))
        .toEqual({ kind: 'transport-failure', reason: 'EMPTY_ACCESS_TOKEN' });
      context
        .expect(await request(empty.client, getTrade, { path: { trade_no: 'T-1' } }))
        .toEqual({ kind: 'transport-failure', reason: 'EMPTY_ACCESS_TOKEN' });
      context.expect([...missing.requests, ...empty.requests]).toEqual([]);
    });
    await checkpoint('scheme-mismatch-rejected', async () => {
      const mismatch = setup({ identity: { scheme: 'operatorToken', token: 'operator' } });
      context
        .expect(await request(mismatch.client, getTrade, { path: { trade_no: 'T-1' } }))
        .toEqual({ kind: 'transport-failure', reason: 'HOST_CONTEXT_ERROR' });
      context.expect(mismatch.requests).toEqual([]);
    });
    await checkpoint('no-hardcoded-header', async () => {
      const unknown = setup({
        securitySchemes: {
          accessToken: { type: 'apiKey', in: 'query', name: 'ignored' } as never,
        },
      });
      context
        .expect(await request(unknown.client, getTrade, { path: { trade_no: 'T-1' } }))
        .toEqual({ kind: 'transport-failure', reason: 'HOST_CONTEXT_ERROR' });
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-011 method-unit',
  'SCN-OPENAPI-CONTRACT-011',
  'method-unit',
  ['method-from-meta', 'no-method-whitelist'],
  async (context, checkpoint) => {
    await checkpoint('method-from-meta', async () => {
      const { client, requests } = setup();
      await request(client, {
        meta: { id: 'PATCH', method: 'patch', path: '/method', security: [], codes: [] },
      });
      context.expect(requests[0]!.method).toBe('PATCH');
    });
    await checkpoint('no-method-whitelist', async () => {
      for (const method of ['DELETE', 'HEAD']) {
        const { client, requests } = setup();
        await request(client, {
          meta: { id: method, method, path: '/method', security: [], codes: [] },
        });
        context.expect(requests[0]!.method).toBe(method);
      }
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-012 request-id-unit',
  'SCN-OPENAPI-CONTRACT-012',
  'request-id-unit',
  ['not-overridable'],
  async (context, checkpoint) => {
    await checkpoint('not-overridable', async () => {
      const { client, requests } = setup();
      await request(client, getTrade, {
        path: { trade_no: 'T-1' },
        header: { 'X-Request-Id': 'caller-value' },
      });
      context.expect(requests[0]!.headers['X-Request-Id']).toMatch(/^\d{8}_\d{6}_\d{3}_[a-z]{6}$/);
      context.expect(requests[0]!.headers['X-Request-Id']).not.toBe('caller-value');
      context.expect(Object.keys(client)).toEqual(['request']);
      context.expect(Object.keys(client)).not.toContain('createRequestId');
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-013 unknown-field-tolerance',
  'SCN-OPENAPI-CONTRACT-013',
  'unknown-field-tolerance',
  ['runtime-ignores-unknown', 'test-data-still-strict'],
  async (context, checkpoint) => {
    const body = '{"code":0,"message":"ok","data":{"trade_no":"T-1","future":true},"future":true}';
    const { client } = setup({
      http: {
        send: async () => ({ ok: true as const, value: { status: 200, headers: {}, body } }),
      },
    });
    await checkpoint('runtime-ignores-unknown', async () =>
      context.expect(await request(client, getTrade, { path: { trade_no: 'T-1' } })).toEqual({
        kind: 'success',
        data: { trade_no: 'T-1', future: true },
      }),
    );
    await checkpoint('test-data-still-strict', async () => {
      const adapter = (await import('../../testing/adapter')).default;
      context
        .expect(
          adapter.responseValidator(getTrade, { manifest: { contractCarrier: 'engine' } })!(
            JSON.parse(body) as unknown,
            200,
          ).join('\n'),
        )
        .toMatch(/future/);
    });
  },
);

test('OpenAPI REST client covers transport failure and codec branches', async () => {
  const noResponse = createRestClient({
    gatewayBaseUrl: 'https://api.example.invalid',
    http: { send: async () => ({ ok: false as const, error: { code: 'TIMEOUT' as const } }) },
    securitySchemes,
    identity: { scheme: 'accessToken', token: 'fixture-token' },
  });
  await expect(request(noResponse, getTrade, { path: { trade_no: 'T-1' } })).resolves.toEqual({
    kind: 'transport-failure',
    reason: 'TIMEOUT',
  });

  const thrown = createRestClient({
    gatewayBaseUrl: 'https://api.example.invalid',
    http: { send: async () => Promise.reject(new Error('offline')) },
    securitySchemes,
    identity: { scheme: 'accessToken', token: 'fixture-token' },
  });
  await expect(request(thrown, getTrade, { path: { trade_no: 'T-1' } })).resolves.toEqual({
    kind: 'transport-failure',
    reason: 'NETWORK_ERROR',
  });

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await expect(request(setup().client, createTrade, { body: circular })).resolves.toEqual({
    kind: 'transport-failure',
    reason: 'CODEC_ERROR',
  });
  await expect(request(setup().client, createTrade, { body: () => undefined })).resolves.toEqual({
    kind: 'transport-failure',
    reason: 'CODEC_ERROR',
  });

  await expect(
    request(setup().client, createTrade, { body: {} }, { deadlineAtMs: 1_000 }),
  ).resolves.toEqual({ kind: 'transport-failure', reason: 'TIMEOUT' });
  await expect(
    request(
      setup().client,
      createTrade,
      { body: {} },
      {
        deadlineAtMs: 2_000,
        cancellation: { isStopped: () => true, subscribe: () => () => undefined },
      },
    ),
  ).resolves.toEqual({ kind: 'transport-failure', reason: 'CANCELLED' });
});

test('OpenAPI REST client validates additional envelope and URL branches', async () => {
  const cases: Array<[unknown, string]> = [
    [{ code: 0, message: 'ok' }, 'INVALID_ENVELOPE'],
    [{ code: true, message: 'ok', data: null }, 'INVALID_ENVELOPE'],
    [{ code: '0', message: 1, data: null }, 'INVALID_ENVELOPE'],
    [null, 'INVALID_ENVELOPE'],
    ['{', 'INVALID_ENVELOPE'],
  ];
  for (const [body, reason] of cases) {
    const client = createRestClient({
      gatewayBaseUrl: 'https://api.example.invalid',
      http: {
        send: async () => ({
          ok: true as const,
          value: { status: 200, headers: {}, body },
        }),
      },
      securitySchemes,
      identity: { scheme: 'accessToken', token: 'fixture-token' },
    });
    await expect(request(client, createTrade, { body: {} })).resolves.toEqual({
      kind: 'transport-failure',
      reason,
    });
  }

  const { client, requests } = setup();
  await request(
    client,
    { meta: { id: 'query', method: 'GET', path: '/query/{id}', security: [], codes: [] } },
    {
      path: { id: 1 },
      query: { omitted: undefined, nil: null, value: 'x' },
    },
  );
  expect(requests[0]!.url).toBe('https://api.example.invalid/query/1?value=x');
  await expect(
    request(client, { meta: { id: 'bad', method: 'GET', path: '/query/{id}' } }, { path: {} }),
  ).resolves.toEqual({ kind: 'transport-failure', reason: 'CODEC_ERROR' });
});
