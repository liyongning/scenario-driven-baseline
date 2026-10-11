import { afterEach, beforeEach, expect, expectTypeOf, test, vi } from 'vitest';
import * as protocol from './index';
import type {
  Cancellation,
  CommunicationResult,
  DecodedHttpResponse,
  HttpRequest,
  ProtocolClient,
  ProtocolClientOptions,
} from './index';
import {
  CreateTradePay,
  CreateTradePayRequest,
  QueryTrade,
  QueryTradeRequest,
  type CreateTradePayResponse,
} from './generated/idl/infra/trade/v1/trade';
/**
 * 单测自供的请求与响应载荷：协议客户端的公共能力证据不读取示例的协议矩阵 Fixture，
 * 示例删除后仍能独立运行（ENG-06）。
 */
const create = {
  response: {
    tradeNo: 'trade-matrix',
    orderNos: ['order-matrix'],
    status: 'TRADE_STATUS_PAID',
    baseResp: {
      requestId: 'matrix-response',
      success: false,
      error: {
        message: 'matrix-message',
        details: { field: 'value' },
        retryable: true,
        source: 'trade',
        canonicalCode: 'CANONICAL_ERROR_CODE_UNAVAILABLE',
        bizCode: '123',
        bizCodeName: 'MatrixError',
      },
      serverTimeMs: '1700000000000',
      statusCode: '123',
      statusMsg: 'matrix-status',
    },
  },
};
const query = { request: { tradeNo: 'trade-matrix', baseReq: { productId: 'matrix-product' } } };

function cancellation() {
  let stopped = false;
  const listeners = new Set<() => void>();
  return {
    isStopped: () => stopped,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    stop: () => {
      stopped = true;
      for (const fn of listeners) fn();
    },
    listeners,
  };
}
function setup(overrides: Partial<ProtocolClientOptions> = {}) {
  const requests: HttpRequest[] = [];
  const options: ProtocolClientOptions = {
    gatewayBaseUrl: 'https://fixture-gateway.invalid/',
    getAccessToken: () => 'fixture-token',
    requestContext: { productId: 'fixture-product', lane: 'dev-lane', appVersion: '1.2.3' },
    runtime: {
      nowMs: () => Date.now(),
      sleepMs: (duration: number, stop?: Cancellation) =>
        new Promise((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            unsubscribe?.();
            resolve();
          };
          const timer = setTimeout(finish, duration);
          const unsubscribe = stop?.subscribe(finish);
        }),
    },
    http: {
      send: async (request) => {
        requests.push(request);
        return { ok: true, value: { status: 200, headers: {}, body: create.response } };
      },
    },
    ...overrides,
  };
  expect(protocol).toHaveProperty('createProtocolClient');
  return { client: protocol.createProtocolClient(options), requests, options };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.useRealTimers();
});

test('通信接口从 generated metadata 推断响应，不引入支付结果', () => {
  const consume = (client: ProtocolClient) =>
    client.request(CreateTradePay.meta, CreateTradePayRequest.create(), { deadlineAtMs: 100 });
  expectTypeOf(consume).returns.toEqualTypeOf<
    Promise<CommunicationResult<DecodedHttpResponse<CreateTradePayResponse>>>
  >();
});
test('query 只发送原交易，缺省上下文不补环境或身份字段', async () => {
  const { client, requests } = setup({ requestContext: {} });
  await client.request(
    QueryTrade.meta,
    QueryTradeRequest.create({ tradeNo: String(query.request.tradeNo) }),
    { deadlineAtMs: 61000 },
  );
  const expected = structuredClone(query.request);
  delete (expected.baseReq as { productId?: string }).productId;
  delete (expected.baseReq as { requestId?: string }).requestId;
  const body = JSON.parse(requests[0]!.body!) as { baseReq?: Record<string, unknown> };
  const { requestId, ...restBaseReq } = body.baseReq ?? {};
  expect({ ...body, baseReq: restBaseReq }).toEqual(expected);
  const headers = requests[0]!.headers;
  expect(headers).toMatchObject({
    Authorization: 'Bearer fixture-token',
    'Content-Type': 'application/json',
  });
  // 头名为 X-Request-Id、不再发送旧 request_id 头，且与 BaseReq.requestId 同值（PC-05）。
  expect(headers['request_id']).toBeUndefined();
  expect(headers['X-Request-Id']).toMatch(/^\d{8}_\d{6}_\d{3}_[a-z]{6}$/);
  expect(requestId).toBe(headers['X-Request-Id']);
});
test('连续请求逐次读取 Token，并扣除 provider 用时', async () => {
  let sequence = 0;
  const { client, requests } = setup({
    getAccessToken: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return `fixture-${++sequence}`;
    },
  });
  for (let i = 0; i < 2; i++) {
    const pending = client.request(QueryTrade.meta, QueryTradeRequest.create(), {
      deadlineAtMs: Date.now() + 100,
    });
    await vi.advanceTimersByTimeAsync(50);
    await pending;
  }
  expect(requests.map((r) => [r.headers.Authorization, r.timeoutMs])).toEqual([
    ['Bearer fixture-1', 50],
    ['Bearer fixture-2', 50],
  ]);
  expect(vi.getTimerCount()).toBe(0);
});
test.each([null, '', '   ', 42])('空或非法 provider 输入 %s 不发 HTTP', async (token) => {
  const { client, requests } = setup({ getAccessToken: () => token as string | null });
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 }),
  ).toEqual({
    ok: false,
    error: { code: token === 42 ? 'HOST_CONTEXT_ERROR' : 'EMPTY_ACCESS_TOKEN' },
  });
  expect(requests).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
test.each(['throw', 'reject'] as const)('provider %s 与服务器错误区分', async (kind) => {
  const { client, requests } = setup({
    getAccessToken: () => {
      if (kind === 'throw') throw new Error('sensitive');
      return Promise.reject(new Error('sensitive'));
    },
  });
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 }),
  ).toEqual({ ok: false, error: { code: 'HOST_CONTEXT_ERROR' } });
  expect(requests).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
test.each(['deadline', 'cancel'] as const)(
  'provider 挂起时 %s 一次结束且迟到不发请求',
  async (kind) => {
    let resolveToken!: (token: string) => void;
    const stop = cancellation();
    const { client, requests } = setup({
      getAccessToken: () =>
        new Promise((resolve) => {
          resolveToken = resolve;
        }),
    });
    const pending = client.request(QueryTrade.meta, QueryTradeRequest.create(), {
      deadlineAtMs: 1100,
      cancellation: stop,
    });
    await vi.advanceTimersByTimeAsync(0);
    if (kind === 'deadline') await vi.advanceTimersByTimeAsync(100);
    else stop.stop();
    expect(await pending).toEqual({
      ok: false,
      error: { code: kind === 'deadline' ? 'TIMEOUT' : 'CANCELLED' },
    });
    resolveToken('late');
    await vi.advanceTimersByTimeAsync(100);
    expect(requests).toEqual([]);
    expect(stop.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  },
);
test.each(['deadline', 'cancel'] as const)('调用前已 %s 不读取 provider', async (kind) => {
  const token = vi.fn(() => 'fixture');
  const stop = cancellation();
  if (kind === 'cancel') stop.stop();
  const { client, requests } = setup({ getAccessToken: token });
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), {
      deadlineAtMs: kind === 'deadline' ? 1000 : 2000,
      cancellation: stop,
    }),
  ).toEqual({ ok: false, error: { code: kind === 'deadline' ? 'TIMEOUT' : 'CANCELLED' } });
  expect(token).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
});
test('provider 同步占完预算后不得发送', async () => {
  const { client, requests } = setup({
    getAccessToken: () => {
      vi.setSystemTime(2000);
      return 'fixture';
    },
  });
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 }),
  ).toEqual({ ok: false, error: { code: 'TIMEOUT' } });
  expect(requests).toEqual([]);
});
test.each([401, 403, 503])('非 2xx %s 保留 HTTP 与可解码信封供 SDK 判错', async (status) => {
  const http = {
    status,
    headers: {},
    body: JSON.stringify({ baseResp: { statusCode: '20200002001020' } }),
  };
  const { client } = setup({ http: { send: async () => ({ ok: true, value: http }) } });
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 }),
  ).toMatchObject({
    ok: true,
    value: {
      http,
      wire: { baseResp: { statusCode: '20200002001020' } },
      data: { baseResp: { statusCode: 20200002001020n } },
    },
  });
});
test.each([
  'not-json',
  'null',
  '[]',
  '42',
  '{"baseResp":{"statusCode":"bad"}}',
  { baseResp: { statusCode: 0n } },
])('不可解码 JSON 返回 CODEC_ERROR 并保留 HTTP case %#', async (body) => {
  const http = { status: 502, headers: {}, body };
  const { client } = setup({ http: { send: async () => ({ ok: true, value: http }) } });
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 }),
  ).toEqual({ ok: false, error: { code: 'CODEC_ERROR', http } });
});
test.each(['NETWORK_ERROR', 'TIMEOUT', 'CANCELLED'] as const)(
  '平台通信 %s 不重放',
  async (code) => {
    const send = vi.fn(async () => ({ ok: false as const, error: { code } }));
    const { client } = setup({ http: { send } });
    expect(
      await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 }),
    ).toEqual({ ok: false, error: { code } });
    expect(send).toHaveBeenCalledTimes(1);
  },
);
test('HTTP 端口抛错归为传输错误，不泄露原始异常', async () => {
  const { client } = setup({
    http: {
      send: () => {
        throw new Error('secret');
      },
    },
  });
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 }),
  ).toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });
});
test.each(['missing', 'throw', 'method'] as const)(
  'metadata codec 契约缺失 %s 不发 HTTP',
  async (kind) => {
    const { client, requests } = setup();
    const meta = { ...QueryTrade.meta };
    if (kind === 'missing') delete meta.requestCodec;
    else if (kind === 'method') meta.method = 'PUT';
    else
      meta.requestCodec = {
        ...QueryTradeRequest,
        toJSON: () => {
          throw new Error('secret');
        },
      };
    expect(await client.request(meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 })).toEqual({
      ok: false,
      error: { code: 'CODEC_ERROR' },
    });
    expect(requests).toEqual([]);
  },
);

test.each(['deadline', 'cancel'] as const)(
  'codec 同步执行后重新检查 %s，预算不会重置',
  async (kind) => {
    const stop = cancellation();
    const { client, requests } = setup();
    const meta = {
      ...QueryTrade.meta,
      requestCodec: {
        ...QueryTradeRequest,
        toJSON: (value: QueryTradeRequest) => {
          if (kind === 'deadline') vi.setSystemTime(2000);
          else stop.stop();
          return QueryTradeRequest.toJSON(value);
        },
      },
    };
    expect(
      await client.request(meta, QueryTradeRequest.create(), {
        deadlineAtMs: 2000,
        cancellation: stop,
      }),
    ).toEqual({ ok: false, error: { code: kind === 'deadline' ? 'TIMEOUT' : 'CANCELLED' } });
    expect(requests).toEqual([]);
  },
);
test('生成 metadata 的 GET 可执行，仍使用同一上下文和 codec', async () => {
  const { client, requests } = setup();
  const stop = cancellation();
  expect(
    await client.request({ ...QueryTrade.meta, method: 'GET' }, QueryTradeRequest.create(), {
      deadlineAtMs: 2000,
      cancellation: stop,
    }),
  ).toMatchObject({ ok: true });
  expect(requests[0]!.method).toBe('GET');
  expect(requests[0]!.cancellation).toBe(stop);
});
test('注册停止监听时同步停止，不读取 provider，并解除刚返回的订阅', async () => {
  const unsubscribe = vi.fn();
  const token = vi.fn(() => 'fixture');
  const { client, requests } = setup({ getAccessToken: token });
  const stop: Cancellation = {
    isStopped: () => false,
    subscribe: (listener) => {
      listener();
      return unsubscribe;
    },
  };
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), {
      deadlineAtMs: 2000,
      cancellation: stop,
    }),
  ).toEqual({ ok: false, error: { code: 'CANCELLED' } });
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(token).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
});
test('provider 同步标记停止但尚未通知监听时，凭据不能启动 HTTP', async () => {
  let stopped = false;
  const { client, requests } = setup({
    getAccessToken: () => {
      stopped = true;
      return 'fixture';
    },
  });
  const stop: Cancellation = { isStopped: () => stopped, subscribe: () => () => {} };
  expect(
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), {
      deadlineAtMs: 2000,
      cancellation: stop,
    }),
  ).toEqual({ ok: false, error: { code: 'CANCELLED' } });
  expect(requests).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
test('超时后的 provider 拒绝被消费，不重放或留下计时器', async () => {
  let reject!: (reason: Error) => void;
  const { client, requests } = setup({
    getAccessToken: () =>
      new Promise((_, no) => {
        reject = no;
      }),
  });
  const pending = client.request(QueryTrade.meta, QueryTradeRequest.create(), {
    deadlineAtMs: 1100,
  });
  await vi.advanceTimersByTimeAsync(100);
  expect(await pending).toEqual({ ok: false, error: { code: 'TIMEOUT' } });
  reject(new Error('fixture late rejection'));
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
test('配置在实例创建时复制，之后宿主修改配置不污染该实例', async () => {
  const context = { productId: 'original' };
  const options = { gatewayBaseUrl: 'https://original.invalid', requestContext: context };
  const { client, requests } = setup(options);
  context.productId = 'changed';
  options.gatewayBaseUrl = 'https://changed.invalid';
  await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 });
  expect(requests[0]!.url).toBe('https://original.invalid/api/base/trade/query');
  expect(requests[0]!.headers['X-Product-ID']).toBe('original');
});

test('codec 返回不可序列化的 undefined 时不得发送无效 body', async () => {
  const { client, requests } = setup();
  const meta = {
    ...QueryTrade.meta,
    requestCodec: { ...QueryTradeRequest, toJSON: () => undefined },
  };
  expect(await client.request(meta, QueryTradeRequest.create(), { deadlineAtMs: 2000 })).toEqual({
    ok: false,
    error: { code: 'CODEC_ERROR' },
  });
  expect(requests).toEqual([]);
});

test(
  'SCN-PROTOCOL-CONTRACT-008 client-options-shape',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-008',
        caseId: 'client-options-shape',
        fixtureCase: null,
        environment: 'protocol-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-008',
            caseKey: 'client-options-shape',
            checks: ['protocol-options-no-override', 'generator-internal-only'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    // protocol-options-no-override：公共选项与公共类型都删除了 nextRequestId。
    expectTypeOf<ProtocolClientOptions['runtime']>().not.toHaveProperty('nextRequestId');
    const overrides = {
      runtime: {
        nowMs: () => 1000,
        sleepMs: () => new Promise<void>(() => undefined),
        nextRequestId: () => 'host-override',
      },
    } as unknown as Partial<ProtocolClientOptions>;
    const { client, requests } = setup(overrides);
    await client.request(QueryTrade.meta, QueryTradeRequest.create(), { deadlineAtMs: 61_000 });
    // 宿主即使多传字段也不能覆盖：头仍是标准生成器的值。
    context.expect(requests[0]!.headers['X-Request-Id']).not.toBe('host-override');
    context.expect(requests[0]!.headers['X-Request-Id']).toMatch(/^\d{8}_\d{6}_\d{3}_[a-z]{6}$/);

    // generator-internal-only：根入口不导出生成器，注入参数不在任何公共导出中。
    context.expect(Object.keys(protocol)).not.toContain('createRequestId');
    context.expect(Object.keys(protocol).filter((name) => /requestId/i.test(name))).toEqual([]);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['protocol-options-no-override', 'generator-internal-only'],
      }),
      'scenario-evidence',
    );
  },
);
