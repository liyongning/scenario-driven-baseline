import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationContext } from '@daqian/payment-protocol';
import type { Cancellation, DiagnosticEvent, PaymentError, PaymentOutcome, PaymentPolicyOverrides, PaymentRequest, PaymentPhaseEvent, PortResult, RunOptions, TradeReference, TradeSnapshot } from '../contracts';
import type { BackendResult, PaymentBackend, PreparedPayment } from '../ports/backend';
import type { ChannelAdapter, ChannelContext, ChannelInvocation } from '../ports/channel';
import { createDefaultRuntime } from '../runtime/default';
import { createCoreClient } from './client';
import type { CoreClientOptions } from './client';

const method = 'wechat-miniapp-virtual-goods';
const reference = { tradeNo: 'trade-1' };
const request: PaymentRequest = { reference, method };
const cancelled = { ok: false, cancelled: true } as const;
const messages: Readonly<Record<PaymentError['code'], string>> = {
  AUTH_REQUIRED: '登录状态已失效，请重新登录',
  IDENTITY_REQUIRED: '缺少微信支付身份，请先完成绑定',
  CHANNEL_SESSION_REQUIRED: '支付会话已失效，请重新发起支付',
  UNSUPPORTED: '当前环境或支付方式不受支持',
  BUSY: '当前交易正在支付中，请勿重复操作',
  INVALID_INPUT: '支付参数无效',
  HOST_CONTEXT_ERROR: '获取支付上下文失败',
  NETWORK_ERROR: '网络请求失败，请稍后重试',
  PROTOCOL_ERROR: '支付响应格式异常',
  CHANNEL_ERROR: '支付渠道调用失败',
  SERVER_ERROR: '支付服务处理失败',
  CONFLICT: '当前支付操作存在冲突',
  TIMEOUT: '支付请求超时，请稍后确认支付结果',
};
type ErrorDetails = Partial<Omit<PaymentError, 'code' | 'source' | 'message'>>;
function error(code: PaymentError['code'], source: PaymentError['source'] = 'gateway', extra: ErrorDetails = {}): Extract<PortResult<never>, { ok: false }> {
  return { ok: false, error: { code, source, ...extra, message: messages[code] } };
}
function snapshot(state: TradeSnapshot['state'] = 'PAID', ref = reference): BackendResult<TradeSnapshot> {
  return { ok: true, value: { reference: { ...ref }, state, source: 'server', observedAtMs: Date.now(), expiresAtMs: 1 } };
}
function prepared(req = request, paymentNo = 'payment-1'): BackendResult<PreparedPayment> {
  return { ok: true, value: { reference: { ...req.reference }, method: req.method, paymentNo, expiresAtMs: 1,
    payParams: { kind: 'wechat_virtual', mode: 'short_series_goods', signData: ' { "env":0, "fixture":true } ', paySig: 'fixture-pay-sig', signature: 'fixture-signature' } } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function stopping() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const signal: Cancellation = { isStopped: () => stopped, subscribe(listener) {
    listeners.add(listener);
    if (stopped) listener();
    return () => { listeners.delete(listener); };
  } };
  return { signal, listeners, stop(notify = true) { stopped = true; if (notify) for (const listener of [...listeners]) listener(); } };
}
function harness(config: { policy?: PaymentPolicyOverrides; onDiagnostic?: (event: DiagnosticEvent) => void } = {}) {
  const trace: string[] = [];
  const events: PaymentPhaseEvent[] = [];
  const outcomes: PaymentOutcome[] = [];
  let attempt = 0;
  const runtime = { ...createDefaultRuntime(), nextAttemptId: () => `attempt-${++attempt}` };
  const prepare = vi.fn<PaymentBackend['prepare']>(async req => prepared(req));
  const query = vi.fn<PaymentBackend['query']>(async ref => snapshot('PAID', ref));
  const reply = vi.fn<(payment: PreparedPayment, context: ChannelContext) => Promise<PortResult<ChannelInvocation>>>(async () => ({ ok: true, value: { kind: 'signal', signal: 'success_hint' } }));
  const backend: PaymentBackend = {
    prepare(req, context) { trace.push('prepare'); return prepare(req, context); },
    query(ref, context) { trace.push('query'); return query(ref, context); },
  };
  const adapter: ChannelAdapter = { method, available: () => true, async invoke(payment, context) {
    const invokePlatform = reply;
    trace.push('beforeInvoke');
    if (!context.beforeInvoke()) return { ok: true, value: { kind: 'stopped' } };
    trace.push('stop_check');
    if (context.cancellation?.isStopped()) return { ok: true, value: { kind: 'stopped' } };
    trace.push('markInvoked');
    if (!context.markInvoked()) return { ok: true, value: { kind: 'stopped' } };
    // 标记后不再通知、await 或复查停止，直接进入已取得的假平台方法。
    trace.push('channel');
    const result = await invokePlatform(payment, context);
    trace.push('channel_returned');
    return result;
  } };
  const options: CoreClientOptions = { backend, channels: [adapter], enabledMethods: [method], runtime, ...config };
  const factory = createCoreClient;
  const client = factory(options);
  const onPhase = (event: PaymentPhaseEvent) => { events.push(event); trace.push(event.phase); };
  const settle = (promise: Promise<PaymentOutcome>) => promise.then(value => { outcomes.push(value); trace.push(`outcome:${value.reason}`); return value; });
  return { client, options, backend, adapter, prepare, query, reply, runtime, trace, events, outcomes, onPhase, settle, factory };
}
async function flush() { await vi.advanceTimersByTimeAsync(0); }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

describe('CORE-005/006/018: service facts and phase trace', () => {
  it.each(['success_hint', 'unknown'] as const)('keeps %s separate from PAYING and confirms a later PAID after expire_time', async signal => {
    const h = harness();
    h.reply.mockResolvedValue({ ok: true, value: { kind: 'signal', signal } });
    h.query.mockResolvedValueOnce(snapshot('PAYING')).mockResolvedValueOnce(snapshot('PAID'));
    const running = h.settle(h.client.pay(request, { onPhase: h.onPhase }));
    await flush();
    expect(h.outcomes).toEqual([]);
    expect(h.trace).toEqual(['prepare', 'beforeInvoke', 'channel_invoking', 'stop_check', 'markInvoked', 'channel', 'channel_returned', 'confirming', 'query']);
    await vi.advanceTimersByTimeAsync(2999);
    expect(h.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await running;
    expect(result).toMatchObject({ attemptId: 'attempt-1', reason: 'confirmed', channelSignal: signal, paymentNo: 'payment-1', snapshot: { state: 'PAID', source: 'server', reference } });
    expect(h.trace.slice(-2)).toEqual(['query', 'outcome:confirmed']);
    expect(h.events).toEqual([{ attemptId: 'attempt-1', phase: 'channel_invoking' }, { attemptId: 'attempt-1', phase: 'confirming' }]);
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.reply).toHaveBeenCalledTimes(1);
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['PAID', 'CLOSED'] as const)('first %s query still follows confirming without display delay', async state => {
    const h = harness(); h.query.mockResolvedValue(snapshot(state));
    const result = await h.settle(h.client.pay(request, { onPhase: h.onPhase }));
    expect(h.trace).toEqual(['prepare', 'beforeInvoke', 'channel_invoking', 'stop_check', 'markInvoked', 'channel', 'channel_returned', 'confirming', 'query', 'outcome:confirmed']);
    expect(result.snapshot.state).toBe(state);
    expect(Date.now()).toBe(0);
  });
  it('does not cap a silent native call, query early, or consume the later observation budget', async () => {
    const h = harness({ policy: { requestTimeoutMs: 5, observation: { maxWaitMs: 60, intervalMs: 3 } } });
    const channel = deferred<PortResult<ChannelInvocation>>();
    h.reply.mockReturnValue(channel.promise);
    h.query.mockResolvedValue(snapshot('PAYING'));
    const running = h.settle(h.client.pay(request, { onPhase: h.onPhase }));
    await vi.advanceTimersByTimeAsync(120000);
    expect(h.query).toHaveBeenCalledTimes(0); expect(h.outcomes).toEqual([]);
    expect(h.events.map(e => e.phase)).toEqual(['channel_invoking']);
    expect(vi.getTimerCount()).toBe(0);
    channel.resolve({ ok: true, value: { kind: 'signal', signal: 'success_hint' } });
    await flush(); await vi.advanceTimersByTimeAsync(59);
    expect(h.outcomes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await running).toMatchObject({ reason: 'timed_out', channelSignal: 'success_hint', error: { code: 'TIMEOUT', source: 'sdk' }, snapshot: { state: 'PAYING', source: 'server' } });
    expect(h.events.map(e => e.phase)).toEqual(['channel_invoking', 'confirming']);
  });
  it.each(['CREATED', 'PAYING', 'UNKNOWN'] as const)('keeps server %s without synthesizing a terminal state', async state => {
    const h = harness({ policy: { observation: { maxWaitMs: 7, intervalMs: 3 } } });
    h.query.mockResolvedValue(snapshot(state));
    const running = h.client.observe(reference);
    await vi.advanceTimersByTimeAsync(7);
    expect(await running).toMatchObject({ reason: 'timed_out', channelSignal: 'not_invoked', snapshot: { state, source: 'server' } });
    expect(h.query).toHaveBeenCalledTimes(3); expect(h.prepare).toHaveBeenCalledTimes(0); expect(h.reply).toHaveBeenCalledTimes(0);
  });
  it.each([['cancelled', 'channel_cancelled'], ['launch_failed', 'launch_failed']] as const)('ends a %s callback without automatic query', async (signal, reason) => {
    const h = harness(); h.reply.mockResolvedValue({ ok: true, value: { kind: 'signal', signal } });
    expect(await h.settle(h.client.pay(request, { onPhase: h.onPhase }))).toMatchObject({ reason, channelSignal: signal, snapshot: { state: 'UNKNOWN', source: 'unavailable' } });
    expect(h.trace).toEqual(['prepare', 'beforeInvoke', 'channel_invoking', 'stop_check', 'markInvoked', 'channel', 'channel_returned', `outcome:${reason}`]);
    expect(h.query).toHaveBeenCalledTimes(0);
  });
  it.each([{ kind: 'redirect', url: 'https://fixture.invalid' }, { kind: 'qr_code', content: 'fixture-content' }] as const)('hands off future $kind action without claiming native invocation', async action => {
    const h = harness();
    h.adapter.invoke = async () => ({ ok: true, value: { kind: 'action', action } });
    const result = await h.client.pay(request, { onPhase: h.onPhase });
    expect(result).toMatchObject({ reason: 'action_required', channelSignal: 'not_invoked', nextAction: action });
    expect(h.events).toEqual([]); expect(h.query).toHaveBeenCalledTimes(0);
  });
  it('observe and repeated query use only the reference and never prepare/invoke', async () => {
    const h = harness();
    const result = await h.settle(h.client.observe(reference, { onPhase: h.onPhase }));
    expect(result).toMatchObject({ reason: 'confirmed', channelSignal: 'not_invoked' });
    expect(result).not.toHaveProperty('paymentNo');
    expect(h.trace).toEqual(['confirming', 'query', 'outcome:confirmed']);
    expect(await h.client.query(reference)).toMatchObject({ ok: true, value: { state: 'PAID' } });
    expect(await h.client.query(reference)).toMatchObject({ ok: true, value: { state: 'PAID' } });
    expect(h.query).toHaveBeenCalledTimes(3); expect(h.prepare).toHaveBeenCalledTimes(0); expect(h.reply).toHaveBeenCalledTimes(0);
    for (const [ref] of h.query.mock.calls) expect(ref).toEqual(reference);
  });
});

describe('CONTRACT-019/022 and CORE-020: admission, copies and isolation', () => {
  it.each([null, 0, 1, 2, '', 'UNSPECIFIED', 'XPAY_ENV_SANDBOX', 'XPAY_ENV_PROD', 'other'])('rejects xpayEnv=%s before every external action', async xpayEnv => {
    const h = harness();
    const result = await h.client.pay({ ...request, xpayEnv } as PaymentRequest, { onPhase: h.onPhase });
    expect(result).toMatchObject({ reason: 'error', channelSignal: 'not_invoked', error: { code: 'INVALID_INPUT', source: 'sdk' } });
    expect(h.trace).toEqual([]);
  });
  it.each([0, -1, NaN, Infinity, null, '5'])('rejects invalid policy value %s at all leaf fields', async value => {
    for (const policy of [{ requestTimeoutMs: value }, { observation: { intervalMs: value } }, { observation: { maxWaitMs: value } }]) {
      const h = harness();
      const result = await h.client.pay(request, { policy, onPhase: h.onPhase } as RunOptions);
      expect(result).toMatchObject({ reason: 'error', error: { code: 'INVALID_INPUT', source: 'sdk' } }); expect(h.trace).toEqual([]);
      expect(await h.client.observe(reference, { policy } as RunOptions)).toMatchObject({ reason: 'error', error: { code: 'INVALID_INPUT' } });
    }
  });
  it.each([null, {}, { reference: null, method }, { reference: { tradeNo: '' }, method }, { reference: { tradeNo: 2 }, method }, { reference, method: null }, { reference, method: '' }, { reference, method: 4 }])('rejects malformed request %j without external effects', async input => {
    const h = harness();
    expect(await h.client.pay(input as PaymentRequest)).toMatchObject({ reason: 'error', channelSignal: 'not_invoked', error: { code: 'INVALID_INPUT', source: 'sdk' } });
    expect(h.trace).toEqual([]);
  });
  it.each([null, {}, { tradeNo: '' }, { tradeNo: 3 }])('rejects malformed query/observe reference %j', async input => {
    const h = harness();
    expect(await h.client.query(input as TradeReference)).toEqual(error('INVALID_INPUT', 'sdk'));
    expect(await h.client.observe(input as TradeReference)).toMatchObject({ reason: 'error', error: { code: 'INVALID_INPUT' } });
    expect(h.trace).toEqual([]);
  });
  it.each([false, null, 'listener', {}])('rejects onPhase=%j without notifications or requests', async onPhase => {
    const h = harness();
    expect(await h.client.pay(request, { onPhase } as RunOptions)).toMatchObject({ reason: 'error', error: { code: 'INVALID_INPUT' } });
    expect(await h.client.observe(reference, { onPhase } as RunOptions)).toMatchObject({ reason: 'error', error: { code: 'INVALID_INPUT' } });
    expect(h.trace).toEqual([]);
  });
  it.each(['method-not-enabled', 'adapter-missing', 'unavailable'])('rejects %s as unsupported before prepare', async kind => {
    const h = harness();
    const client = h.factory({ ...h.options, ...(kind === 'method-not-enabled' ? { enabledMethods: [] } : kind === 'adapter-missing' ? { channels: [] } : {}) });
    if (kind === 'unavailable') h.adapter.available = () => false;
    expect(await client.pay(request, { onPhase: h.onPhase })).toMatchObject({ reason: 'unsupported', channelSignal: 'not_invoked', error: { code: 'UNSUPPORTED', source: 'sdk' } });
    expect(h.trace).toEqual([]);
  });
  it('does not substitute an unregistered H5 method', async () => {
    const h = harness();
    expect(await h.client.pay({ ...request, method: 'h5' } as unknown as PaymentRequest)).toMatchObject({ reason: 'unsupported' }); expect(h.trace).toEqual([]);
  });
  it('copies reference/method/xpayEnv at admission and keeps consecutive choices separate', async () => {
    const h = harness(); const gate = deferred<void>();
    h.prepare.mockImplementationOnce(async req => { await gate.promise; return prepared(req); });
    const mutable = { reference: { tradeNo: 'trade-1' }, method, xpayEnv: 'sandbox' };
    const running = h.client.pay(mutable as PaymentRequest);
    mutable.reference.tradeNo = 'mutated'; mutable.method = 'mutated'; mutable.xpayEnv = 'prod';
    gate.resolve(); expect(await running).toMatchObject({ reason: 'confirmed', snapshot: { reference } });
    await h.client.pay({ ...request, xpayEnv: 'prod' });
    await h.client.pay(request); await h.client.pay({ ...request, xpayEnv: undefined });
    expect(h.prepare.mock.calls.map(([req]) => req)).toEqual([{ reference, method, xpayEnv: 'sandbox' }, { reference, method, xpayEnv: 'prod' }, request, request]);
    for (const [ref] of h.query.mock.calls) expect(ref).toEqual(reference);
    for (const [payment] of h.reply.mock.calls) expect(payment.payParams.signData).toBe(' { "env":0, "fixture":true } ');
  });
  it('snapshots initialization and per-run policy and callback with undefined preserving earlier fields', async () => {
    const policy = { requestTimeoutMs: 50, observation: { intervalMs: 7, maxWaitMs: 60 } };
    const h = harness({ policy });
    policy.requestTimeoutMs = 999; policy.observation.intervalMs = 999; policy.observation.maxWaitMs = 999;
    const local = { policy: { requestTimeoutMs: undefined, observation: { maxWaitMs: 20, intervalMs: undefined } }, onPhase: h.onPhase };
    const gate = deferred<BackendResult<PreparedPayment>>(); h.prepare.mockReturnValueOnce(gate.promise);
    h.query.mockResolvedValue(snapshot('PAYING'));
    const running = h.client.pay(request, local as unknown as RunOptions);
    local.policy.observation.maxWaitMs = 900; local.onPhase = () => { throw new Error('must not replace the admitted listener'); };
    expect(h.prepare.mock.calls[0]?.[1].deadlineAtMs).toBe(50);
    gate.resolve(prepared()); await flush();
    expect(h.query.mock.calls[0]?.[1].deadlineAtMs).toBe(20);
    await vi.advanceTimersByTimeAsync(19); expect(h.query).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1); expect(await running).toMatchObject({ reason: 'timed_out' });
    expect(h.events.map(e => e.phase)).toEqual(['channel_invoking', 'confirming']);
    h.query.mockResolvedValue(snapshot()); await h.client.query(reference);
    expect(h.query.mock.calls.at(-1)?.[1].deadlineAtMs).toBe(70);
    const next = h.client.observe(reference); await next;
    expect(h.query.mock.calls.at(-1)?.[1].deadlineAtMs).toBe(70);
  });
  it('keeps a per-run request budget separate from concurrent and later calls', async () => {
    const h = harness({ policy: { requestTimeoutMs: 50 } });
    const pending = deferred<BackendResult<PreparedPayment>>(); h.prepare.mockReturnValueOnce(pending.promise);
    const running = h.client.pay(request, { policy: { requestTimeoutMs: 5 } });
    const sibling = h.client.pay({ ...request, reference: { tradeNo: 'trade-2' } });
    expect(h.prepare.mock.calls.map(([, context]) => context.deadlineAtMs)).toEqual([5, 50]);
    expect(await sibling).toMatchObject({ reason: 'confirmed', snapshot: { reference: { tradeNo: 'trade-2' } } });
    await vi.advanceTimersByTimeAsync(5); expect(await running).toMatchObject({ reason: 'timed_out' });
    await h.client.query(reference); expect(h.query.mock.calls.at(-1)?.[1].deadlineAtMs).toBe(55);
    expect(await h.client.pay(request)).toMatchObject({ reason: 'confirmed' });
    expect(h.prepare.mock.calls.at(-1)?.[1].deadlineAtMs).toBe(55);
    pending.resolve(prepared()); await flush();
    expect(h.reply).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
  it('uses a fresh 60000 ms default budget for prepare/query and 3000 ms interval', async () => {
    const h = harness(); h.query.mockResolvedValue(snapshot('PAYING'));
    const running = h.client.pay(request); await flush();
    expect(h.prepare.mock.calls[0]?.[1].deadlineAtMs).toBe(60000);
    expect(h.query.mock.calls[0]?.[1].deadlineAtMs).toBe(60000);
    await vi.advanceTimersByTimeAsync(60000);
    expect(await running).toMatchObject({ reason: 'timed_out' }); expect(h.query).toHaveBeenCalledTimes(20);
    h.query.mockResolvedValue(snapshot()); await h.client.query(reference);
    expect(h.query.mock.calls.at(-1)?.[1].deadlineAtMs).toBe(120000);
  });
  it('keeps active same-trade pay busy even with another valid environment and releases it after stop', async () => {
    const h = harness(); const host = stopping(); const pending = deferred<PortResult<ChannelInvocation>>();
    h.reply.mockReturnValueOnce(pending.promise);
    const old = h.settle(h.client.pay({ ...request, xpayEnv: 'sandbox' }, { cancellation: host.signal, onPhase: h.onPhase }));
    await flush();
    const busy = await h.client.pay({ ...request, xpayEnv: 'prod' }, { onPhase: h.onPhase });
    expect(busy).toMatchObject({ reason: 'busy', channelSignal: 'not_invoked', error: { code: 'BUSY', source: 'sdk' } });
    expect(h.prepare).toHaveBeenCalledTimes(1);
    host.stop(); expect(await old).toMatchObject({ reason: 'stopped', channelSignal: 'unknown' }); expect(host.listeners.size).toBe(0);
    const next = await h.settle(h.client.pay({ ...request, xpayEnv: 'prod' }, { onPhase: h.onPhase }));
    expect(next.reason).toBe('confirmed'); expect(next.attemptId).not.toBe(busy.attemptId);
    const before = [...h.trace]; pending.resolve({ ok: true, value: { kind: 'signal', signal: 'success_hint' } }); await flush();
    expect(h.trace.filter(t => t !== 'channel_returned')).toEqual(before.filter(t => t !== 'channel_returned'));
    expect(h.query).toHaveBeenCalledTimes(1); expect(h.outcomes).toHaveLength(2);
  });
  it('permits different trades and independent clients without a payment history cache', async () => {
    const a = harness(); const b = harness(); const pending = deferred<BackendResult<PreparedPayment>>();
    a.prepare.mockReturnValueOnce(pending.promise);
    const first = a.client.pay(request);
    expect((await a.client.pay({ reference: { tradeNo: 'trade-2' }, method })).reason).toBe('confirmed');
    expect((await b.client.pay(request)).reason).toBe('confirmed');
    pending.resolve(prepared()); await first;
    expect((await a.client.pay(request)).reason).toBe('confirmed'); expect(a.prepare).toHaveBeenCalledTimes(3);
  });
});

describe('CONTRACT-025: cancellation ownership, request isolation and terminal latch', () => {
  it.each(['pay', 'observe'] as const)('%s already stopped has no external calls or phase notifications', async kind => {
    const h = harness(); const host = stopping(); host.stop();
    const result = kind === 'pay' ? await h.client.pay(request, { cancellation: host.signal, onPhase: h.onPhase }) : await h.client.observe(reference, { cancellation: host.signal, onPhase: h.onPhase });
    expect(result).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked', snapshot: { state: 'UNKNOWN', source: 'unavailable' } });
    expect(result).not.toHaveProperty('error'); expect(h.trace).toEqual([]); expect(host.listeners.size).toBe(0);
  });
  it.each(['prepare', 'query'] as const)('%s host stop wins synchronous abort cancellation and later deadline', async phase => {
    const h = harness({ policy: { requestTimeoutMs: 5, observation: { maxWaitMs: 7 } } }); const host = stopping();
    const pending = deferred<BackendResult<never>>(); let cleanup: Cancellation | undefined;
    const responder = (_: unknown, context: OperationContext) => {
      cleanup = context.cancellation;
      context.cancellation?.subscribe(() => { pending.resolve(cancelled); });
      return pending.promise;
    };
    if (phase === 'prepare') h.prepare.mockImplementation(responder); else h.query.mockImplementation(responder);
    const running = h.settle(h.client.pay(request, { cancellation: host.signal })); await flush();
    expect(cleanup).not.toBe(host.signal);
    host.stop();
    const result = await running;
    expect(result).toMatchObject({ reason: 'stopped', channelSignal: phase === 'prepare' ? 'not_invoked' : 'success_hint' });
    expect(result).not.toHaveProperty('error'); expect(cleanup?.isStopped()).toBe(true);
    await vi.advanceTimersByTimeAsync(60000); host.stop();
    expect(h.outcomes).toHaveLength(1); expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.query).toHaveBeenCalledTimes(phase === 'prepare' ? 0 : 1);
    expect(host.listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['prepare', 'query'] as const)('%s deadline locks timed_out before synchronous abort and later host stop', async phase => {
    const h = harness({ policy: { requestTimeoutMs: 5, observation: { maxWaitMs: 5 } } }); const host = stopping();
    const pending = deferred<BackendResult<never>>(); const cleanupStates: boolean[] = [];
    const responder = (_: unknown, context: OperationContext) => {
      context.cancellation?.subscribe(() => { cleanupStates.push(host.signal.isStopped()); pending.resolve(cancelled); host.stop(); });
      return pending.promise;
    };
    if (phase === 'prepare') h.prepare.mockImplementation(responder); else h.query.mockImplementation(responder);
    const running = h.settle(h.client.pay(request, { cancellation: host.signal })); await vi.advanceTimersByTimeAsync(5);
    expect(await running).toMatchObject({ reason: 'timed_out', error: { code: 'TIMEOUT', source: 'sdk' }, channelSignal: phase === 'prepare' ? 'not_invoked' : 'success_hint' });
    expect(cleanupStates).toEqual([false]); host.stop(); await vi.advanceTimersByTimeAsync(500);
    expect(h.outcomes).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['protocol-timeout', 'core-timer', 'cancelled-at-request-deadline'] as const)('%s ends only the 5000 ms query and later confirms within the 60000 ms window', async cause => {
    const h = harness({ policy: { requestTimeoutMs: 5000, observation: { maxWaitMs: 60000, intervalMs: 3000 } } });
    const old = deferred<BackendResult<TradeSnapshot>>(); const second = deferred<BackendResult<TradeSnapshot>>();
    h.query.mockReturnValueOnce(old.promise).mockReturnValueOnce(second.promise);
    const running = h.settle(h.client.observe(reference, { onPhase: h.onPhase })); await flush();
    const firstContext = h.query.mock.calls[0]?.[1]; expect(firstContext?.deadlineAtMs).toBe(5000);
    if (cause === 'protocol-timeout') { vi.setSystemTime(5000); old.resolve(error('TIMEOUT', 'network', { originalCode: 'request:fail timeout' })); await flush(); }
    else if (cause === 'cancelled-at-request-deadline') { vi.setSystemTime(5000); old.resolve(cancelled); await flush(); }
    else await vi.advanceTimersByTimeAsync(5000);
    expect(h.outcomes).toEqual([]); expect(firstContext?.cancellation?.isStopped()).toBe(true);
    await vi.advanceTimersByTimeAsync(2999); expect(h.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(h.query).toHaveBeenCalledTimes(2);
    const secondContext = h.query.mock.calls[1]?.[1];
    expect(secondContext?.deadlineAtMs).toBe(13000);
    expect(secondContext?.cancellation).not.toBe(firstContext?.cancellation); expect(secondContext?.cancellation?.isStopped()).toBe(false);
    // 旧请求已经结束；它迟到的 PAID 不能污染正在等待的第二笔请求或提前结算。
    old.resolve(snapshot('PAID')); await flush(); expect(h.outcomes).toEqual([]);
    second.resolve(snapshot('PAID')); expect(await running).toMatchObject({ reason: 'confirmed', channelSignal: 'not_invoked', snapshot: { state: 'PAID' } });
    expect(h.query).toHaveBeenCalledTimes(2); expect(h.events.map(e => e.phase)).toEqual(['confirming']);
    await vi.advanceTimersByTimeAsync(60000); expect(h.outcomes).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not overlap slow queries and spends interval after request completion', async () => {
    const h = harness({ policy: { requestTimeoutMs: 100, observation: { maxWaitMs: 200, intervalMs: 10 } } });
    const slow = deferred<BackendResult<TradeSnapshot>>(); h.query.mockReturnValueOnce(slow.promise);
    const running = h.client.observe(reference); await vi.advanceTimersByTimeAsync(80);
    expect(h.query).toHaveBeenCalledTimes(1); slow.resolve(snapshot('PAYING')); await flush();
    await vi.advanceTimersByTimeAsync(9); expect(h.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(h.query).toHaveBeenCalledTimes(2); expect((await running).reason).toBe('confirmed');
  });
  it('stops during a retry interval and keeps the last trustworthy snapshot', async () => {
    const h = harness(); const host = stopping(); h.query.mockResolvedValue(snapshot('PAYING'));
    const running = h.client.observe(reference, { cancellation: host.signal }); await flush(); host.stop();
    expect(await running).toMatchObject({ reason: 'stopped', snapshot: { state: 'PAYING', source: 'server' }, channelSignal: 'not_invoked' });
    await vi.advanceTimersByTimeAsync(60000); expect(h.query).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['host-only', 'deadline-only', 'both'] as const)('classifies cancelled by visible %s state when no timer/notification has fired', async visible => {
    const h = harness({ policy: { requestTimeoutMs: 5 } }); const host = stopping();
    h.prepare.mockImplementation(async () => { if (visible !== 'deadline-only') host.stop(false); if (visible !== 'host-only') vi.setSystemTime(5); return cancelled; });
    const result = await h.client.pay(request, { cancellation: host.signal });
    expect(result).toMatchObject({ reason: visible === 'deadline-only' ? 'timed_out' : 'stopped' });
    if (visible === 'deadline-only') expect(result.error).toEqual({ code: 'TIMEOUT', source: 'sdk', message: '支付请求超时，请稍后确认支付结果' }); else expect(result).not.toHaveProperty('error');
    expect(h.reply).toHaveBeenCalledTimes(0);
  });
  it('classifies cancelled at an observation total deadline as timed_out and does not re-query', async () => {
    const h = harness({ policy: { requestTimeoutMs: 50, observation: { maxWaitMs: 5 } } });
    h.query.mockImplementation(async () => { vi.setSystemTime(5); return cancelled; });
    expect(await h.client.observe(reference)).toMatchObject({ reason: 'timed_out', error: { code: 'TIMEOUT', source: 'sdk' } }); expect(h.query).toHaveBeenCalledTimes(1);
  });
  it.each(['prepare', 'query'] as const)('unexpected %s cancellation becomes only NETWORK_ERROR/source=network/CANCELLED', async phase => {
    const h = harness();
    if (phase === 'prepare') { h.prepare.mockResolvedValue(cancelled); expect(await h.client.pay(request)).toMatchObject({ reason: 'error', error: { code: 'NETWORK_ERROR', source: 'network', originalCode: 'CANCELLED' } }); }
    else { h.query.mockResolvedValue(cancelled); expect(await h.client.query(reference)).toEqual(error('NETWORK_ERROR', 'network', { originalCode: 'CANCELLED' })); }
    expect(h.reply).toHaveBeenCalledTimes(0);
  });
  it('unexpected observation cancellation follows network retry, preserving the previous snapshot until PAID', async () => {
    const h = harness(); h.query.mockResolvedValueOnce(snapshot('PAYING')).mockResolvedValueOnce(cancelled).mockResolvedValueOnce(snapshot('PAID'));
    const running = h.settle(h.client.observe(reference)); await vi.advanceTimersByTimeAsync(5999); expect(h.outcomes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); expect((await running).reason).toBe('confirmed'); expect(h.query).toHaveBeenCalledTimes(3);
  });
  it.each(['timer', 'cancelled'] as const)('public query %s deadline returns existing PortResult TIMEOUT only', async cause => {
    const h = harness({ policy: { requestTimeoutMs: 5 } }); const pending = deferred<BackendResult<TradeSnapshot>>(); h.query.mockReturnValue(pending.promise);
    const running = h.client.query(reference);
    if (cause === 'timer') await vi.advanceTimersByTimeAsync(5); else { vi.setSystemTime(5); pending.resolve(cancelled); }
    expect(await running).toEqual(error('TIMEOUT', 'sdk'));
    pending.resolve(snapshot('PAID')); await flush(); expect(h.query).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('accepts a received PAID/CLOSED before checking the deadline in the same response turn', async () => {
    for (const state of ['PAID', 'CLOSED'] as const) {
      vi.setSystemTime(0); const h = harness({ policy: { observation: { maxWaitMs: 5 } } });
      h.query.mockImplementation(async () => { vi.setSystemTime(5); return snapshot(state); });
      expect(await h.client.observe(reference)).toMatchObject({ reason: 'confirmed', snapshot: { state } }); expect(vi.getTimerCount()).toBe(0);
    }
  });
  it('does not allow late cancelled, response or host stop to overwrite confirmed', async () => {
    const h = harness(); const host = stopping(); const old = deferred<BackendResult<TradeSnapshot>>();
    h.query.mockReturnValueOnce(old.promise);
    const running = h.settle(h.client.observe(reference, { cancellation: host.signal })); old.resolve(snapshot());
    expect((await running).reason).toBe('confirmed'); old.resolve(cancelled); host.stop(); await vi.advanceTimersByTimeAsync(60000);
    expect(h.outcomes).toHaveLength(1); expect(h.outcomes[0]?.reason).toBe('confirmed'); expect(host.listeners.size).toBe(0);
  });
  it('checks elapsed total time after a suspended interval and never catches up missed polls', async () => {
    const h = harness({ policy: { observation: { maxWaitMs: 50, intervalMs: 10 } } }); h.query.mockResolvedValue(snapshot('PAYING'));
    const running = h.client.observe(reference); await flush(); vi.setSystemTime(500); await vi.advanceTimersByTimeAsync(10);
    expect((await running).reason).toBe('timed_out'); expect(h.query).toHaveBeenCalledTimes(1);
  });
  it('cleans provider waits at prepare timeout and ignores the provider response arriving later', async () => {
    const h = harness({ policy: { requestTimeoutMs: 5 } }); const provider = deferred<BackendResult<PreparedPayment>>(); h.prepare.mockReturnValue(provider.promise);
    const running = h.settle(h.client.pay(request)); await vi.advanceTimersByTimeAsync(5);
    expect(await running).toMatchObject({ reason: 'timed_out', snapshot: { state: 'UNKNOWN', source: 'unavailable' } });
    provider.resolve(prepared()); await flush(); expect(h.reply).toHaveBeenCalledTimes(0); expect(h.outcomes).toHaveLength(1);
  });
});

describe('CORE-019/CONTRACT-020: observer isolation and stop boundaries', () => {
  it('stop-after-notification keeps not_invoked when the adapter second stop check wins before its Promise returns', async () => {
    const h = harness(); const host = stopping();
    const cancellation: Cancellation = { subscribe: host.signal.subscribe, isStopped() {
      if (h.trace.at(-1) === 'stop_check') host.stop();
      return host.signal.isStopped();
    } };
    const running = h.settle(h.client.pay(request, { cancellation, onPhase: h.onPhase }));
    expect(await running).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked' });
    expect(h.trace).toEqual(['prepare', 'beforeInvoke', 'channel_invoking', 'stop_check', 'outcome:stopped']);
    expect(h.reply).toHaveBeenCalledTimes(0); expect(h.query).toHaveBeenCalledTimes(0); expect(host.listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(60000); expect(h.outcomes).toHaveLength(1); expect(h.events).toHaveLength(1);
  });
  it('stop-after-platform keeps unknown and ignores the old callback while a new run is waiting', async () => {
    const h = harness(); const host = stopping();
    const old = deferred<PortResult<ChannelInvocation>>(); const next = deferred<PortResult<ChannelInvocation>>(); let context: ChannelContext | undefined;
    h.reply.mockImplementationOnce((_, value) => { context = value; return old.promise; }).mockReturnValueOnce(next.promise);
    const first = h.settle(h.client.pay(request, { cancellation: host.signal, onPhase: h.onPhase })); await flush();
    expect(h.reply).toHaveBeenCalledTimes(1);
    expect(h.trace).toEqual(['prepare', 'beforeInvoke', 'channel_invoking', 'stop_check', 'markInvoked', 'channel']);
    host.stop(); expect(await first).toMatchObject({ reason: 'stopped', channelSignal: 'unknown' });
    expect(h.query).toHaveBeenCalledTimes(0); expect(h.outcomes).toHaveLength(1);
    const second = h.settle(h.client.pay(request, { onPhase: h.onPhase })); await flush();
    expect(context?.markInvoked()).toBe(false); expect(context?.beforeInvoke()).toBe(false);
    old.resolve({ ok: true, value: { kind: 'signal', signal: 'success_hint' } }); await flush();
    expect(h.query).toHaveBeenCalledTimes(0); expect(h.events.map(event => event.phase)).toEqual(['channel_invoking', 'channel_invoking']);
    expect(h.outcomes).toHaveLength(1);
    next.resolve({ ok: true, value: { kind: 'signal', signal: 'success_hint' } });
    expect(await second).toMatchObject({ reason: 'confirmed', channelSignal: 'success_hint' });
    expect(h.reply).toHaveBeenCalledTimes(2); expect(h.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000); expect(h.outcomes).toHaveLength(2); expect(host.listeners.size).toBe(0);
  });
  it('rejects markInvoked before notification and leaves an uninvoked run unchanged', async () => {
    const h = harness(); const host = stopping(); const pending = deferred<PortResult<ChannelInvocation>>(); let context: ChannelContext | undefined;
    h.adapter.invoke = (_, value) => { context = value; return pending.promise; };
    const running = h.settle(h.client.pay(request, { cancellation: host.signal, onPhase: h.onPhase })); await flush();
    expect(context?.markInvoked).toBeTypeOf('function'); expect(context?.markInvoked()).toBe(false);
    expect(h.events).toEqual([]); expect(h.reply).toHaveBeenCalledTimes(0); expect(h.outcomes).toEqual([]);
    host.stop(); expect(await running).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked' });
    pending.resolve({ ok: true, value: { kind: 'stopped' } }); await flush(); expect(h.outcomes).toHaveLength(1); expect(h.query).toHaveBeenCalledTimes(0);
  });
  it('rejects markInvoked during notification before beforeInvoke has returned true', async () => {
    const h = harness(); const invoke = h.adapter.invoke; let context: ChannelContext | undefined; const attempts: boolean[] = [];
    h.adapter.invoke = (payment, value) => { context = value; return invoke(payment, value); };
    const result = await h.client.pay(request, { onPhase(event) {
      h.onPhase(event); if (event.phase === 'channel_invoking') attempts.push(context!.markInvoked());
    } });
    expect(attempts).toEqual([false]); expect(result).toMatchObject({ reason: 'confirmed', channelSignal: 'success_hint' });
    expect(h.reply).toHaveBeenCalledTimes(1); expect(h.query).toHaveBeenCalledTimes(1); expect(h.events).toHaveLength(2);
  });
  it('rejects markInvoked when a silent host stop occurs after beforeInvoke admission', async () => {
    const h = harness(); const host = stopping(); const pending = deferred<PortResult<ChannelInvocation>>(); let context: ChannelContext | undefined;
    h.adapter.invoke = (_, value) => { context = value; return pending.promise; };
    const running = h.settle(h.client.pay(request, { cancellation: host.signal, onPhase: h.onPhase })); await flush();
    expect(context?.beforeInvoke()).toBe(true); host.stop(false);
    expect(context?.markInvoked).toBeTypeOf('function'); expect(context?.markInvoked()).toBe(false);
    expect(await running).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked' });
    expect(context?.beforeInvoke()).toBe(false); expect(context?.markInvoked()).toBe(false);
    expect(h.events).toHaveLength(1); expect(h.reply).toHaveBeenCalledTimes(0); expect(h.query).toHaveBeenCalledTimes(0);
    pending.resolve({ ok: true, value: { kind: 'stopped' } }); await flush(); expect(h.outcomes).toHaveLength(1);
  });
  it.each([true, false])('marks once with onPhase=%s and refuses duplicate invocation permission while waiting', async listener => {
    const h = harness(); const host = stopping(); const pending = deferred<PortResult<ChannelInvocation>>(); let context: ChannelContext | undefined;
    h.reply.mockImplementation((_, value) => { context = value; return pending.promise; });
    const running = h.client.pay(request, { cancellation: host.signal, ...(listener ? { onPhase: h.onPhase } : {}) }); await flush();
    expect(h.reply).toHaveBeenCalledTimes(1); expect(context?.markInvoked()).toBe(false); expect(context?.beforeInvoke()).toBe(false);
    expect(h.events).toHaveLength(listener ? 1 : 0); expect(h.query).toHaveBeenCalledTimes(0);
    host.stop(); expect(await running).toMatchObject({ reason: 'stopped', channelSignal: 'unknown' });
    pending.resolve({ ok: true, value: { kind: 'stopped' } }); await flush(); expect(h.reply).toHaveBeenCalledTimes(1);
  });
  it('grants markInvoked only once when the host stop read synchronously reenters the marker', async () => {
    const h = harness(); const platform = vi.fn(); const grants: boolean[] = [];
    let context: ChannelContext | undefined; let atMark = false; let reentered = false;
    const cancellation: Cancellation = { subscribe: () => () => {}, isStopped() {
      if (atMark && !reentered) {
        reentered = true;
        const admitted = context!.markInvoked();
        if (admitted) platform();
        grants.push(admitted);
      }
      return false;
    } };
    h.adapter.invoke = async (_, value) => {
      context = value;
      if (!value.beforeInvoke() || value.cancellation?.isStopped()) return { ok: true, value: { kind: 'stopped' } };
      atMark = true;
      const admitted = value.markInvoked();
      if (admitted) platform();
      grants.push(admitted);
      return { ok: true, value: { kind: 'stopped' } };
    };
    expect(await h.client.pay(request, { cancellation, onPhase: h.onPhase })).toMatchObject({ reason: 'stopped', channelSignal: 'unknown' });
    expect(grants).toEqual([true, false]); expect(platform).toHaveBeenCalledTimes(1); expect(h.events).toHaveLength(1); expect(h.query).toHaveBeenCalledTimes(0);
  });
  it('rejects an admitted but unmarked old run while the next run awaits its platform callback', async () => {
    const h = harness(); const invoke = h.adapter.invoke; const host = stopping();
    const old = deferred<PortResult<ChannelInvocation>>(); const next = deferred<PortResult<ChannelInvocation>>(); let context: ChannelContext | undefined;
    h.adapter.invoke = (_, value) => { context = value; value.beforeInvoke(); return old.promise; };
    const first = h.settle(h.client.pay(request, { cancellation: host.signal, onPhase: h.onPhase })); await flush();
    host.stop(); expect(await first).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked' });
    h.adapter.invoke = invoke; h.reply.mockReturnValueOnce(next.promise);
    const second = h.settle(h.client.pay(request, { onPhase: h.onPhase })); await flush();
    expect(context?.markInvoked()).toBe(false); expect(context?.beforeInvoke()).toBe(false);
    old.resolve({ ok: true, value: { kind: 'stopped' } }); await flush();
    expect(h.outcomes).toHaveLength(1); expect(h.events).toHaveLength(2); expect(h.query).toHaveBeenCalledTimes(0); expect(h.reply).toHaveBeenCalledTimes(1);
    next.resolve({ ok: true, value: { kind: 'signal', signal: 'success_hint' } });
    expect(await second).toMatchObject({ reason: 'confirmed', channelSignal: 'success_hint' }); expect(h.query).toHaveBeenCalledTimes(1);
  });
  it.each(['channel_invoking', 'confirming'] as const)('stops inside %s before the next external action', async phase => {
    const h = harness(); const host = stopping();
    const result = await h.client.pay(request, { cancellation: host.signal, onPhase(event) { h.onPhase(event); if (event.phase === phase) host.stop(); } });
    expect(result).toMatchObject({ reason: 'stopped', channelSignal: phase === 'channel_invoking' ? 'not_invoked' : 'success_hint' });
    expect(h.reply).toHaveBeenCalledTimes(phase === 'channel_invoking' ? 0 : 1); expect(h.query).toHaveBeenCalledTimes(0);
    expect(h.events.map(e => e.phase)).toEqual(phase === 'channel_invoking' ? ['channel_invoking'] : ['channel_invoking', 'confirming']);
  });
  it('observe confirming can stop before the first backend/provider call', async () => {
    const h = harness(); const host = stopping();
    expect(await h.client.observe(reference, { cancellation: host.signal, onPhase() { host.stop(); } })).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked' }); expect(h.query).toHaveBeenCalledTimes(0);
  });
  it.each(['throw', 'reject', 'thenable', 'late-reject'] as const)('isolates %s from each notification without unhandled rejection or diagnostic leak', async failure => {
    const diagnostic = vi.fn(); const h = harness({ onDiagnostic: diagnostic }); const late = deferred<void>();
    const result = await h.client.pay(request, { onPhase(event) {
      h.onPhase(event);
      if (failure === 'throw') throw new Error('fixture-private-observer-error');
      if (failure === 'reject') return Promise.reject(new Error('fixture-private-observer-error'));
      if (failure === 'thenable') return { then(_resolve: unknown, reject: (reason: Error) => void) { reject(new Error('fixture-private-observer-error')); } } as unknown as void;
      return late.promise;
    } });
    expect(result.reason).toBe('confirmed'); expect(h.events).toHaveLength(2); expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.query).toHaveBeenCalledTimes(1);
    if (failure === 'late-reject') late.reject(new Error('fixture-private-observer-error')); await flush(); expect(diagnostic).toHaveBeenCalledTimes(0);
  });
  it('fixes the observation deadline before a slow synchronous confirming listener', async () => {
    const h = harness({ policy: { observation: { maxWaitMs: 5 } } });
    const result = await h.client.pay(request, { onPhase(event) { h.onPhase(event); if (event.phase === 'confirming') vi.setSystemTime(6); } });
    expect(result).toMatchObject({ reason: 'timed_out', channelSignal: 'success_hint', error: { code: 'TIMEOUT', source: 'sdk' } }); expect(h.query).toHaveBeenCalledTimes(0);
  });
  it('notification reentry stays busy and event mutation does not change the result identity', async () => {
    const h = harness(); const reentered: Promise<PaymentOutcome>[] = [];
    const result = await h.client.pay(request, { onPhase(event) {
      h.onPhase(event); reentered.push(h.client.pay(request));
      (event as { attemptId: string }).attemptId = 'mutated';
    } });
    expect(result.attemptId).toBe('attempt-1'); expect(result.reason).toBe('confirmed');
    expect((await Promise.all(reentered)).map(r => r.reason)).toEqual(['busy', 'busy']); expect(h.prepare).toHaveBeenCalledTimes(1);
  });
  it('de-duplicates repeated beforeInvoke calls and rejects an old callback during a new run', async () => {
    const h = harness(); const first = deferred<PortResult<ChannelInvocation>>(); const host = stopping(); let old: ChannelContext | undefined;
    h.reply.mockImplementationOnce(async (_, context) => { old = context; context.beforeInvoke(); context.beforeInvoke(); return first.promise; });
    const running = h.client.pay(request, { cancellation: host.signal, onPhase: h.onPhase }); await flush();
    expect(h.events).toHaveLength(1); host.stop(); await running;
    const next = await h.client.pay(request, { onPhase: h.onPhase }); expect(next.reason).toBe('confirmed');
    expect(old?.beforeInvoke()).toBe(false); first.resolve({ ok: true, value: { kind: 'signal', signal: 'unknown' } }); await flush();
    expect(h.events).toHaveLength(3); expect(h.query).toHaveBeenCalledTimes(1);
  });
  it.each(['throw', 'reject'] as const)('isolates diagnostic %s and delivers only sanitized error fields', async failure => {
    const events: DiagnosticEvent[] = [];
    const h = harness({ onDiagnostic(event) { events.push(event); if (failure === 'throw') throw new Error('fixture-secret'); return Promise.reject(new Error('fixture-secret')); } });
    h.prepare.mockResolvedValue(error('PROTOCOL_ERROR', 'gateway', { originalCode: 'fixture-code' }));
    const result = await h.settle(h.client.pay(request)); await flush();
    expect(result).toMatchObject({ reason: 'error', error: { code: 'PROTOCOL_ERROR', source: 'gateway', originalCode: 'fixture-code' } });
    expect(events).toEqual([{ attemptId: 'attempt-1', phase: 'prepare', code: 'PROTOCOL_ERROR', originalCode: 'fixture-code' }]); expect(h.outcomes).toHaveLength(1);
  });
});

const identityCases = [
  ['AUTH_REQUIRED', 'auth_required'], ['IDENTITY_REQUIRED', 'identity_required'], ['CHANNEL_SESSION_REQUIRED', 'channel_session_required'],
] as const;
describe('CONTRACT-004/013: exact identity interruptions and explicit recovery', () => {
  it.each(identityCases)('prepare %s ends once, and only an explicit pay obtains new parameters', async (code, reason) => {
    const h = harness(); h.prepare.mockResolvedValueOnce(error(code, 'gateway', { originalCode: 'fixture-identity' }));
    const result = await h.client.pay({ ...request, xpayEnv: 'sandbox' });
    expect(result).toMatchObject({ reason, interruptedPhase: 'prepare', channelSignal: 'not_invoked', snapshot: { reference, state: 'UNKNOWN', source: 'unavailable' }, error: { code } });
    expect(result).not.toHaveProperty('paymentNo'); await vi.advanceTimersByTimeAsync(60000); expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.reply).toHaveBeenCalledTimes(0);
    expect((await h.client.pay({ ...request, xpayEnv: 'sandbox' })).reason).toBe('confirmed');
    expect(h.prepare).toHaveBeenCalledTimes(2); expect(h.prepare.mock.calls.map(([req]) => req.xpayEnv)).toEqual(['sandbox', 'sandbox']);
  });
  it.each(identityCases)('query %s retains facts and recovery only queries the original trade', async (code, reason) => {
    const h = harness(); h.query.mockResolvedValueOnce(snapshot('PAYING')).mockResolvedValueOnce(error(code, 'gateway', { originalCode: 'fixture-identity' }));
    const running = h.client.pay({ ...request, xpayEnv: 'prod' }); await vi.advanceTimersByTimeAsync(3000);
    expect(await running).toMatchObject({ reason, interruptedPhase: 'query', paymentNo: 'payment-1', channelSignal: 'success_hint', snapshot: { reference, state: 'PAYING', source: 'server' }, error: { code } });
    await vi.advanceTimersByTimeAsync(60000); expect(h.query).toHaveBeenCalledTimes(2);
    expect(await h.client.query(reference)).toMatchObject({ ok: true, value: { state: 'PAID' } });
    expect(await h.client.observe(reference)).toMatchObject({ reason: 'confirmed', channelSignal: 'not_invoked' });
    expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.reply).toHaveBeenCalledTimes(1); for (const [ref] of h.query.mock.calls) expect(ref).toEqual(reference);
  });
  it.each(['payment-1', 'payment-2'])('invoke session recovery uses the new complete response with %s and never reuses PreparedPayment', async paymentNo => {
    const h = harness(); h.reply.mockResolvedValueOnce(error('CHANNEL_SESSION_REQUIRED', 'channel', { originalCode: '-15007' }));
    const result = await h.client.pay({ ...request, xpayEnv: 'sandbox' }, { onPhase: h.onPhase });
    expect(result).toMatchObject({ reason: 'channel_session_required', interruptedPhase: 'invoke', channelSignal: 'launch_failed', paymentNo: 'payment-1', snapshot: { state: 'UNKNOWN', source: 'unavailable' } });
    expect(h.events.map(e => e.phase)).toEqual(['channel_invoking']); expect(h.query).toHaveBeenCalledTimes(0);
    const fresh = prepared(request, paymentNo); if (!fresh.ok) throw new Error('fixture');
    const changed = { ...fresh.value, payParams: { ...fresh.value.payParams, signature: 'fixture-refreshed-signature' } };
    h.prepare.mockResolvedValueOnce({ ok: true, value: changed });
    expect((await h.client.pay({ ...request, xpayEnv: 'sandbox' })).reason).toBe('confirmed');
    expect(h.reply.mock.calls[1]?.[0]).toEqual(changed); expect(h.prepare).toHaveBeenCalledTimes(2);
    expect(h.prepare.mock.calls.map(([req]) => req.xpayEnv)).toEqual(['sandbox', 'sandbox']);
  });
  it.each(['HOST_CONTEXT_ERROR', 'PROTOCOL_ERROR', 'SERVER_ERROR', 'CONFLICT', 'CHANNEL_ERROR'] as const)('does not retry prepare %s even when retryable is true', async code => {
    const h = harness(); h.prepare.mockResolvedValue(error(code, 'gateway', { retryable: true }));
    expect(await h.client.pay(request)).toMatchObject({ reason: 'error', error: { code, retryable: true } });
    expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.reply).toHaveBeenCalledTimes(0); expect(h.query).toHaveBeenCalledTimes(0);
  });
  it.each(['HOST_CONTEXT_ERROR', 'PROTOCOL_ERROR', 'CONFLICT', 'CHANNEL_ERROR'] as const)('query %s is a definite error and preserves previous facts', async code => {
    const h = harness(); h.query.mockResolvedValueOnce(snapshot('PAYING')).mockResolvedValueOnce(error(code));
    const running = h.client.observe(reference); await vi.advanceTimersByTimeAsync(3000);
    expect(await running).toMatchObject({ reason: 'error', snapshot: { state: 'PAYING' }, error: { code } }); expect(h.query).toHaveBeenCalledTimes(2);
  });
  it('prepare protocol TIMEOUT keeps its exact network source', async () => {
    const h = harness(); h.prepare.mockResolvedValue(error('TIMEOUT', 'network', { originalCode: 'fixture-timeout' }));
    expect(await h.client.pay(request)).toMatchObject({ reason: 'timed_out', error: { code: 'TIMEOUT', source: 'network', originalCode: 'fixture-timeout' } });
  });
  it.each(['throw', 'reject'] as const)('normalizes backend %s and retries only observation network failure', async kind => {
    const h = harness();
    const fail = () => { if (kind === 'throw') throw new Error('fixture-private-backend'); return Promise.reject(new Error('fixture-private-backend')); };
    h.prepare.mockImplementationOnce(fail); expect(await h.client.pay(request)).toMatchObject({ reason: 'error', error: { code: 'NETWORK_ERROR', source: 'network' } });
    h.query.mockImplementationOnce(fail); const running = h.client.observe(reference); await vi.advanceTimersByTimeAsync(3000);
    expect((await running).reason).toBe('confirmed'); expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.query).toHaveBeenCalledTimes(2);
  });
  it.each(['throw', 'reject', 'port-error'] as const)('normalizes invoke %s without leaking an exception or querying', async kind => {
    const h = harness(); h.reply.mockImplementation(() => {
      if (kind === 'throw') throw new Error('fixture-private-channel');
      return kind === 'reject' ? Promise.reject(new Error('fixture-private-channel')) : Promise.resolve(error('CHANNEL_ERROR', 'channel'));
    });
    const outcome = await h.client.pay(request);
    expect(outcome).toMatchObject({ reason: 'launch_failed', channelSignal: 'launch_failed', error: { code: 'CHANNEL_ERROR', source: 'channel' } });
    expect(outcome.error).not.toHaveProperty('originalCode'); expect(h.query).toHaveBeenCalledTimes(0);
  });
  it('adapter validation error precedes beforeInvoke and has no phase notification', async () => {
    const h = harness(); h.adapter.invoke = async () => error('PROTOCOL_ERROR', 'channel');
    expect(await h.client.pay(request, { onPhase: h.onPhase })).toMatchObject({ reason: 'error', channelSignal: 'not_invoked' }); expect(h.events).toEqual([]); expect(h.query).toHaveBeenCalledTimes(0);
  });
});

describe('late invocation boundary and defensive lifecycle cleanup', () => {
  it('refuses a late beforeInvoke after confirming has started and preserves success_hint', async () => {
    const h = harness(); const pending = deferred<BackendResult<TradeSnapshot>>(); let context: ChannelContext | undefined;
    h.reply.mockImplementation(async (_, value) => { context = value; return { ok: true, value: { kind: 'signal', signal: 'success_hint' } }; });
    h.query.mockReturnValue(pending.promise);
    const running = h.client.pay(request, { onPhase: h.onPhase }); await flush();
    expect(context?.beforeInvoke()).toBe(false);
    expect(context?.markInvoked()).toBe(false);
    pending.resolve(snapshot()); expect(await running).toMatchObject({ reason: 'confirmed', channelSignal: 'success_hint' }); expect(h.events).toHaveLength(2);
  });
  it.each([null, false, 3, 'policy', { observation: null }, { observation: false }])('rejects malformed policy container %j', async policy => {
    const h = harness();
    expect(await h.client.pay(request, { policy } as RunOptions)).toMatchObject({ reason: 'error', error: { code: 'INVALID_INPUT' } }); expect(h.trace).toEqual([]);
  });
  it('rejects unvalidated internal base policy before any provider call', async () => {
    const h = harness({ policy: { requestTimeoutMs: 0 } });
    expect(await h.client.pay(request)).toMatchObject({ reason: 'error', error: { code: 'INVALID_INPUT' } });
    expect(await h.client.query(reference)).toEqual(error('INVALID_INPUT', 'sdk')); expect(h.trace).toEqual([]);
  });
  it.each(['pay', 'observe'] as const)('%s handles synchronous subscription stop and ignores duplicate stale notifications', async kind => {
    const h = harness(); let stopped = false; let old: (() => void) | undefined; let detached = 0;
    const cancellation = { isStopped: () => stopped, subscribe(listener: () => void) { old = listener; stopped = true; listener(); return () => { detached++; }; } };
    const running = kind === 'pay' ? h.client.pay(request, { cancellation }) : h.client.observe(reference, { cancellation });
    const result = await h.settle(running); old?.(); old?.(); await vi.advanceTimersByTimeAsync(60000);
    expect(result.reason).toBe('stopped'); expect(h.outcomes).toHaveLength(1); expect(detached).toBe(1); expect(h.trace).toEqual(['outcome:stopped']);
  });
  it('rejects a late prepare success when its request budget is already consumed', async () => {
    const h = harness({ policy: { requestTimeoutMs: 5 } }); h.prepare.mockImplementation(async () => { vi.setSystemTime(5); return prepared(); });
    expect(await h.client.pay(request)).toMatchObject({ reason: 'timed_out', error: { code: 'TIMEOUT', source: 'sdk' }, channelSignal: 'not_invoked' }); expect(h.reply).toHaveBeenCalledTimes(0);
  });
  it.each([
    ['AUTH_REQUIRED', 'gateway', 5], ['AUTH_REQUIRED', 'gateway', 6],
    ['NETWORK_ERROR', 'network', 5], ['NETWORK_ERROR', 'network', 6],
  ] as const)('ends a late prepare %s/%s at %i ms as SDK timeout before the timer is dispatched', async (code, source, now) => {
    const h = harness({ policy: { requestTimeoutMs: 5 } });
    h.prepare.mockImplementation(async () => { vi.setSystemTime(now); return error(code, source); });
    const result = await h.settle(h.client.pay(request, { onPhase: h.onPhase }));
    expect(result).toMatchObject({ reason: 'timed_out', error: { code: 'TIMEOUT', source: 'sdk' }, channelSignal: 'not_invoked' });
    expect(result).not.toHaveProperty('interruptedPhase');
    expect(h.trace).toEqual(['prepare', 'outcome:timed_out']);
    expect(h.reply).toHaveBeenCalledTimes(0); expect(h.query).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(60000); expect(h.outcomes).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('accepts the adapter local stopped result without translating it to channel cancellation', async () => {
    const h = harness(); h.adapter.invoke = async (_, context) => {
      context.beforeInvoke(); return { ok: true, value: { kind: 'stopped' } };
    };
    expect(await h.client.pay(request)).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked' });
    expect(h.reply).toHaveBeenCalledTimes(0); expect(h.query).toHaveBeenCalledTimes(0);
  });
  it('normalizes a throwing channel capability port and sanitizes diagnostics with no original code', async () => {
    const diagnostic = vi.fn(); const h = harness({ onDiagnostic: diagnostic }); h.adapter.available = () => { throw new Error('fixture-private-capability'); };
    expect(await h.client.pay(request)).toMatchObject({ reason: 'error', channelSignal: 'not_invoked', error: { code: 'CHANNEL_ERROR', source: 'channel' } });
    expect(diagnostic.mock.calls).toEqual([[{ attemptId: 'attempt-1', phase: 'validating', code: 'CHANNEL_ERROR' }]]); expect(h.trace).toEqual([]);
  });
  it('a nonterminal response at the total deadline ends with its last server fact and never reschedules', async () => {
    const h = harness({ policy: { observation: { maxWaitMs: 5 } } }); h.query.mockImplementation(async () => { vi.setSystemTime(5); return snapshot('PAYING'); });
    expect(await h.client.observe(reference)).toMatchObject({ reason: 'timed_out', snapshot: { state: 'PAYING', source: 'server' } }); expect(h.query).toHaveBeenCalledTimes(1);
  });
});

const recoverableQueryFailure = {
  ok: false, cause: 'query_unavailable',
  error: { code: 'SERVER_ERROR', source: 'gateway', message: '支付服务处理失败', originalCode: 'fixture-server-code', retryable: true },
} as const;
describe('CONTRACT-026: classified query recovery and public projection', () => {
  it.each(['pay', 'observe'] as const)('%s retries a classified unavailable after interval and confirms PAID without replay', async kind => {
    const h = harness();
    h.query.mockResolvedValueOnce(snapshot('PAYING')).mockResolvedValueOnce(recoverableQueryFailure).mockResolvedValueOnce(snapshot('PAID'));
    const running = h.settle(kind === 'pay' ? h.client.pay(request, { onPhase: h.onPhase }) : h.client.observe(reference, { onPhase: h.onPhase }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.outcomes).toEqual([]); expect(h.query).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2999); expect(h.query).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    const result = await running;
    expect(result).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID', source: 'server' }, channelSignal: kind === 'pay' ? 'success_hint' : 'not_invoked' });
    expect(result).not.toHaveProperty('error'); expect(result).not.toHaveProperty('cause');
    expect(h.query).toHaveBeenCalledTimes(3); expect(h.prepare).toHaveBeenCalledTimes(kind === 'pay' ? 1 : 0); expect(h.reply).toHaveBeenCalledTimes(kind === 'pay' ? 1 : 0);
    expect(h.events.filter(event => event.phase === 'confirming')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60000); expect(h.outcomes).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    { name: 'missing cause despite identical public error', value: error('SERVER_ERROR', 'gateway', { originalCode: 'fixture-server-code', retryable: true }) },
    { name: 'unknown cause', value: { ...recoverableQueryFailure, cause: 'other_cause' } },
    { name: 'mismatched code', value: { ...recoverableQueryFailure, error: { ...recoverableQueryFailure.error, code: 'PROTOCOL_ERROR' } } },
    { name: 'mismatched source', value: { ...recoverableQueryFailure, error: { ...recoverableQueryFailure.error, source: 'host' } } },
    { name: 'retryable false', value: { ...recoverableQueryFailure, error: { ...recoverableQueryFailure.error, retryable: false } } },
    { name: 'retryable absent', value: { ...recoverableQueryFailure, error: { code: 'SERVER_ERROR', source: 'gateway', message: '支付服务处理失败' } } },
    { name: 'retryable nonboolean', value: { ...recoverableQueryFailure, error: { ...recoverableQueryFailure.error, retryable: 'true' } } },
  ])('$name ends observation with its last fact instead of inferring recovery from the raw code', async ({ value }) => {
    const h = harness(); h.query.mockResolvedValueOnce(snapshot('PAYING')).mockResolvedValueOnce(value as BackendResult<TradeSnapshot>);
    const running = h.settle(h.client.pay(request)); await vi.advanceTimersByTimeAsync(3000);
    const result = await running;
    expect(result).toMatchObject({ reason: 'error', paymentNo: 'payment-1', channelSignal: 'success_hint', snapshot: { state: 'PAYING', source: 'server' }, error: { ...value.error, message: messages[value.error.code as PaymentError['code']] } });
    expect(result).not.toHaveProperty('cause'); expect(result.error).not.toHaveProperty('cause');
    await vi.advanceTimersByTimeAsync(60000); expect(h.query).toHaveBeenCalledTimes(2); expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.reply).toHaveBeenCalledTimes(1); expect(h.outcomes).toHaveLength(1);
  });
  it('uses the classified semantic shape without reading or requiring originalCode', async () => {
    const h = harness({ policy: { observation: { intervalMs: 3 } } });
    h.query.mockResolvedValueOnce({ ok: false, cause: 'query_unavailable', error: { code: 'SERVER_ERROR', source: 'gateway', message: '支付服务处理失败', retryable: true } });
    const running = h.client.observe(reference); await vi.advanceTimersByTimeAsync(3);
    expect((await running).reason).toBe('confirmed'); expect(h.query).toHaveBeenCalledTimes(2);
  });
  it('keeps the total deadline across classified business retries', async () => {
    const h = harness({ policy: { observation: { maxWaitMs: 7, intervalMs: 3 } } });
    h.query.mockResolvedValueOnce(snapshot('PAYING')).mockResolvedValue(recoverableQueryFailure);
    const running = h.settle(h.client.observe(reference)); await vi.advanceTimersByTimeAsync(6);
    expect(h.outcomes).toEqual([]); expect(h.query).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(await running).toMatchObject({ reason: 'timed_out', error: { code: 'TIMEOUT', source: 'sdk' }, snapshot: { state: 'PAYING', source: 'server' } });
    expect(h.query).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['host-stop', 'deadline', 'both'] as const)('prioritizes %s over a classified unavailable response and keeps the previous snapshot', async cause => {
    const h = harness({ policy: { observation: { maxWaitMs: 5, intervalMs: 3 } } }); const host = stopping();
    h.query.mockResolvedValueOnce(snapshot('PAYING')).mockImplementationOnce(async () => {
      if (cause !== 'deadline') host.stop(false);
      if (cause !== 'host-stop') vi.setSystemTime(5);
      return recoverableQueryFailure;
    });
    const running = h.client.pay(request, { cancellation: host.signal }); await vi.advanceTimersByTimeAsync(3);
    const result = await running;
    expect(result).toMatchObject({ reason: cause === 'deadline' ? 'timed_out' : 'stopped', channelSignal: 'success_hint', paymentNo: 'payment-1', snapshot: { state: 'PAYING', source: 'server' } });
    if (cause === 'deadline') expect(result.error).toEqual({ code: 'TIMEOUT', source: 'sdk', message: '支付请求超时，请稍后确认支付结果' }); else expect(result).not.toHaveProperty('error');
    await vi.advanceTimersByTimeAsync(50); expect(h.query).toHaveBeenCalledTimes(2); expect(host.listeners.size).toBe(0);
  });
  it('a host stop during the business-retry interval prevents the next query', async () => {
    const h = harness(); const host = stopping(); h.query.mockResolvedValue(recoverableQueryFailure);
    const running = h.settle(h.client.observe(reference, { cancellation: host.signal })); await flush(); expect(h.outcomes).toEqual([]);
    host.stop(); expect(await running).toMatchObject({ reason: 'stopped', snapshot: { state: 'UNKNOWN', source: 'unavailable' } });
    await vi.advanceTimersByTimeAsync(60000); expect(h.query).toHaveBeenCalledTimes(1); expect(h.outcomes).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([true, false])('public query with cause=%s is single-shot and projects only public failure fields', async tagged => {
    const h = harness();
    const reply = { ...error('SERVER_ERROR', 'gateway', { originalCode: 'fixture-server-code', retryable: true }), ...(tagged ? { cause: 'query_unavailable' as const } : {}), backendPrivate: 'fixture-private',
      error: { ...recoverableQueryFailure.error, cause: 'fixture-misplaced-cause', backendPrivate: 'fixture-private' },
    };
    h.query.mockResolvedValue(reply);
    const result = await h.client.query(reference);
    expect(result).toEqual({ ok: false, error: { code: 'SERVER_ERROR', source: 'gateway', message: '支付服务处理失败', originalCode: 'fixture-server-code', retryable: true } });
    expect(Object.keys(result).sort()).toEqual(['error', 'ok']);
    if (result.ok) throw new Error('expected public failure');
    expect(Object.keys(result.error).sort()).toEqual(['code', 'message', 'originalCode', 'retryable', 'source']);
    expect(result.error).not.toBe(reply.error);
    await vi.advanceTimersByTimeAsync(60000); expect(h.query).toHaveBeenCalledTimes(1); expect(h.trace).toEqual(['query']);
  });
  it('public successful query explicitly constructs its result and omits internal top-level keys', async () => {
    const h = harness(); const valid = snapshot(); if (!valid.ok) throw new Error('fixture');
    h.query.mockResolvedValue({ ...valid, cause: 'query_unavailable', backendPrivate: true } as BackendResult<TradeSnapshot>);
    const result = await h.client.query(reference);
    expect(result).toEqual({ ok: true, value: valid.value }); expect(Object.keys(result).sort()).toEqual(['ok', 'value']);
  });
  it.each(['pay', 'observe'] as const)('%s projects Outcome.error without changing public optional field values or diagnostic shape', async kind => {
    const diagnostics: DiagnosticEvent[] = []; const h = harness({ onDiagnostic(event) { diagnostics.push(event); } });
    const reply = { ok: false as const, cause: 'query_unavailable' as const,
      error: { code: 'SERVER_ERROR' as const, source: 'gateway' as const, message: '支付服务处理失败', originalCode: 'fixture-server-code', retryable: false, cause: 'fixture-misplaced-cause', backendPrivate: 'fixture-private' },
    };
    if (kind === 'pay') h.prepare.mockResolvedValue(reply); else h.query.mockResolvedValue(reply);
    const result = await (kind === 'pay' ? h.client.pay(request) : h.client.observe(reference));
    expect(result).toMatchObject({ reason: 'error', error: { code: 'SERVER_ERROR', source: 'gateway', originalCode: 'fixture-server-code', retryable: false } });
    expect(Object.keys(result.error!).sort()).toEqual(['code', 'message', 'originalCode', 'retryable', 'source']); expect(result.error).not.toBe(reply.error); expect(result).not.toHaveProperty('cause');
    expect(diagnostics).toEqual([{ attemptId: 'attempt-1', phase: kind === 'pay' ? 'prepare' : 'query', code: 'SERVER_ERROR', originalCode: 'fixture-server-code' }]);
    await vi.advanceTimersByTimeAsync(60000); expect(h.prepare).toHaveBeenCalledTimes(kind === 'pay' ? 1 : 0); expect(h.query).toHaveBeenCalledTimes(kind === 'pay' ? 0 : 1); expect(h.reply).toHaveBeenCalledTimes(0);
  });
  it('prepare never replays even if an internal fake supplies a well-shaped query recovery label', async () => {
    const h = harness(); h.prepare.mockResolvedValue(recoverableQueryFailure);
    const result = await h.client.pay(request);
    expect(result).toMatchObject({ reason: 'error', channelSignal: 'not_invoked', error: { code: 'SERVER_ERROR', source: 'gateway', retryable: true } }); expect(result).not.toHaveProperty('cause');
    await vi.advanceTimersByTimeAsync(60000); expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.query).toHaveBeenCalledTimes(0); expect(h.reply).toHaveBeenCalledTimes(0);
  });
});
