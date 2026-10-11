// @SCN-PROTOCOL-CONTRACT-011/012/013: 请求记录、路径模板转换与有界轮询的 module 证据。
import { afterEach, test } from 'vitest';
import { createShadowServer, type RunningShadowServer } from './server.ts';
import type { ShadowRoute } from './routes.ts';

const running: RunningShadowServer[] = [];
afterEach(async () => Promise.all(running.splice(0).map((server) => server.close())));

const routes: ShadowRoute[] = [
  { methodName: 'NeutralTrade', httpMethod: 'POST', path: '/api/neutral/trade' },
  { methodName: 'NeutralQuery', httpMethod: 'POST', path: '/api/neutral/query' },
];

const post = (url: string, path: string, body: unknown) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test(
  'SCN-PROTOCOL-CONTRACT-011 request-recording',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-011',
        caseId: 'request-recording',
        environment: 'protocol-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-011',
            caseKey: 'request-recording',
            checks: ['unscripted-recorded', 'unregistered-recorded', 'scripted-clean'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const server = await createShadowServer({
      routes,
      scenarios: [
        {
          id: 'recording',
          routes: {
            NeutralTrade: {
              expectedRequests: [{ body: { tradeNo: 't-1' } }],
              steps: [{ body: { ok: true } }],
            },
          },
        },
      ],
    }).start();
    running.push(server);

    // scripted-clean：只有编排内请求时 verify() 无问题。
    context
      .expect((await post(server.url, '/api/neutral/trade', { tradeNo: 't-1' })).status)
      .toBe(200);
    context.expect(server.verify()).toEqual([]);

    // 已注册但未编排：404、写入记录、由 verify() 报出。
    const unscripted = await post(server.url, '/api/neutral/query', { tradeNo: 't-1' });
    context.expect(unscripted.status).toBe(404);
    // 未注册路径：兜底处理器 404、写入记录、由 verify() 报出。
    const unregistered = await post(server.url, '/api/neutral/missing', { tradeNo: 't-1' });
    context.expect(unregistered.status).toBe(404);

    const records = server.records();
    context
      .expect(records.map((record) => record.path))
      .toEqual(['/api/neutral/trade', '/api/neutral/query', '/api/neutral/missing']);
    context.expect(records[1]?.methodName).toBe('NeutralQuery');
    context.expect(records.at(-1)?.methodName).toBeNull();

    const issues = server.verify();
    context
      .expect(
        issues.some((issue) => issue.includes('未编排的请求') && issue.includes('NeutralQuery')),
      )
      .toBe(true);
    context
      .expect(
        issues.some(
          (issue) => issue.includes('未注册的请求') && issue.includes('/api/neutral/missing'),
        ),
      )
      .toBe(true);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['unscripted-recorded', 'unregistered-recorded', 'scripted-clean'],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-PROTOCOL-CONTRACT-012 path-template',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-012',
        caseId: 'path-template',
        environment: 'protocol-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-012',
            caseKey: 'path-template',
            checks: ['template-converted', 'residual-brace-rejected'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const templateRoute: ShadowRoute = {
      methodName: 'NeutralTrade',
      httpMethod: 'POST',
      path: '/trades/{tradeId}',
    };
    const scenario = {
      id: 'template',
      routes: {
        NeutralTrade: {
          expectedRequests: [{ body: { tradeId: 'abc' } }],
          steps: [{ body: { ok: true } }],
        },
      },
    };
    const server = await createShadowServer({
      routes: [templateRoute],
      scenarios: [scenario],
    }).start();
    running.push(server);

    // template-converted：{name} 按 :name 注册，带参数请求命中，缺少该片段不命中。
    const hit = await post(server.url, '/trades/abc', { tradeId: 'abc' });
    context.expect(hit.status).toBe(200);
    context.expect(await hit.json()).toEqual({ ok: true });
    const miss = await post(server.url, '/trades', { tradeId: 'abc' });
    context.expect(miss.status).toBe(404);
    context
      .expect(server.records().map((record) => record.path))
      .toEqual(['/trades/abc', '/trades']);

    // residual-brace-rejected：转换后仍含花括号的路径在构造时报错。
    context
      .expect(() =>
        createShadowServer({
          routes: [{ ...templateRoute, path: '/trades/{tradeId' }],
          scenarios: [{ id: 'broken-open', routes: {} }],
        }),
      )
      .toThrow();
    context
      .expect(() =>
        createShadowServer({
          routes: [{ ...templateRoute, path: '/trades/{}' }],
          scenarios: [{ id: 'broken-empty', routes: {} }],
        }),
      )
      .toThrow();

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['template-converted', 'residual-brace-rejected'],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-PROTOCOL-CONTRACT-013 bounded-poll',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-013',
        caseId: 'bounded-poll',
        environment: 'protocol-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-013',
            caseKey: 'bounded-poll',
            checks: [
              'repeat-last-step',
              'overflow-still-validated',
              'over-limit-reported',
              'empty-steps-rejected',
              'platform-only',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const pollRoute: ShadowRoute = {
      methodName: 'NeutralQuery',
      httpMethod: 'POST',
      path: '/api/neutral/query',
    };
    const scripted = {
      expectedRequests: [{ body: { step: 'first' } }, { body: { step: 'last' } }],
      steps: [{ body: { turn: 'first' } }, { body: { turn: 'last' } }],
      poll: { maxRequests: 4 },
    };
    const server = await createShadowServer({
      environmentClass: 'platform',
      routes: [pollRoute],
      scenarios: [{ id: 'poll', routes: { NeutralQuery: scripted } }],
    }).start();
    running.push(server);

    context
      .expect(await (await post(server.url, '/api/neutral/query', { step: 'first' })).json())
      .toEqual({ turn: 'first' });
    context
      .expect(await (await post(server.url, '/api/neutral/query', { step: 'last' })).json())
      .toEqual({ turn: 'last' });

    // overflow-still-validated：超出 steps 的请求仍按最后一个期望请求校验。
    const third = await post(server.url, '/api/neutral/query', { step: 'wrong' });
    context.expect(third.status).toBe(422);
    // repeat-last-step：steps 用完后重复最后一个 step。
    const fourth = await post(server.url, '/api/neutral/query', { step: 'last' });
    context.expect(fourth.status).toBe(200);
    context.expect(await fourth.json()).toEqual({ turn: 'last' });
    // over-limit-reported：超过 maxRequests 返回 409 并计入 verify()。
    const fifth = await post(server.url, '/api/neutral/query', { step: 'last' });
    context.expect(fifth.status).toBe(409);
    const issues = server.verify();
    context.expect(issues.some((issue) => issue.includes('轮询超过上限'))).toBe(true);
    context
      .expect(issues.some((issue) => issue.includes('request 3') && issue.includes('$.step')))
      .toBe(true);

    // empty-steps-rejected：poll 且 steps 为空时构造报错。
    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'platform',
          routes: [pollRoute],
          scenarios: [
            {
              id: 'empty-steps',
              routes: {
                NeutralQuery: { expectedRequests: [], steps: [], poll: { maxRequests: 2 } },
              },
            },
          ],
        }),
      )
      .toThrow();
    // platform-only：非 platform 与未传 environmentClass 使用 poll 都报错。
    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'integration',
          routes: [pollRoute],
          scenarios: [
            {
              id: 'integration-poll',
              routes: {
                NeutralQuery: {
                  expectedRequests: [{ body: {} }],
                  steps: [{ body: {} }],
                  poll: { maxRequests: 2 },
                },
              },
            },
          ],
        }),
      )
      .toThrow();
    context
      .expect(() =>
        createShadowServer({
          routes: [pollRoute],
          scenarios: [
            {
              id: 'unclassified-poll',
              routes: {
                NeutralQuery: {
                  expectedRequests: [{ body: {} }],
                  steps: [{ body: {} }],
                  poll: { maxRequests: 2 },
                },
              },
            },
          ],
        }),
      )
      .toThrow();

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: [
          'repeat-last-step',
          'overflow-still-validated',
          'over-limit-reported',
          'empty-steps-rejected',
          'platform-only',
        ],
      }),
      'scenario-evidence',
    );
  },
);
