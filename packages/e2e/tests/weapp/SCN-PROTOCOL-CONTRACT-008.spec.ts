// @SCN-PROTOCOL-CONTRACT-008: 经真实 wx.request 发出的请求都带规范格式的 X-Request-Id。
import automator from 'miniprogram-automator';
import { afterEach } from 'vitest';
import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';
import {
  createShadowServer,
  discoverDeclaredRoutes,
  type RunningShadowServer,
} from '@template-test/protocol';
import { defineCase } from '../../src/cases/define-case.ts';
import { runWeappFunction } from '../../src/drivers/weapp.ts';

/** 公司规范：26 字符、北京时间、末尾 6 位小写字母（PC-05）。 */
const requestIdPattern = '^\\d{8}_\\d{6}_\\d{3}_[a-z]{6}$';
const requestIdRegExp = new RegExp(requestIdPattern);

const projectPath = new URL('../../host/weapp', import.meta.url).pathname;
const cliPath =
  process.env.WECHAT_DEVTOOLS_CLI_PATH ?? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

/** 用例 Fixture 自带请求与响应样例，不依赖模板示例目录，也不写死请求 ID。 */
type WireFixture = Readonly<{
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}>;

const routes = discoverDeclaredRoutes([CreateTrade]);
const running = new Set<RunningShadowServer>();
afterEach(async () => {
  await Promise.all([...running].map((server) => server.close()));
  running.clear();
});

defineCase(
  {
    ownerId: 'SCN-PROTOCOL-CONTRACT-008',
    caseId: 'request-id-wire',
    fixtureCase: 'request-id-wire',
    environment: 'weapp',
    covers: [
      {
        id: 'SCN-PROTOCOL-CONTRACT-008',
        caseKey: 'request-id-wire',
        checks: ['header-name', 'format', 'same-as-basereq', 'fresh-per-request'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const sample = fixture as WireFixture;
    // 本用例自带的请求序列（矩阵 1 次、稀疏 1 次、共享证据 4 次、在途超时 1 次、网络分支 1 次）：
    // 宿主按 generated IDL 直发，不依赖 SDK 的消费接口声明，删掉模板示例后这些请求照常发出。
    const steps = [
      { body: sample.response },
      { body: {} },
      { body: { baseResp: { success: true, statusCode: '0' } } },
      { body: { baseResp: { success: false, statusCode: '123', statusMsg: 'matrix-business' } } },
      { status: 503, body: { baseResp: { success: false, statusCode: '123' } } },
      {
        rawBody: '{',
        contentType: 'application/json',
        malformed: { reason: '非法 JSON 响应体（解码错误义务）' },
      },
      { delayMs: 30, body: {} },
      { disconnect: true },
    ];
    const server = await createShadowServer({
      routes,
      scenarios: [
        {
          id: 'request-id-wire-weapp',
          routes: {
            CreateTrade: {
              // 请求 ID 每次都变：Shadow 只校验请求头格式（headerPatterns），请求体由本用例逐项核验。
              expectedRequests: steps.map(() => ({
                recordOnly: true as const,
                headerPatterns: { 'x-request-id': requestIdPattern },
              })),
              steps,
            },
          },
        },
      ],
    }).start();
    running.add(server);
    const source = structuredClone(sample.request);
    delete source.baseReq;
    await runWeappFunction({
      automator,
      projectPath,
      cliPath,
      functionName: 'runProtocolSuite',
      args: {
        gatewayBaseUrl: server.url,
        accessToken: 'fixture-token',
        productId: 'matrix-product',
        timeoutMs: 10_000,
        // 共享能力的宿主证据只依赖协议来源（generated IDL 不在示例删除白名单内）。
        idl: 'generated',
        methods: [
          {
            name: 'CreateTrade',
            request: source,
            sparseRequest: source,
            responseCount: 1,
            responsePaths: [],
          },
        ],
      },
    });

    // headerPatterns 全部匹配：X-Request-Id 存在且符合格式。
    expect(server.verify()).toEqual([]);
    const records = server.records().filter((record) => record.methodName === 'CreateTrade');
    expect(records.length).toBe(steps.length);
    const headerOf = (index: number) => records[index]!.headers['x-request-id'];
    const baseReqIdOf = (index: number) =>
      (records[index]!.rawBody as { baseReq?: { requestId?: string } }).baseReq?.requestId;

    await checkpoint('header-name', () => {
      for (const record of records) {
        expect(typeof record.headers['x-request-id']).toBe('string');
        // 不再发送旧 request_id 头。
        expect(record.headers['request_id']).toBeUndefined();
      }
    });

    await checkpoint('format', () => {
      for (const record of records) {
        const value = record.headers['x-request-id'];
        expect(typeof value).toBe('string');
        expect(String(value)).toHaveLength(26);
        expect(String(value)).toMatch(requestIdRegExp);
      }
    });

    await checkpoint('same-as-basereq', () => {
      for (let index = 0; index < records.length; index += 1)
        expect(baseReqIdOf(index)).toBe(headerOf(index));
    });

    await checkpoint('fresh-per-request', () => {
      const headerIds = records.map((_, index) => headerOf(index));
      expect(new Set(headerIds).size).toBe(records.length);
    });
  },
);
