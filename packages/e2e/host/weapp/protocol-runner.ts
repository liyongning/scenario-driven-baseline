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

/** 一条矩阵取证请求：请求体与它自己的公共请求上下文（`{}` 表示不配置上下文，PC-01）。 */
type ProtocolSuiteSample = Readonly<{
  request: Record<string, unknown>;
  context: Readonly<Record<string, string>>;
}>;

type ProtocolSuiteMethod = Readonly<{
  name: string;
  /** 基请求：共享证据分支使用；矩阵取证与逐字段省略样例见 samples。 */
  request: Record<string, unknown>;
  /** 矩阵取证请求：每条响应一条、每个声明 omitted 的字段一条逐字段省略样例、一条不配置上下文。 */
  samples: readonly ProtocolSuiteSample[];
}>;

type ProtocolSuiteInput = Readonly<{
  gatewayBaseUrl: string;
  accessToken: string;
  /** 公共请求上下文：写入 BaseReq 与请求头；逐字段省略样例由各自的 context 覆盖。 */
  requestContext: Readonly<Record<string, string>>;
  timeoutMs: number;
  methods: readonly ProtocolSuiteMethod[];
  /**
   * 接口来源：`declared`（默认）只按产品包消费接口声明执行，声明为空时正常结束；
   * `generated` 只按 generated IDL 里的 HTTP 方法执行，不读消费接口声明。
   */
  idl?: 'declared' | 'generated';
}>;

/**
 * 解码结果的 JSON 投影：自动化通道只传 JSON，int64 的 bigint 必须转成十进制字符串。
 * 这里不能用 `codec.toJSON`——它会省略与缺省值相等的字段，于是"解码缺省值"类的证据
 * （例如空响应体解出的 `tradeNo` 应是 `''`）两边都取到 undefined，断言恒真。
 * 因此保留真实解码值（含缺省值），只做 JSON 安全化：`undefined` 键按 proto presence 语义省略。
 */
export function decodedProjection(message: unknown): unknown {
  return JSON.parse(
    JSON.stringify(message, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  );
}

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
        decoded: decodedProjection(result.value.data),
      }
    : result;
}

/** 单次自动化连接内执行整份协议矩阵与通信故障；所有发出的请求仍走真实 wx.request。 */
export async function runProtocolSuite(input: ProtocolSuiteInput) {
  const runMethod = async (spec: ProtocolSuiteMethod, meta: DeclaredMethod) => {
    const message = (source: Record<string, unknown>) => meta.requestCodec!.fromJSON(source);
    // 解码结果按 JSON 投影返回（保留缺省值、oneof 已按选中分支展开、int64 已转字符串），
    // 解码路径的比对由用例侧的共享纯函数按同一口径完成。
    const serialize = (
      result: Awaited<ReturnType<ReturnType<typeof createProtocolClient>['request']>>,
    ) =>
      result.ok
        ? {
            ok: true,
            httpStatus: result.value.http.status,
            wire: result.value.wire,
            decoded: decodedProjection(result.value.data),
          }
        : { ok: false, code: result.error.code };
    const contextOf = (options: Readonly<{ context?: Readonly<Record<string, string>> }>) =>
      options.context ?? input.requestContext;
    const make = (
      options: Readonly<{
        context?: Readonly<Record<string, string>>;
        token?: () => unknown;
        nowMs?: () => number;
        sleepMs?: (ms: number) => Promise<void>;
      }> = {},
    ) => {
      const context = contextOf(options);
      return createProtocolClient({
        gatewayBaseUrl: input.gatewayBaseUrl,
        getAccessToken: (options.token ?? (() => input.accessToken)) as () =>
          string | null | Promise<string | null>,
        http: createWechatMiniappHttp(),
        ...(Object.keys(context).length === 0 ? {} : { requestContext: context }),
        runtime: {
          nowMs: options.nowMs ?? (() => Date.now()),
          sleepMs: options.sleepMs ?? (() => new Promise(() => undefined)),
        },
      });
    };
    const call = (
      source = spec.request,
      timeoutMs = input.timeoutMs,
      options?: Parameters<typeof make>[0],
    ) =>
      make(options).request(meta, message(source), {
        deadlineAtMs: (options?.nowMs?.() ?? Date.now()) + timeoutMs,
      });

    const matrix = [];
    // 逐条发送矩阵取证请求：每条响应一条、每个逐字段省略样例一条、一条不配置上下文。
    for (const sample of spec.samples)
      matrix.push(
        serialize(await call(sample.request, input.timeoutMs, { context: sample.context })),
      );
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
