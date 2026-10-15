// @SCN-PROTOCOL-CONTRACT-008: 经公共协议客户端发出的请求都带规范格式的 X-Request-Id。
import { afterEach } from 'vitest';
import { createFetchHttp, createProtocolClient } from '@daqian/template-protocol';
import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';
import { routesFromRpcMethods } from '@template-test/protocol';
import { createShadowServer, type RunningShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';

/** 公司规范：26 字符、北京时间、末尾 6 位小写字母（PC-05）。 */
const requestIdPattern = '^\\d{8}_\\d{6}_\\d{3}_[a-z]{6}$';
const requestIdRegExp = new RegExp(requestIdPattern);

/** 用例 Fixture 自带请求与响应样例，不依赖模板示例目录，也不写死请求 ID。 */
type WireFixture = Readonly<{
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}>;

const routes = routesFromRpcMethods([CreateTrade.meta], [CreateTrade.meta]);
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
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-PROTOCOL-CONTRACT-008',
        caseKey: 'request-id-wire',
        checks: ['header-name', 'format', 'same-as-basereq', 'fresh-per-request'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect, environmentClass }) => {
    const sample = fixture as WireFixture;
    const message = () => {
      const source = structuredClone(sample.request);
      delete source.baseReq;
      return CreateTrade.meta.requestCodec!.fromJSON(source);
    };
    const server = await createShadowServer({
      routes,
      environmentClass,
      scenarios: [
        {
          id: 'request-id-wire',
          routes: {
            CreateTrade: {
              // 请求 ID 每次都变：Shadow 只校验请求头格式（headerPatterns），请求体由本用例逐项核验。
              expectedRequests: [
                { recordOnly: true, headerPatterns: { 'x-request-id': requestIdPattern } },
                { recordOnly: true, headerPatterns: { 'x-request-id': requestIdPattern } },
              ],
              steps: [{ body: sample.response }, { body: sample.response }],
            },
          },
        },
      ],
    }).start();
    running.add(server);
    const client = createProtocolClient({
      gatewayBaseUrl: server.url,
      getAccessToken: () => 'fixture-token',
      http: createFetchHttp(),
      runtime: { nowMs: () => Date.now(), sleepMs: () => new Promise(() => undefined) },
    });
    const results = [];
    for (let index = 0; index < 2; index += 1)
      results.push(
        await client.request(CreateTrade.meta, message(), { deadlineAtMs: Date.now() + 5_000 }),
      );

    // headerPatterns 全部匹配：X-Request-Id 存在且符合格式。
    expect(server.verify()).toEqual([]);
    expect(results.every((result) => result.ok)).toBe(true);
    const records = server.records();
    expect(records).toHaveLength(2);
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
      expect(headerOf(0)).not.toBe(headerOf(1));
      expect(baseReqIdOf(0)).not.toBe(baseReqIdOf(1));
    });
  },
);
