import { createPaymentClient, type PaymentClientOptions, type PaymentOutcome, type PaymentRequest, type PaymentPhaseEvent } from '@daqian/payment-sdk';
import type { Cancellation } from '@daqian/payment-sdk';

export type HttpPlan = Readonly<{ path: '/api/base/trade/pay' | '/api/base/trade/query'; body?: unknown; delayMs?: number; status?: number; failure?: boolean }>;
export type HttpRecord = Readonly<{ url: string; path: string; body: Readonly<Record<string, unknown>>; headers: Readonly<Record<string, string>>; timeout: number; atMs: number }>;
export type ChannelRecord = Readonly<{ mode: string; signData: string; paySig: string; signature: string }>;
export type PublicClientEvent = Readonly<{
  sequence: number;
  kind: 'phase' | 'http-request' | 'http-response' | 'channel-invoke' | 'channel-callback' | 'terminal';
  attemptId?: string;
  phase?: PaymentPhaseEvent['phase'];
  path?: string;
  body?: Readonly<Record<string, unknown>>;
  headers?: Readonly<Record<string, string>>;
  channel?: ChannelRecord;
  callback?: string;
  outcome?: PaymentOutcome;
}>;

export type PublicClientEventLog = Readonly<{
  events: PublicClientEvent[];
  record(event: Omit<PublicClientEvent, 'sequence'>): void;
}>;

export function createPublicClientEventLog(): PublicClientEventLog {
  const events: PublicClientEvent[] = [];
  return { events, record(event) { events.push({ sequence: events.length, ...event }); } };
}

export type ChannelMode = 'success' | 'cancel' | 'session' | 'launch-failed' | 'unknown' | 'pending';
/** launch-failed 可按 case 指定具体渠道 errCode；字符串形式保持既有 -1 回放。 */
export type ChannelPlan = ChannelMode | Readonly<{ mode: 'launch-failed'; errCode: number; errMsg?: unknown }>;
type PlatformOptions = Readonly<{ http: readonly HttpPlan[]; channel?: readonly ChannelPlan[]; platform?: string; eventLog?: PublicClientEventLog }>;

export function successPrepare(tradeNo: string, marker = tradeNo) {
  return {
    baseResp: { statusCode: '0', success: true }, tradeNo, paymentNo: `payment-${marker}`,
    channel: 'CHANNEL_WECHAT_VIRTUAL', expireTime: '1800000000000',
    payParams: { wechatVirtual: { mode: 'short_series_goods', signData: ` {"marker":"${marker}"} `, paySig: `sig-${marker}`, signature: `signature-${marker}` } },
  };
}

export function successQuery(tradeNo: string, status = 'TRADE_STATUS_PAID') {
  return {
    baseResp: { statusCode: '0', success: true },
    trade: { tradeNo, status, expireTime: '1800000000000' },
  };
}

/** 只替换公开客户端实际访问的微信外部边界；SDK core/backend/codec 保持生产装配。 */
export function installPublicClientPlatform(options: PlatformOptions) {
  const httpPlans = [...options.http];
  const channelPlans = [...(options.channel ?? ['success'])];
  const httpRecords: HttpRecord[] = [];
  const channelRecords: ChannelRecord[] = [];
  const channelArgumentKeys: string[][] = [];
  const pendingChannels: Array<Readonly<{ success(): void; fail(error: unknown): void }>> = [];
  let aborted = 0;
  let inFlight = 0;
  let peakInFlight = 0;

  const platform = {
    getDeviceInfo: () => ({ platform: options.platform ?? 'ios' }),
    canIUse: (capability: string) => capability === 'requestVirtualPayment',
    request(input: Readonly<{
      url: string; header: Readonly<Record<string, string>>; data?: string; timeout: number;
      success(response: unknown): void; fail(): void;
    }>) {
      const plan = httpPlans.shift();
      const path = new URL(input.url).pathname;
      const body = JSON.parse(input.data ?? '{}') as Record<string, unknown>;
      const record = { url: input.url, path, body, headers: { ...input.header }, timeout: input.timeout, atMs: Date.now() };
      httpRecords.push(record);
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      options.eventLog?.record({ kind: 'http-request', path, body, headers: record.headers });
      let cancelled = false;
      let settled = false;
      const settle = () => {
        if (settled) return false;
        settled = true;
        inFlight -= 1;
        return true;
      };
      const deliver = () => {
        if (cancelled || !settle()) return;
        if (!plan || plan.path !== path) { input.fail(); return; }
        if (plan.failure) { input.fail(); return; }
        options.eventLog?.record({ kind: 'http-response', path, body: plan.body as Readonly<Record<string, unknown>> });
        input.success({ statusCode: plan.status ?? 200, header: {}, data: typeof plan.body === 'string' ? plan.body : JSON.stringify(plan.body) });
      };
      if (plan?.delayMs) setTimeout(deliver, plan.delayMs); else queueMicrotask(deliver);
      return { abort() { if (!settled) { cancelled = true; aborted += 1; settle(); } } };
    },
    requestVirtualPayment(input: Readonly<{
      mode: string; signData: string; paySig: string; signature: string;
      success(): void; fail(error: unknown): void;
    }>) {
      channelArgumentKeys.push(Object.keys(input).filter(key => typeof input[key as keyof typeof input] !== 'function').sort());
      const record = { mode: input.mode, signData: input.signData, paySig: input.paySig, signature: input.signature };
      channelRecords.push(record);
      options.eventLog?.record({ kind: 'channel-invoke', channel: record });
      const plan = channelPlans.shift() ?? 'success';
      const mode = typeof plan === 'string' ? plan : plan.mode;
      const launchFailureCode = typeof plan === 'string' ? -1 : plan.errCode;
      const success = () => { options.eventLog?.record({ kind: 'channel-callback', callback: 'success' }); input.success(); };
      const fail = (error: unknown) => { options.eventLog?.record({ kind: 'channel-callback', callback: `fail:${String((error as { errCode?: unknown }).errCode)}` }); input.fail(error); };
      if (mode === 'pending') pendingChannels.push({ success, fail });
      else if (mode === 'success') queueMicrotask(success);
      else if (mode === 'cancel') queueMicrotask(() => fail({ errCode: -2 }));
      else if (mode === 'session') queueMicrotask(() => fail({ errCode: -15007 }));
      else if (mode === 'launch-failed') queueMicrotask(() => fail({
        errCode: launchFailureCode,
        errMsg: typeof plan === 'string' ? 'channel failure must not escape' : plan.errMsg,
      }));
      else queueMicrotask(() => fail({ errCode: -5 }));
    },
  };
  (globalThis as { wx?: unknown }).wx = platform;
  return {
    httpRecords,
    channelRecords,
    channelArgumentKeys,
    pendingChannels,
    remainingHttp: () => httpPlans.length,
    aborted: () => aborted,
    peakHttpInFlight: () => peakInFlight,
    restore: () => { delete (globalThis as { wx?: unknown }).wx; },
  };
}

export function createPublicHarness(options: Partial<PaymentClientOptions> = {}, eventLog?: PublicClientEventLog) {
  const phases: PaymentPhaseEvent[] = [];
  const client = createPaymentClient({
    runtime: 'wechat-miniapp', gatewayBaseUrl: 'https://gateway.fixture.invalid', appId: 'app-fixture',
    enabledMethods: ['wechat-miniapp-virtual-goods'], getAccessToken: () => 'fixture-token',
    requestContext: { productId: 'fixture-product', lane: 'fixture-lane', appVersion: '1.0.0' },
    ...options,
  });
  const pay = async (request: PaymentRequest, withPhases = true): Promise<PaymentOutcome> => {
    const outcome = await client.pay(request, withPhases ? { onPhase: event => {
      phases.push(event);
      eventLog?.record({ kind: 'phase', attemptId: event.attemptId, phase: event.phase });
    } } : undefined);
    eventLog?.record({ kind: 'terminal', attemptId: outcome.attemptId, outcome });
    return outcome;
  };
  return { client, phases, pay };
}

export function createCancellation() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const cancellation: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      if (stopped) listener(); else listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return { cancellation, stop() {
    if (stopped) return;
    stopped = true;
    for (const listener of [...listeners]) listener();
    listeners.clear();
  } };
}
