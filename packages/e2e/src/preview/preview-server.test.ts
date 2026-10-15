import { afterEach, test, vi } from 'vitest';
import { createPreviewShadowServer } from '../shadow/preview-server.ts';
import { createShadowServer, type RunningShadowServer } from '../shadow/server.ts';
import type { ShadowRoute } from '../shadow/routes.ts';

const routes: ShadowRoute[] = [
  { methodName: 'QueryTrade', httpMethod: 'POST', path: '/api/preview/trades/{tradeNo}' },
  { methodName: 'PairTrade', httpMethod: 'POST', path: '/api/preview/pairs/{left}/{right}' },
  { methodName: 'ReadStatus', httpMethod: 'POST', path: '/api/preview/status/{id}' },
  { methodName: 'Unscripted', httpMethod: 'POST', path: '/api/preview/unscripted' },
];

const running: RunningShadowServer[] = [];
afterEach(async () => Promise.all(running.splice(0).map((server) => server.close())));

async function post(server: RunningShadowServer, path: string) {
  return fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

test(
  'SCN-PROTOCOL-CONTRACT-019 preview-mode',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-019',
        caseId: 'preview-mode',
        environment: 'test-tools-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-019',
            caseKey: 'preview-mode',
            checks: [
              'sequence-by-operation-and-params',
              'dataset-entry-matching',
              'repeat-last-unbounded',
              'unmatched-not-problems',
              'preview-validated',
              'preview-entry-separate',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const server = await createPreviewShadowServer({
        mode: 'preview',
        scenarioId: 'preview-case',
        routes,
        entries: [
          {
            operationId: 'QueryTrade',
            pathParams: { tradeNo: 'one' },
            responses: [{ body: { turn: 1 } }, { body: { turn: 2 } }],
          },
          {
            operationId: 'QueryTrade',
            pathParams: { tradeNo: 'two' },
            responses: [{ body: { turn: 'other' } }],
          },
          {
            operationId: 'PairTrade',
            pathParams: { left: 'left', right: 'right' },
            responses: [{ body: { pair: true } }],
          },
          {
            operationId: 'ReadStatus',
            responses: [{ body: { state: 'default' } }, { status: 503, body: { state: 'busy' } }],
          },
        ],
      }).start();
      running.push(server);

      const oneResponses = await Promise.all(
        Array.from({ length: 4 }, async () =>
          (await post(server, '/api/preview/trades/one')).json(),
        ),
      );
      context.expect(oneResponses).toEqual([{ turn: 1 }, { turn: 2 }, { turn: 2 }, { turn: 2 }]);

      context
        .expect(await (await post(server, '/api/preview/trades/two')).json())
        .toEqual({ turn: 'other' });
      context.expect(await (await post(server, '/api/preview/trades/one')).json()).toEqual({
        turn: 2,
      });
      context
        .expect(await (await post(server, '/api/preview/pairs/left/right')).json())
        .toEqual({ pair: true });

      const defaultStatus = await post(server, '/api/preview/status/arbitrary');
      context.expect(defaultStatus.status).toBe(200);
      context.expect(await defaultStatus.json()).toEqual({ state: 'default' });
      const explicitStatus = await post(server, '/api/preview/status/arbitrary');
      context.expect(explicitStatus.status).toBe(503);
      context.expect(await explicitStatus.json()).toEqual({ state: 'busy' });

      const unscripted = await post(server, '/api/preview/unscripted');
      const unregistered = await post(server, '/api/preview/missing');
      context.expect(unscripted.status).toBe(404);
      context.expect(unregistered.status).toBe(404);
      context
        .expect(server.records().map((record) => record.methodName))
        .toEqual([
          'QueryTrade',
          'QueryTrade',
          'QueryTrade',
          'QueryTrade',
          'QueryTrade',
          'QueryTrade',
          'PairTrade',
          'ReadStatus',
          'ReadStatus',
          'Unscripted',
          null,
        ]);
      context.expect(server.verify()).toEqual([]);
      context.expect(server.records('preview-case')).toHaveLength(11);
      context.expect(server.records('other')).toEqual([]);
      context.expect(warn).toHaveBeenCalledTimes(2);
      context.expect(warn.mock.calls[0]?.[0]).toContain('未编排');
      context.expect(warn.mock.calls[1]?.[0]).toContain('未注册');
      await server.close();
      await server.close();
      running.splice(running.indexOf(server), 1);
    } finally {
      warn.mockRestore();
    }

    const validatingRoute: ShadowRoute = {
      methodName: 'Validated',
      httpMethod: 'POST',
      path: '/api/preview/validated/{id}',
      validateResponse: (body) =>
        body && typeof body === 'object' && 'unknownField' in body
          ? ['$.unknownField: unknown response field']
          : [],
    };
    context
      .expect(() =>
        createPreviewShadowServer({
          routes: [validatingRoute],
          entries: [
            {
              operationId: 'Validated',
              responses: [{ body: { unknownField: true } }],
            },
          ],
        }),
      )
      .toThrow(/响应与协议不一致/);

    context
      .expect(() =>
        createPreviewShadowServer({
          mode: 'test' as never,
          routes,
          entries: [],
        }),
      )
      .toThrow(/only supports preview mode/);
    context
      .expect(() =>
        createPreviewShadowServer({
          routes: [routes[0]!, routes[0]!],
          entries: [],
        }),
      )
      .toThrow(/duplicate preview route operationId QueryTrade/);
    context
      .expect(() =>
        createPreviewShadowServer({
          routes,
          entries: [{ operationId: 'Missing', responses: [{ body: {} }] }],
        }),
      )
      .toThrow(/unknown operationId Missing/);
    context
      .expect(() =>
        createPreviewShadowServer({
          routes,
          entries: [{ operationId: 'ReadStatus', responses: [] }],
        }),
      )
      .toThrow(/responses must not be empty/);

    const testOptions = {
      routes,
      scenarios: [{ id: 'strict', routes: {} }],
      mode: 'preview',
      environmentClass: 'integration',
    } as const;
    context
      .expect(() => createShadowServer(testOptions as never))
      .toThrow(/createPreviewShadowServer/);
    context
      .expect(() =>
        createShadowServer({
          routes,
          scenarios: [{ id: 'strict', routes: {} }],
          mode: 'test',
        } as never),
      )
      .toThrow(/environmentClass/);
    context
      .expect(await import('../shadow/index.ts'))
      .not.toHaveProperty('createPreviewShadowServer');

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: [
          'sequence-by-operation-and-params',
          'dataset-entry-matching',
          'repeat-last-unbounded',
          'unmatched-not-problems',
          'preview-validated',
          'preview-entry-separate',
        ],
      }),
      'scenario-evidence',
    );
  },
);
