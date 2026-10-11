// @SCN-PROTOCOL-CONTRACT-010: Shadow 期望请求按头名与正则校验每次都变的请求头。
import { afterEach, test } from 'vitest';
import type { ShadowRoute } from './routes.ts';
import { createShadowServer, type RunningShadowServer } from './server.ts';

/** 公司规范的请求 ID 正则：26 字符、北京时间、末尾 6 位小写字母（PC-05）。 */
const requestIdPattern = '^\\d{8}_\\d{6}_\\d{3}_[a-z]{6}$';

const routes: ShadowRoute[] = [
  { methodName: 'NeutralTrade', httpMethod: 'POST', path: '/api/neutral/trade' },
];

const running: RunningShadowServer[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

/** 单次期望请求：请求头按 headerPatterns 校验，请求体仍逐字段比对。 */
async function start(expectedHeaders: Record<string, string>) {
  const configured = createShadowServer({
    routes,
    scenarios: [
      {
        id: 'header-patterns',
        routes: {
          NeutralTrade: {
            expectedRequests: [
              {
                body: { tradeNo: 'trade-1' },
                headerPatterns: { 'x-request-id': requestIdPattern },
              },
            ],
            steps: [{ body: { tradeNo: 'trade-1' } }],
          },
        },
      },
    ],
  });
  const server = await configured.start();
  running.push(server);
  const response = await fetch(`${server.url}/api/neutral/trade`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...expectedHeaders },
    body: JSON.stringify({ tradeNo: 'trade-1' }),
  });
  return { server, response };
}

test(
  'SCN-PROTOCOL-CONTRACT-010 shadow-header-patterns',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-010',
        caseId: 'shadow-header-patterns',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-010',
            caseKey: 'shadow-header-patterns',
            checks: ['pattern-match', 'pattern-mismatch-reported'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    // pattern-match：符合格式的请求通过，且不产生任何问题。
    const matched = await start({ 'x-request-id': '20260101_000000_000_abzaza' });
    context.expect(matched.response.status).toBe(200);
    context.expect(matched.server.verify()).toEqual([]);

    // pattern-mismatch-reported：缺失、只剩旧头名、格式错误都由 verify() 报出头名与期望模式。
    const cases = [
      { name: '缺少该头', headers: {} },
      { name: '只带旧 request_id 头', headers: { request_id: '20260101_000000_000_abzaza' } },
      { name: '格式错误', headers: { 'x-request-id': 'pay-fixture-1' } },
    ] as const;
    for (const item of cases) {
      const attempted = await start({ ...item.headers });
      context.expect(attempted.response.status, item.name).toBe(422);
      const issues = attempted.server.verify();
      context.expect(issues.join('\n'), item.name).toContain('$.headers.x-request-id');
      context.expect(issues.join('\n'), item.name).toContain(JSON.stringify(requestIdPattern));
    }

    // 非法正则必须在构造期报错，而不是留到请求时才失败。
    context
      .expect(() =>
        createShadowServer({
          routes,
          scenarios: [
            {
              id: 'invalid-pattern',
              routes: {
                NeutralTrade: {
                  expectedRequests: [{ recordOnly: true, headerPatterns: { 'x-request-id': '(' } }],
                  steps: [{ body: { tradeNo: 'trade-1' } }],
                },
              },
            },
          ],
        }),
      )
      .toThrow(/headerPatterns\.x-request-id is not a valid regex/);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['pattern-match', 'pattern-mismatch-reported'],
      }),
      'scenario-evidence',
    );
  },
);
