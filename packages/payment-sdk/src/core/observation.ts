import type { OperationContext } from '@daqian/payment-protocol';
import type { Cancellation, ObservationPolicy, PaymentError, PortResult, TradeReference, TradeSnapshot } from '../contracts';
import type { BackendResult, PaymentBackend } from '../ports/backend';
import type { RuntimePort } from '../ports/runtime';
import { createPaymentError } from '../errors/payment-error';

/** 内部清理信号：只清理本地请求/计时器，不能作为宿主主动停止的依据。 */
export function createCleanup() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const signal: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      if (stopped) listener();
      else listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return { signal, stop() {
    if (stopped) return;
    stopped = true;
    const pending = [...listeners];
    listeners.clear();
    for (const listener of pending) {
      try { listener(); } catch { /* 尽力取消；一个底层 abort 抛错不能阻止其他清理或结果交付。 */ }
    }
  } };
}

export function failure(code: PaymentError['code'], source: PaymentError['source']): Extract<PortResult<never>, { ok: false }> {
  return { ok: false, error: createPaymentError(code, source) };
}

type RequestOwner = Readonly<{
  /** 运行 ended 时触发的清理信号，与原始宿主 cancellation 分开。 */
  cleanup?: Cancellation;
  /** 核心检查 ended 和原始宿主停止；底层取消不能冒充宿主停止。 */
  active?: () => boolean;
}>;

/** 一笔请求独立完成；先锁请求并处理所属运行，再取消底层，旧结果不能进入下一笔请求。 */
export function requestOnce<T>(
  execute: (context: OperationContext) => Promise<BackendResult<T>>,
  runtime: RuntimePort,
  deadlineAtMs: number,
  owner: RequestOwner,
  onResult: (result: Exclude<BackendResult<T>, { cancelled: true }>) => void,
): Promise<void> {
  return new Promise(resolve => {
    let completed = false;
    let unsubscribe: (() => void) | undefined = undefined;
    const cleanup = createCleanup();
    const finish = (result?: BackendResult<T>) => {
      // 请求完成闩锁独立于运行 ended：旧请求的取消/迟到响应不能更新快照或覆盖终态。
      if (completed) return;
      completed = true;
      if (result && owner.active?.() !== false) {
        if (!result.ok && 'cancelled' in result) {
          // CANCELLED 中性输入只在此判归属；宿主停止已由 active 优先处理。
          onResult(runtime.nowMs() >= deadlineAtMs ? failure('TIMEOUT', 'sdk') : {
            ok: false, error: createPaymentError('NETWORK_ERROR', 'network', { originalCode: 'CANCELLED' }),
          });
        } else if (!result.ok && result.error.code === 'TIMEOUT' && runtime.nowMs() >= deadlineAtMs) {
          // 协议与核心计时器共享同一截止点；平台计时器先回调时仍由核心确定已耗尽预算的公共来源。
          onResult(failure('TIMEOUT', 'sdk'));
        } else onResult(result);
      }
      // onResult 先锁定需要结束的运行原因；同步 abort fail 不能抢成 stopped 或另一种错误。
      unsubscribe?.();
      cleanup.stop();
      resolve();
    };
    unsubscribe = owner.cleanup?.subscribe(() => { finish(); });
    if (completed) { unsubscribe?.(); return; }
    if (owner.active?.() === false) { finish(); return; }
    const remaining = deadlineAtMs - runtime.nowMs();
    if (remaining <= 0) { finish(failure('TIMEOUT', 'sdk')); return; }
    void runtime.sleepMs(remaining, cleanup.signal).then(() => { finish(failure('TIMEOUT', 'sdk')); });
    try {
      void execute({ deadlineAtMs, cancellation: cleanup.signal }).then(finish, () => { finish(failure('NETWORK_ERROR', 'network')); });
    } catch { finish(failure('NETWORK_ERROR', 'network')); }
  });
}

export type ObservationRun = Readonly<{
  reference: TradeReference;
  cleanup: Cancellation;
  active: () => boolean;
  notify: () => void;
  accept: (snapshot: TradeSnapshot) => void;
  confirm: () => void;
  fail: (error: PaymentError) => void;
}>;

/** 首笔立即查询；每笔完成后等待间隔，查询截止不包含原生渠道等待。 */
export async function observeTrade(
  backend: PaymentBackend,
  runtime: RuntimePort,
  policy: ObservationPolicy & Readonly<{ requestTimeoutMs: number }>,
  run: ObservationRun,
): Promise<void> {
  // confirming 的同步耗时也占用观察窗口；通知内停止或超预算时不调用 provider/backend。
  const deadlineAtMs = runtime.nowMs() + policy.maxWaitMs;
  run.notify();
  while (run.active()) {
    if (runtime.nowMs() >= deadlineAtMs) { run.fail(failure('TIMEOUT', 'sdk').error); return; }
    await requestOnce(context => backend.query(run.reference, context), runtime,
      Math.min(runtime.nowMs() + policy.requestTimeoutMs, deadlineAtMs), run, result => {
        if (result.ok) {
          run.accept(result.value);
          // 已接收到的 PAID/CLOSED 在同一处理回合先于预算判断；expire_time 不制造 CLOSED。
          if (result.value.state === 'PAID' || result.value.state === 'CLOSED') run.confirm();
        } else if (runtime.nowMs() >= deadlineAtMs) run.fail(failure('TIMEOUT', 'sdk').error);
        // 单次请求超时只结束当前请求；剩余观察窗口内仍按间隔重查，不交付中间结果。
        else {
          // CONTRACT-026：只消费 backend 的已确认查询语义；公开 retryable 或原码不能补授权。
          const queryUnavailable = result.cause === 'query_unavailable' && result.error.code === 'SERVER_ERROR'
            && result.error.source === 'gateway' && result.error.retryable === true;
          if (!queryUnavailable && result.error.code !== 'NETWORK_ERROR' && result.error.code !== 'TIMEOUT') run.fail(result.error);
        }
      });
    if (!run.active()) return;
    const remaining = deadlineAtMs - runtime.nowMs();
    if (remaining <= 0) { run.fail(failure('TIMEOUT', 'sdk').error); return; }
    await runtime.sleepMs(Math.min(policy.intervalMs, remaining), run.cleanup);
  }
}
