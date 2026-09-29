import { createProtocolClient, createWechatMiniappHttp } from '@daqian/payment-protocol';
import { createPaymentClient, type Cancellation, type PaymentOutcome, type PaymentPhaseEvent } from '@daqian/payment-sdk';
import {
  CreateTradePay,
  CreateTradePayRequest,
  CreateTradePayResponse,
  QueryTrade,
  QueryTradeRequest,
  QueryTradeResponse,
} from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';

type ProtocolCaseInput = Readonly<{
  action: 'createTradePay' | 'queryTrade';
  gatewayBaseUrl: string;
  request: Record<string, unknown>;
  accessToken: string;
  requestId: string;
  productId: string;
  timeoutMs: number;
}>;

type ProtocolSuiteInput = ProtocolCaseInput & Readonly<{
  responseCount: number;
  sparseRequest: Record<string, unknown>;
  responsePaths: readonly string[];
}>;

/** 最小宿主只装配协议公共入口；网络始终由协议包的真实 wx.request 适配器提供。 */
export async function runProtocolCase(input: ProtocolCaseInput) {
  const client = createProtocolClient({
    gatewayBaseUrl: input.gatewayBaseUrl,
    getAccessToken: () => input.accessToken,
    http: createWechatMiniappHttp(),
    requestContext: { productId: input.productId },
    runtime: {
      nowMs: () => Date.now(),
      nextRequestId: () => input.requestId,
      sleepMs: () => new Promise(() => undefined),
    },
  });
  const context = { deadlineAtMs: Date.now() + input.timeoutMs };
  if (input.action === 'createTradePay') {
    const result = await client.request(CreateTradePay.meta, CreateTradePayRequest.fromJSON(input.request), context);
    return result.ok
      ? { ok: true, httpStatus: result.value.http.status, wire: result.value.wire, decoded: CreateTradePayResponse.toJSON(result.value.data) }
      : result;
  }
  const result = await client.request(QueryTrade.meta, QueryTradeRequest.fromJSON(input.request), context);
  return result.ok
    ? { ok: true, httpStatus: result.value.http.status, wire: result.value.wire, decoded: QueryTradeResponse.toJSON(result.value.data) }
    : result;
}

/** 单次自动化连接内执行字段矩阵与通信故障；所有发出的请求仍走真实 wx.request。 */
export async function runProtocolSuite(input: ProtocolSuiteInput) {
  const query = input.action === 'queryTrade';
  const meta = query ? QueryTrade.meta : CreateTradePay.meta;
  const codec = query ? QueryTradeResponse : CreateTradePayResponse;
  const message = (source: Record<string, unknown>) => query ? QueryTradeRequest.fromJSON(source) : CreateTradePayRequest.fromJSON(source);
  const camel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const serializable = (value: unknown): unknown => {
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map(serializable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializable(child)]));
    }
    return value;
  };
  const decodedAt = (rootValue: unknown, path: string) => {
    const parts = path.split('.').map(camel);
    let value = rootValue;
    for (let index = 0; index < parts.length; index += 1) {
      if (Array.isArray(value)) value = value[0];
      const part = parts[index]!;
      if (part === 'payParams' && index + 1 < parts.length) {
        const branch = parts[index + 1]!;
        value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
        const params = value && typeof value === 'object' ? (value as Record<string, unknown>).params : undefined;
        if (!params || typeof params !== 'object' || (params as Record<string, unknown>).$case !== branch) return undefined;
        value = (params as Record<string, unknown>)[branch]; index += 1; continue;
      }
      value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
    }
    return serializable(value);
  };
  const serialize = (result: Awaited<ReturnType<ReturnType<typeof createProtocolClient>['request']>>) => result.ok
    ? { ok: true, httpStatus: result.value.http.status, wire: result.value.wire, decoded: codec.toJSON(result.value.data as never), decodedProjection: Object.fromEntries(input.responsePaths.map(path => [path, decodedAt(result.value.data, path)])) }
    : { ok: false, code: result.error.code };
  const make = (options: Readonly<{
    configured?: boolean;
    token?: () => unknown;
    nowMs?: () => number;
    sleepMs?: (ms: number) => Promise<void>;
  }> = {}) => createProtocolClient({
    gatewayBaseUrl: input.gatewayBaseUrl,
    getAccessToken: (options.token ?? (() => input.accessToken)) as () => string | null | Promise<string | null>,
    http: createWechatMiniappHttp(),
    ...(options.configured === false ? {} : { requestContext: { productId: input.productId, lane: 'matrix-lane', appVersion: '1.2.3' } }),
    runtime: {
      nowMs: options.nowMs ?? (() => Date.now()), nextRequestId: () => input.requestId,
      sleepMs: options.sleepMs ?? (() => new Promise(() => undefined)),
    },
  });
  const call = (source = input.request, timeoutMs = input.timeoutMs, options?: Parameters<typeof make>[0]) => make(options).request(
    meta as typeof CreateTradePay.meta, message(source) as CreateTradePayRequest, { deadlineAtMs: (options?.nowMs?.() ?? Date.now()) + timeoutMs },
  );

  const matrix = [];
  for (let index = 0; index < input.responseCount; index += 1) matrix.push(serialize(await call()));
  matrix.push(serialize(await call(input.sparseRequest, input.timeoutMs, { configured: false })));
  const response = {
    success: serialize(await call()), business: serialize(await call()), http: serialize(await call()), malformed: serialize(await call()),
  };
  const emptyToken = serialize(await call(input.request, input.timeoutMs, { token: () => '' }));
  const hostError = serialize(await call(input.request, input.timeoutMs, { token: () => { throw new Error('host'); } }));
  const stopped: Cancellation = { isStopped: () => true, subscribe: () => () => undefined };
  const cancelled = serialize(await make().request(meta as typeof CreateTradePay.meta, message(input.request) as CreateTradePayRequest, { deadlineAtMs: Date.now() + input.timeoutMs, cancellation: stopped }));
  const codecRequest = new Proxy(message(input.request) as object, { get() { throw new Error('codec'); } }) as CreateTradePayRequest;
  const codecError = serialize(await make().request(meta as typeof CreateTradePay.meta, codecRequest, { deadlineAtMs: Date.now() + input.timeoutMs }));
  const beforeContext = serialize(await make({ nowMs: () => 10 }).request(meta as typeof CreateTradePay.meta, message(input.request) as CreateTradePayRequest, { deadlineAtMs: 10 }));
  const providerTimeout = serialize(await make({ token: () => new Promise<string>(() => undefined), nowMs: () => 0, sleepMs: async () => undefined })
    .request(meta as typeof CreateTradePay.meta, message(input.request) as CreateTradePayRequest, { deadlineAtMs: 10 }));
  let now = 0;
  const deadlineRequest = new Proxy(message(input.request) as object, { get(target, property, receiver) { now = 10; return Reflect.get(target, property, receiver); } }) as CreateTradePayRequest;
  const beforeSend = serialize(await make({ nowMs: () => now }).request(meta as typeof CreateTradePay.meta, deadlineRequest, { deadlineAtMs: 5 }));
  let resolveLate!: (value: string) => void;
  const lateToken = new Promise<string>(resolve => { resolveLate = resolve; });
  const late = serialize(await make({ token: () => lateToken, nowMs: () => 0, sleepMs: async () => undefined })
    .request(meta as typeof CreateTradePay.meta, message(input.request) as CreateTradePayRequest, { deadlineAtMs: 10 }));
  resolveLate('late');
  await Promise.resolve();
  const inFlight = serialize(await call(input.request, 5));
  const network = serialize(await call());
  return { matrix, response, errors: { emptyToken, hostError, cancelled, codecError, network }, timeouts: { beforeContext, providerTimeout, beforeSend, inFlight, late } };
}

type PaymentCaseInput = Readonly<{
  gatewayBaseUrl: string;
  tradeNo: string;
  accessToken: string;
  appId: string;
  xpayEnv?: unknown;
  retryXpayEnv?: unknown;
  tradeNos?: readonly string[];
  accessTokens?: readonly (string | null)[];
  policy?: import('@daqian/payment-sdk').PaymentPolicyOverrides;
  caseKey: string;
  channelModes?: readonly ('success' | 'cancel' | 'session' | 'launch-failed' | 'unknown' | 'pending')[];
}>;

function cancellation() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const value: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) { if (stopped) listener(); else listeners.add(listener); return () => listeners.delete(listener); },
  };
  return { value, stop() { if (stopped) return; stopped = true; for (const listener of [...listeners]) listener(); listeners.clear(); } };
}

/** WeApp 验证从 SDK 公共生产入口装配真实 wx.request；只用受控渠道回调替代真实扣款。 */
export async function runPaymentCase(input: PaymentCaseInput) {
  const root = globalThis as typeof globalThis & { wx: unknown };
  const originalWx = root.wx;
  const events: Array<Readonly<{ sequence: number; kind: 'http-request' | 'http-response' | 'http-failure' | 'channel-invoke' | 'channel-callback' | 'phase' | 'outcome'; attemptId?: string; phase?: string; url?: string; reason?: string }>> = [];
  const record = (event: Omit<(typeof events)[number], 'sequence'>) => { events.push({ sequence: events.length, ...event }); };
  const channelModes = [...(input.channelModes ?? ['success'])];
  const channelRecords: Array<Record<string, string>> = [];
  const channelArgumentKeys: string[][] = [];
  const pending: Array<Readonly<{ success(): void; fail(error: unknown): void }>> = [];
  let activeHttpRequests = 0;
  let peakHttpRequests = 0;
  const platform = new Proxy(originalWx as object, { get(target, property, receiver) {
    if (property === 'getDeviceInfo') return () => ({ platform: 'ios' });
    if (property === 'canIUse') return (capability: string) => capability === 'requestVirtualPayment' || Reflect.get(target, property, receiver).call(target, capability);
    if (property === 'request') return (options: Readonly<Record<string, unknown>>) => {
      const request = Reflect.get(target, property, receiver) as (input: Readonly<Record<string, unknown>>) => unknown;
      const url = String(options.url);
      record({ kind: 'http-request', url });
      activeHttpRequests += 1;
      peakHttpRequests = Math.max(peakHttpRequests, activeHttpRequests);
      let completed = false;
      const complete = options.complete as ((...args: unknown[]) => void) | undefined;
      const success = options.success as ((...args: unknown[]) => void) | undefined;
      const fail = options.fail as ((...args: unknown[]) => void) | undefined;
      const finish = (...args: unknown[]) => {
        if (!completed) { completed = true; activeHttpRequests -= 1; }
        complete?.(...args);
      };
      try { return request.call(target, {
        ...options,
        success: (...args: unknown[]) => { record({ kind: 'http-response', url }); success?.(...args); },
        fail: (...args: unknown[]) => { record({ kind: 'http-failure', url }); fail?.(...args); },
        complete: finish,
      }); }
      catch (error) { finish(); throw error; }
    };
    if (property === 'requestVirtualPayment') return (options: Readonly<Record<string, unknown>> & Readonly<{ success(): void; fail(error: unknown): void }>) => {
      channelArgumentKeys.push(Object.keys(options).filter(key => typeof options[key] !== 'function').sort());
      channelRecords.push({ mode: String(options.mode), signData: String(options.signData), paySig: String(options.paySig), signature: String(options.signature) });
      record({ kind: 'channel-invoke' });
      const mode = channelModes.shift() ?? 'success';
      const callbacks = {
        success: () => { record({ kind: 'channel-callback' }); options.success(); },
        fail: (error: unknown) => { record({ kind: 'channel-callback' }); options.fail(error); },
      };
      if (mode === 'pending') pending.push(callbacks);
      else if (mode === 'success') void Promise.resolve().then(callbacks.success);
      else void Promise.resolve().then(() => callbacks.fail({ errCode: mode === 'cancel' ? -2 : mode === 'session' ? -15007 : mode === 'launch-failed' ? -1 : -5 }));
    };
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  root.wx = platform;
  const phases: PaymentPhaseEvent[] = [];
  const outcomes: PaymentOutcome[] = [];
  const settle = async (pendingOutcome: Promise<PaymentOutcome>) => {
    const outcome = await pendingOutcome;
    record({ kind: 'outcome', attemptId: outcome.attemptId, reason: outcome.reason });
    return outcome;
  };
  const track = async (pendingOutcome: Promise<PaymentOutcome>) => { const outcome = await settle(pendingOutcome); outcomes.push(outcome); return outcome; };
  const host = cancellation();
  let secondArmed = false;
  let secondChecks = 0;
  const secondCheck: Cancellation = {
    isStopped() { if (!secondArmed) return false; secondChecks += 1; return secondChecks >= 2; },
    subscribe() { return () => undefined; },
  };
  const accessTokens = [...(input.accessTokens ?? [])];
  let releaseSnapshotToken: (() => void) | undefined;
  const snapshotToken = input.caseKey === 'request-snapshot'
    ? new Promise<string>(resolve => { releaseSnapshotToken = () => resolve(input.accessToken); })
    : undefined;
  const client = createPaymentClient({
    runtime: 'wechat-miniapp', gatewayBaseUrl: input.gatewayBaseUrl, appId: input.appId,
    enabledMethods: ['wechat-miniapp-virtual-goods'], getAccessToken: () => snapshotToken ?? (accessTokens.length > 0 ? accessTokens.shift()! : input.accessToken),
    requestContext: { productId: 'fixture-product', lane: 'fixture-lane', appVersion: '1.0.0' },
    policy: input.policy ?? { observation: { intervalMs: 1, maxWaitMs: 100 }, requestTimeoutMs: 10_000 },
  });
  const request = (xpayEnv: unknown = input.xpayEnv, tradeNo = input.tradeNo, explicitUndefined = false) => ({
    reference: { tradeNo }, method: 'wechat-miniapp-virtual-goods' as const,
    ...(explicitUndefined || Object.prototype.hasOwnProperty.call(input, 'xpayEnv') || xpayEnv !== undefined || input.caseKey === 'explicit-undefined' ? { xpayEnv } : {}),
  } as unknown as import('@daqian/payment-sdk').PaymentRequest);
  const onPhase = (event: PaymentPhaseEvent) => {
    phases.push(event);
    record({ kind: 'phase', attemptId: event.attemptId, phase: event.phase });
    if (input.caseKey === 'stop-before-invoke' && event.phase === 'channel_invoking') host.stop();
    if (input.caseKey === 'stop-after-notification' && event.phase === 'channel_invoking') secondArmed = true;
    if (input.caseKey === 'stop-before-query' && event.phase === 'confirming') host.stop();
    if (input.caseKey === 'handler-throw') throw new Error('fixture-handler');
    if (input.caseKey === 'handler-reject') return Promise.reject(new Error('fixture-handler'));
  };
  try {
    if (input.caseKey === 'empty-token') {
      await track(client.pay(request(), { onPhase }));
      await track(client.pay(request(), { onPhase }));
    } else if (input.caseKey === 'prepare-identity-not-found' || input.caseKey === 'prepare-session-expired') {
      await track(client.pay(request(), { onPhase }));
      await track(client.pay(request(), { onPhase }));
    } else if (input.caseKey === 'observe-only' || input.caseKey === 'query-auth') {
      if (input.caseKey === 'query-auth') await track(client.pay(request(), { onPhase }));
      await track(client.observe({ tradeNo: input.tradeNo }, { onPhase }));
    } else if (input.caseKey === 'native-stop-late-callback' || input.caseKey === 'stop-after-platform' || input.caseKey === 'observe-after-stop') {
      const first = track(client.pay(request(), { onPhase, cancellation: host.value }));
      while (pending.length === 0) await new Promise(resolve => setTimeout(resolve, 0));
      host.stop();
      await first;
      if (input.caseKey === 'observe-after-stop') {
        pending[0]!.success();
        await track(client.observe({ tradeNo: input.tradeNo }, { onPhase }));
      } else if (input.caseKey === 'native-stop-late-callback') {
        const second = track(client.pay(request(input.retryXpayEnv), { onPhase }));
        pending[0]!.success();
        await second;
      } else pending[0]!.success();
    } else if (input.caseKey === 'prepare-auth' || input.caseKey.startsWith('channel-session')) {
      await track(client.pay(request(), { onPhase }));
      await track(client.pay(request(input.retryXpayEnv), { onPhase }));
    } else if (input.caseKey === 'successive-selection') {
      // automator 会把 undefined 编成 null；宿主在同一客户端内构造三次真实输入，第三次省略用于捕获前次 prod 污染。
      const xpayEnvs: readonly unknown[] = ['sandbox', 'prod', undefined];
      const tradeNos = input.tradeNos ?? [`${input.tradeNo}-sandbox`, `${input.tradeNo}-prod`, `${input.tradeNo}-omitted`];
      for (let index = 0; index < xpayEnvs.length; index += 1) {
        await track(client.pay(request(xpayEnvs[index], tradeNos[index]), { onPhase }));
      }
    } else if (input.caseKey === 'flow-omitted') {
      // FLOW-008 omitted 同一 case 连续验证属性省略与 own-property undefined；两者的 wire 都必须缺键。
      const tradeNos = input.tradeNos ?? [`${input.tradeNo}-omitted`, `${input.tradeNo}-explicit-undefined`];
      await track(client.pay(request(undefined, tradeNos[0], false), { onPhase }));
      await track(client.pay(request(undefined, tradeNos[1], true), { onPhase }));
    } else if (input.caseKey === 'request-snapshot') {
      const mutable = request('sandbox') as { xpayEnv: unknown };
      const pendingPay = track(client.pay(mutable as never, { onPhase }));
      mutable.xpayEnv = 'prod';
      releaseSnapshotToken?.();
      while (pending.length === 0) await new Promise(resolve => setTimeout(resolve, 0));
      pending[0]!.success();
      await pendingPay;
    } else if (input.caseKey === 'long-channel-wait') {
      const pendingPay = track(client.pay(request() as never, { onPhase }));
      while (pending.length === 0) await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 20));
      pending[0]!.success();
      await pendingPay;
    } else if (input.caseKey === 'no-listener') {
      await track(client.pay(request()));
    } else {
      if (input.caseKey === 'reentrant-pay') {
        let nested: Promise<PaymentOutcome> | undefined;
        const reentrant = (event: PaymentPhaseEvent) => { phases.push(event); record({ kind: 'phase', attemptId: event.attemptId, phase: event.phase }); if (event.phase === 'channel_invoking') nested = settle(client.pay(request())); };
        await track(client.pay(request(), { onPhase: reentrant }));
        if (nested) outcomes.push(await nested);
      } else await track(client.pay(request(), {
        onPhase,
        ...input.caseKey === 'stop-after-notification' ? { cancellation: secondCheck }
          : input.caseKey === 'stop-before-invoke' || input.caseKey === 'stop-before-query' ? { cancellation: host.value } : {},
      }));
    }
    return { outcomes, phases, events, channelRecords, channelArgumentKeys, platformCalls: channelRecords.length, peakHttpRequests };
  } finally {
    root.wx = originalWx;
  }
}
