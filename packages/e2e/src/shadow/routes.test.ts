import { afterEach, test } from 'vitest';
import type { ShadowRoute } from './routes.ts';
import { createShadowServer, type RunningShadowServer } from './server.ts';

const running: RunningShadowServer[] = [];
afterEach(async () => Promise.all(running.splice(0).map((server) => server.close())));

test(
  'SCN-PROTOCOL-CONTRACT-004 neutral-route',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-004',
        caseId: 'neutral-route',
        environment: 'test-tools-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-004',
            caseKey: 'neutral-route',
            checks: ['neutral-route-served'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    // 手写中立路由：只有方法名、HTTP 方法与路径，测试文件不导入 generated。
    const routes: ShadowRoute[] = [
      { methodName: 'NeutralTrade', httpMethod: 'POST', path: '/api/neutral/trade' },
    ];
    const server = await createShadowServer({
      routes,
      scenarios: [
        {
          id: 'neutral',
          routes: {
            NeutralTrade: {
              expectedRequests: [{ body: { id: 'a' } }, { body: { id: 'b' } }],
              steps: [{ body: { turn: 1 } }, { delayMs: 5, body: { turn: 2 } }],
            },
          },
        },
      ],
    }).start();
    running.push(server);
    const post = (body: unknown) =>
      fetch(`${server.url}/api/neutral/trade`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    context.expect(await (await post({ id: 'a' })).json()).toEqual({ turn: 1 });
    const before = Date.now();
    context.expect(await (await post({ id: 'b' })).json()).toEqual({ turn: 2 });
    context.expect(Date.now() - before).toBeGreaterThanOrEqual(4);
    context
      .expect(server.records().map((record) => record.methodName))
      .toEqual(['NeutralTrade', 'NeutralTrade']);
    context.expect(server.verify()).toEqual([]);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['neutral-route-served'],
      }),
      'scenario-evidence',
    );
  },
);
