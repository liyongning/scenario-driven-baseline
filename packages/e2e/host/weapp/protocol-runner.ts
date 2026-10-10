import {
  createProtocolClient,
  createWechatMiniappHttp,
  type Cancellation,
} from '@daqian/template-protocol';
import type { RpcMethodMeta } from '@daqian/template-protocol/generated/std';
// generated IDL 入口模块：宿主按接口名在这些模块的导出里查找 HTTP 方法描述，不写死具体接口名。
// 共享能力（例如 PC-008 的请求头证据）的宿主证据只依赖协议来源，不依赖产品包的消费接口声明。
import * as tradeIdl from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';
// 消费接口声明不经 SDK 根入口导出：宿主按源码读取产品包的声明模块。
import { consumedOperations } from '../../../sdk/src/consumed-operations';

const generatedIdlModules: ReadonlyArray<Record<string, unknown>> = [tradeIdl];

/** 可执行的 HTTP 方法描述；缺方法、路径或请求 codec 由 `asHttpMethod` 判定。 */
type DeclaredMethod = RpcMethodMeta<unknown, unknown>;

/** 方法描述必须是 HTTP 方法：缺失时报错，不静默跳过。 */
function asHttpMethod(name: string, meta: RpcMethodMeta<unknown, unknown>): DeclaredMethod {
  if (!meta.method || !meta.path || !meta.requestCodec)
    throw new Error(`接口 ${name} 的方法描述不是 HTTP 方法`);
  return meta;
}

/**
 * 宿主默认只按产品包的消费接口声明解析接口：声明里的方法描述自带 HTTP 方法与请求/响应 codec，
 * 运行器不写死任何具体接口，新增消费接口时只需改声明与矩阵 Fixture。
 */
function declaredMethod(name: string) {
  const operation = consumedOperations.find((item) => item.method.meta.name === name);
  // 声明里没有该接口时正常结束：宿主只按消费接口声明执行，不因缺少示例路由抛错。
  if (!operation) return undefined;
  return asHttpMethod(name, operation.method.meta);
}

/** 按 generated IDL 解析接口：共享能力的宿主证据不依赖消费接口声明；接口不存在时显式报错。 */
function generatedMethod(name: string): DeclaredMethod {
  for (const module of generatedIdlModules)
    for (const value of Object.values(module)) {
      const meta = (value as { meta?: RpcMethodMeta<unknown, unknown> } | null)?.meta;
      if (meta && meta.name === name) return asHttpMethod(name, meta);
    }
  throw new Error(`generated IDL 中没有接口 ${name}`);
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
  /**
   * 接口来源：`declared`（默认）只按产品包消费接口声明执行，声明为空时正常结束；
   * `generated` 只按 generated IDL 里的 HTTP 方法执行，不读消费接口声明。
   */
  idl?: 'declared' | 'generated';
}>;

/** 最小宿主只装配协议公共入口；网络始终由协议包的真实 wx.request 适配器提供。 */
export async function runProtocolCase(input: ProtocolCaseInput) {
  const meta = declaredMethod(input.name);
  if (!meta) return { ok: false as const, error: { code: 'undeclared-method' } };
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

  const runMethod = async (spec: ProtocolSuiteMethod, meta: DeclaredMethod) => {
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

  // 按用例声明的接口遍历：所选来源里没有该接口的矩阵项被跳过，
  // consumed 声明为空时正常返回空结果集（SCN-008），generated 来源缺接口则显式报错。
  const source = input.idl ?? 'declared';
  const suites: Record<string, Awaited<ReturnType<typeof runMethod>>> = {};
  for (const spec of input.methods) {
    const meta = source === 'generated' ? generatedMethod(spec.name) : declaredMethod(spec.name);
    if (!meta) continue;
    suites[spec.name] = await runMethod(spec, meta);
  }
  return { suites };
}
