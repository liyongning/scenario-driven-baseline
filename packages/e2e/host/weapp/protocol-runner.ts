import {
  createProtocolClient,
  createWechatMiniappHttp,
  type Cancellation,
} from '@daqian/template-protocol';
import { consumedOperations } from '@daqian/template-sdk';

/**
 * 宿主只按产品包的消费接口声明解析接口：声明里的方法描述自带 HTTP 方法与请求/响应 codec，
 * 运行器不写死任何具体接口，新增消费接口时只需改声明与矩阵 Fixture。
 */
function declaredMethod(name: string) {
  const operation = consumedOperations.find((item) => item.method.meta.name === name);
  const meta = operation?.method.meta;
  if (!meta) throw new Error(`消费接口声明中没有 ${name}`);
  if (!meta.method || !meta.path || !meta.requestCodec)
    throw new Error(`消费接口 ${name} 的方法描述不是 HTTP 方法`);
  return meta;
}

type ProtocolCaseInput = Readonly<{
  name: string;
  gatewayBaseUrl: string;
  request: Record<string, unknown>;
  accessToken: string;
  productId: string;
  timeoutMs: number;
}>;

type ProtocolSuiteMethod = Readonly<{
  name: string;
  request: Record<string, unknown>;
  sparseRequest: Record<string, unknown>;
  responseCount: number;
  responsePaths: readonly string[];
}>;

type ProtocolSuiteInput = Readonly<{
  gatewayBaseUrl: string;
  accessToken: string;
  productId: string;
  timeoutMs: number;
  methods: readonly ProtocolSuiteMethod[];
}>;

/** 最小宿主只装配协议公共入口；网络始终由协议包的真实 wx.request 适配器提供。 */
export async function runProtocolCase(input: ProtocolCaseInput) {
  const meta = declaredMethod(input.name);
  const client = createProtocolClient({
    gatewayBaseUrl: input.gatewayBaseUrl,
    getAccessToken: () => input.accessToken,
    http: createWechatMiniappHttp(),
    requestContext: { productId: input.productId },
    runtime: {
      nowMs: () => Date.now(),
      sleepMs: () => new Promise(() => undefined),
    },
  });
  const result = await client.request(meta, meta.requestCodec!.fromJSON(input.request), {
    deadlineAtMs: Date.now() + input.timeoutMs,
  });
  return result.ok
    ? {
        ok: true,
        httpStatus: result.value.http.status,
        wire: result.value.wire,
        decoded: meta.responseCodec.toJSON(result.value.data),
      }
    : result;
}

/** 单次自动化连接内执行整份协议矩阵与通信故障；所有发出的请求仍走真实 wx.request。 */
export async function runProtocolSuite(input: ProtocolSuiteInput) {
  const camel = (value: string) =>
    value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const serializable = (value: unknown): unknown => {
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map(serializable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, serializable(child)]),
      );
    }
    return value;
  };
  const decodedAt = (rootValue: unknown, path: string) => {
    let value = rootValue;
    for (const part of path.split('.').map(camel)) {
      if (Array.isArray(value)) value = value[0];
      value =
        value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
    }
    return serializable(value);
  };

  const runMethod = async (spec: ProtocolSuiteMethod) => {
    const meta = declaredMethod(spec.name);
    const codec = meta.responseCodec;
    const message = (source: Record<string, unknown>) => meta.requestCodec!.fromJSON(source);
    const serialize = (
      result: Awaited<ReturnType<ReturnType<typeof createProtocolClient>['request']>>,
    ) =>
      result.ok
        ? {
            ok: true,
            httpStatus: result.value.http.status,
            wire: result.value.wire,
            decoded: codec.toJSON(result.value.data),
            decodedProjection: Object.fromEntries(
              spec.responsePaths.map((path) => [path, decodedAt(result.value.data, path)]),
            ),
          }
        : { ok: false, code: result.error.code };
    const make = (
      options: Readonly<{
        configured?: boolean;
        token?: () => unknown;
        nowMs?: () => number;
        sleepMs?: (ms: number) => Promise<void>;
      }> = {},
    ) =>
      createProtocolClient({
        gatewayBaseUrl: input.gatewayBaseUrl,
        getAccessToken: (options.token ?? (() => input.accessToken)) as () =>
          string | null | Promise<string | null>,
        http: createWechatMiniappHttp(),
        ...(options.configured === false
          ? {}
          : {
              requestContext: {
                productId: input.productId,
                lane: 'matrix-lane',
                appVersion: '1.2.3',
              },
            }),
        runtime: {
          nowMs: options.nowMs ?? (() => Date.now()),
          sleepMs: options.sleepMs ?? (() => new Promise(() => undefined)),
        },
      });
    const call = (
      source = spec.request,
      timeoutMs = input.timeoutMs,
      options?: Parameters<typeof make>[0],
    ) =>
      make(options).request(meta, message(source), {
        deadlineAtMs: (options?.nowMs?.() ?? Date.now()) + timeoutMs,
      });

    const matrix = [];
    for (let index = 0; index < spec.responseCount; index += 1)
      matrix.push(serialize(await call()));
    matrix.push(serialize(await call(spec.sparseRequest, input.timeoutMs, { configured: false })));
    const response = {
      success: serialize(await call()),
      business: serialize(await call()),
      http: serialize(await call()),
      malformed: serialize(await call()),
    };
    const emptyToken = serialize(await call(spec.request, input.timeoutMs, { token: () => '' }));
    const hostError = serialize(
      await call(spec.request, input.timeoutMs, {
        token: () => {
          throw new Error('host');
        },
      }),
    );
    const stopped: Cancellation = { isStopped: () => true, subscribe: () => () => undefined };
    const cancelled = serialize(
      await make().request(meta, message(spec.request), {
        deadlineAtMs: Date.now() + input.timeoutMs,
        cancellation: stopped,
      }),
    );
    const codecRequest = new Proxy(message(spec.request) as object, {
      get() {
        throw new Error('codec');
      },
    });
    const codecError = serialize(
      await make().request(meta, codecRequest, { deadlineAtMs: Date.now() + input.timeoutMs }),
    );
    const beforeContext = serialize(
      await make({ nowMs: () => 10 }).request(meta, message(spec.request), { deadlineAtMs: 10 }),
    );
    const providerTimeout = serialize(
      await make({
        token: () => new Promise<string>(() => undefined),
        nowMs: () => 0,
        sleepMs: async () => undefined,
      }).request(meta, message(spec.request), { deadlineAtMs: 10 }),
    );
    let now = 0;
    const deadlineRequest = new Proxy(message(spec.request) as object, {
      get(target, property, receiver) {
        now = 10;
        return Reflect.get(target, property, receiver);
      },
    });
    const beforeSend = serialize(
      await make({ nowMs: () => now }).request(meta, deadlineRequest, { deadlineAtMs: 5 }),
    );
    let resolveLate!: (value: string) => void;
    const lateToken = new Promise<string>((resolve) => {
      resolveLate = resolve;
    });
    const late = serialize(
      await make({
        token: () => lateToken,
        nowMs: () => 0,
        sleepMs: async () => undefined,
      }).request(meta, message(spec.request), { deadlineAtMs: 10 }),
    );
    resolveLate('late');
    await Promise.resolve();
    const inFlight = serialize(await call(spec.request, 5));
    const network = serialize(await call());
    return {
      matrix,
      response,
      errors: { emptyToken, hostError, cancelled, codecError, network },
      timeouts: { beforeContext, providerTimeout, beforeSend, inFlight, late },
    };
  };

  const suites: Record<string, Awaited<ReturnType<typeof runMethod>>> = {};
  for (const spec of input.methods) suites[spec.name] = await runMethod(spec);
  return { suites };
}
