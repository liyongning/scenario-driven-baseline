import type { ChannelSignal, DiagnosticEvent, EndReason, PaymentAction, PaymentClient, PaymentError, PaymentOutcome, PaymentPhase, PaymentPolicyOverrides, PaymentRequest, PortResult, RunOptions, TradeReference, TradeSnapshot } from '../contracts';
import type { PaymentBackend, PreparedPayment } from '../ports/backend';
import type { ChannelAdapter, ChannelInvocation } from '../ports/channel';
import type { RuntimePort } from '../ports/runtime';
import { createCleanup, failure, observeTrade, requestOnce } from './observation';
import { createPaymentError } from '../errors/payment-error';

type Policy = Readonly<{ requestTimeoutMs: number; intervalMs: number; maxWaitMs: number }>;
type Phase = 'validating' | 'prepare' | 'invoke' | 'query';
export type CoreClientOptions = Readonly<{
  backend: PaymentBackend;
  channels: readonly ChannelAdapter[];
  enabledMethods: readonly string[];
  runtime: RuntimePort;
  policy?: PaymentPolicyOverrides;
  onDiagnostic?: (event: DiagnosticEvent) => void;
}>;
const defaults: Policy = { requestTimeoutMs: 60000, intervalMs: 3000, maxWaitMs: 60000 };

function mergePolicy(base: Policy | undefined, overrides: PaymentPolicyOverrides | undefined): Policy | undefined {
  if (!base || overrides !== undefined && (overrides === null || typeof overrides !== 'object')) return undefined;
  const observation = overrides?.observation;
  if (observation !== undefined && (observation === null || typeof observation !== 'object')) return undefined;
  // 只有 undefined 表示沿用上层值；0、null、非有限数值等不能变成“使用默认”。
  const selected = {
    requestTimeoutMs: overrides?.requestTimeoutMs === undefined ? base.requestTimeoutMs : overrides.requestTimeoutMs,
    intervalMs: observation?.intervalMs === undefined ? base.intervalMs : observation.intervalMs,
    maxWaitMs: observation?.maxWaitMs === undefined ? base.maxWaitMs : observation.maxWaitMs,
  };
  return Object.values(selected).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0) ? selected : undefined;
}
function validReference(reference: TradeReference): boolean {
  return typeof reference?.tradeNo === 'string' && reference.tradeNo.trim().length > 0;
}
function copyReference(reference: TradeReference): TradeReference {
  return { tradeNo: typeof reference?.tradeNo === 'string' ? reference.tradeNo : '' };
}

// 公开错误只复制契约字段；内部 cause 或适配器附加属性不进入 query、Outcome 或诊断。
function publicError(error: PaymentError): PaymentError {
  return createPaymentError(error.code, error.source, {
    ...(error.originalCode === undefined ? {} : { originalCode: error.originalCode }),
    ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
    ...(error.channelMessage === undefined ? {} : { channelMessage: error.channelMessage }),
  });
}

/** 仅供内部装配/模块测试；公开工厂在 Task 7 选择并装配平台，不把端口暴露给业务。 */
export function createCoreClient(options: CoreClientOptions): PaymentClient {
  const { backend, runtime, onDiagnostic } = options;
  const enabledMethods = new Set(options.enabledMethods);
  const channels = new Map(options.channels.map(channel => [channel.method, channel]));
  const basePolicy = mergePolicy(defaults, options.policy);
  const activePays = new Map<string, string>();

  function createRun(reference: TradeReference, options: RunOptions | undefined) {
    const attemptId = runtime.nextAttemptId();
    const copiedReference = copyReference(reference);
    const cancellation = options?.cancellation;
    const onPhase = options?.onPhase;
    const policy = mergePolicy(basePolicy, options?.policy);
    const cleanup = createCleanup();
    let ended = false;
    let phase: Phase = 'validating';
    let snapshot: TradeSnapshot = { reference: copiedReference, state: 'UNKNOWN', source: 'unavailable', observedAtMs: runtime.nowMs() };
    let channelSignal: ChannelSignal = 'not_invoked';
    let paymentNo: string | undefined;
    let unsubscribe: (() => void) | undefined;
    let deliver!: (outcome: PaymentOutcome) => void;
    const result = new Promise<PaymentOutcome>(resolve => { deliver = resolve; });
    const notified = new Set<PaymentPhase>();

    function finish(reason: EndReason, error?: PaymentError, interruptedPhase?: PaymentOutcome['interruptedPhase'], nextAction?: PaymentAction): void {
      // 运行 ended 先于清理和交付；停止/截止只接纳首个结束原因，旧回调不能推进新 attempt。
      if (ended) return;
      ended = true;
      if (activePays.get(copiedReference.tradeNo) === attemptId) activePays.delete(copiedReference.tradeNo);
      unsubscribe?.();
      cleanup.stop();
      if (error && onDiagnostic) {
        try {
          void Promise.resolve(onDiagnostic({ attemptId, phase, code: error.code,
            ...(error.originalCode === undefined ? {} : { originalCode: error.originalCode }),
          })).catch(() => {});
        } catch { /* 诊断异常不成为支付错误，不输出原文。 */ }
      }
      deliver({ attemptId, snapshot, channelSignal, reason,
        ...(paymentNo === undefined ? {} : { paymentNo }),
        ...(error === undefined ? {} : { error: publicError(error) }),
        ...(interruptedPhase === undefined ? {} : { interruptedPhase }),
        ...(nextAction === undefined ? {} : { nextAction }),
      });
    }
    function active(): boolean {
      if (ended) return false;
      // 这里只读原始宿主信号；底层内部清理不能伪装成宿主主动停止。
      if (cancellation?.isStopped()) { finish('stopped'); return false; }
      return true;
    }
    function fail(error: PaymentError): void {
      let reason: EndReason = 'error';
      let interruptedPhase: PaymentOutcome['interruptedPhase'];
      switch (error.code) {
        case 'AUTH_REQUIRED': reason = 'auth_required'; break;
        case 'IDENTITY_REQUIRED': reason = 'identity_required'; break;
        case 'CHANNEL_SESSION_REQUIRED': reason = 'channel_session_required'; break;
        case 'UNSUPPORTED': reason = 'unsupported'; break;
        case 'BUSY': reason = 'busy'; break;
        case 'TIMEOUT': reason = 'timed_out'; break;
      }
      // 身份中断位置只描述恢复入口；保留最后可信快照、已知单号和渠道信号，不等待凭据更新。
      if (error.code === 'AUTH_REQUIRED' || error.code === 'IDENTITY_REQUIRED' || error.code === 'CHANNEL_SESSION_REQUIRED') {
        interruptedPhase = phase as Exclude<Phase, 'validating'>;
      }
      finish(reason, error, interruptedPhase);
    }
    function notify(value: PaymentPhase): void {
      if (!active() || notified.has(value)) return;
      notified.add(value);
      if (!onPhase) return;
      // 先置阶段闩锁，再同步通知；Promise/thenable 仅接收拒绝，不等待业务 UI 或动画。
      try { void Promise.resolve(onPhase(Object.freeze({ attemptId, phase: value }))).catch(() => {}); }
      catch { /* 观察者异常不改原因、快照或后续动作，且不记录异常原文。 */ }
    }
    function start(): void {
      unsubscribe = cancellation?.subscribe(() => { finish('stopped'); });
      // subscribe 可以同步报告停止；结束时尚未取得的订阅仍须解除。
      if (ended) unsubscribe?.();
    }
    async function observe(): Promise<void> {
      phase = 'query';
      await observeTrade(backend, runtime, policy!, {
        reference: copiedReference, cleanup: cleanup.signal, active,
        notify: () => { notify('confirming'); },
        accept: value => { snapshot = value; },
        confirm: () => { finish('confirmed'); }, fail,
      });
    }
    return {
      result, reference: copiedReference, cleanup: cleanup.signal, cancellation, active, start, fail, finish, observe,
      valid: () => validReference(reference) && policy !== undefined && (onPhase === undefined || typeof onPhase === 'function'),
      acquire: () => { activePays.set(copiedReference.tradeNo, attemptId); },
      async pay(request: PaymentRequest, channel: ChannelAdapter): Promise<void> {
        phase = 'prepare';
        const deadlineAtMs = runtime.nowMs() + policy!.requestTimeoutMs;
        let prepared: PreparedPayment | undefined;
        await requestOnce(context => backend.prepare(request, context), runtime, deadlineAtMs, { cleanup: cleanup.signal, active }, received => {
          // 请求闩锁已先检查宿主停止；prepare 截止后，迟到成功或错误都不能抢占 timed_out。
          if (runtime.nowMs() >= deadlineAtMs) fail(failure('TIMEOUT', 'sdk').error);
          else if (!received.ok) fail(received.error);
          else { prepared = received.value; paymentNo = received.value.paymentNo; }
        });
        if (!active() || !prepared) return;
        phase = 'invoke';
        let beforeInvokeAdmitted = false;
        let invoked = false;
        let invocation: PortResult<ChannelInvocation>;
        try {
          invocation = await channel.invoke(prepared, {
            attemptId, ...(cancellation ? { cancellation } : {}),
            beforeInvoke: () => {
              // 通知不是平台调用；已标记或进入查单后不再给重复调用许可。
              if (phase !== 'invoke' || invoked) return false;
              notify('channel_invoking');
              if (!active()) return false;
              beforeInvokeAdmitted = true;
              return true;
            },
            markInvoked: () => {
              // 第二次停止检查后，紧邻平台调用同步准入；未标记停止仍是 not_invoked。
              // 本次运行与调用各有闩锁，过早/重复/停止后/迟到标记不能改写旧结果或新运行。
              // isStopped 属于宿主调用；它同步重入时，返回后仍须确认尚未给出调用许可。
              if (phase !== 'invoke' || !beforeInvokeAdmitted || !active() || invoked) return false;
              invoked = true;
              channelSignal = 'unknown';
              return true;
            },
          });
        } catch { invocation = failure('CHANNEL_ERROR', 'channel'); }
        if (!active()) return;
        if (!invocation.ok) {
          if (channelSignal === 'unknown') channelSignal = 'launch_failed';
          // 仅 invoke 阶段的渠道错误按明确调起失败结算；prepare/query 的 CHANNEL_ERROR 保持 reason=error。
          if (invocation.error.code === 'CHANNEL_ERROR') { finish('launch_failed', invocation.error); return; }
          fail(invocation.error); return;
        }
        const value = invocation.value;
        if (value.kind === 'stopped') { finish('stopped'); return; }
        if (value.kind === 'action') { finish('action_required', undefined, undefined, value.action); return; }
        channelSignal = value.signal;
        // 渠道成功提示/已返回 unknown 才进入确认；无回调不查询、不启动结果预算。
        if (value.signal === 'success_hint' || value.signal === 'unknown') await observe();
        else finish(value.signal === 'cancelled' ? 'channel_cancelled' : 'launch_failed');
      },
    };
  }

  return {
    pay(request, options) {
      const run = createRun(request?.reference, options);
      const method = request?.method;
      const xpayEnv = request?.xpayEnv;
      if (!run.valid() || typeof method !== 'string' || method.length === 0
        || xpayEnv !== undefined && xpayEnv !== 'sandbox' && xpayEnv !== 'prod') {
        run.fail(failure('INVALID_INPUT', 'sdk').error); return run.result;
      }
      if (!run.active()) return run.result;
      const channel = channels.get(method);
      if (!enabledMethods.has(method) || !channel) { run.fail(failure('UNSUPPORTED', 'sdk').error); return run.result; }
      if (activePays.has(run.reference.tradeNo)) { run.fail(failure('BUSY', 'sdk').error); return run.result; }
      try { if (!channel.available()) { run.fail(failure('UNSUPPORTED', 'sdk').error); return run.result; } }
      catch { run.fail(failure('CHANNEL_ERROR', 'channel').error); return run.result; }
      // 接纳时复制本次 reference/method/xpayEnv；不保存环境历史，也不缓存 PreparedPayment。
      const copied: PaymentRequest = { reference: run.reference, method, ...(xpayEnv === undefined ? {} : { xpayEnv }) };
      run.acquire(); run.start();
      if (run.active()) void run.pay(copied, channel);
      return run.result;
    },
    query(reference) {
      const copied = copyReference(reference);
      if (!validReference(reference) || !basePolicy) return Promise.resolve(failure('INVALID_INPUT', 'sdk'));
      return new Promise(resolve => {
        void requestOnce(context => backend.query(copied, context), runtime, runtime.nowMs() + basePolicy.requestTimeoutMs, {}, result => {
          // 独立 query 始终只请求一次；不能把结构兼容的内部 BackendResult 原对象当公开结果。
          resolve(result.ok ? { ok: true, value: result.value } : { ok: false, error: publicError(result.error) });
        });
      });
    },
    observe(reference, options) {
      const run = createRun(reference, options);
      if (!run.valid()) { run.fail(failure('INVALID_INPUT', 'sdk').error); return run.result; }
      if (run.active()) { run.start(); if (run.active()) void run.observe(); }
      return run.result;
    },
  };
}
