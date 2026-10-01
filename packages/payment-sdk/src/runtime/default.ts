import type { Cancellation } from '@daqian/payment-protocol';
import type { RuntimePort } from './port';

// 只声明跨宿主定时器能力，核心不引入 DOM 或 Node 全局类型。
declare function setTimeout(callback: () => void, durationMs: number): number;
declare function clearTimeout(handle: number): void;

// 模块级共享序号不会随客户端重建或时间回拨重置；仅作诊断关联，不是业务幂等键。
const processNonce = Math.random().toString(36).slice(2, 10);
let sequence = 0;

function nextRequestId(): string {
  sequence += 1;
  return `pay-${Date.now().toString(36)}-${processNonce}-${sequence.toString(36)}`;
}

function sleepMs(durationMs: number, cancellation?: Cancellation): Promise<void> {
  if (cancellation?.isStopped()) return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    let unsubscribe: (() => void) | undefined = undefined;
    const finish = () => {
      // 停止与计时器只接纳先到者；迟到通知不再交付或保留活动等待。
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve();
    };
    const timer = setTimeout(finish, durationMs);
    unsubscribe = cancellation?.subscribe(finish);
    // subscribe 可能同步通知已停止，此时需解除刚返回的订阅。
    if (settled) unsubscribe?.();
  });
}

/** 创建无平台全局依赖的内部运行辅助工具，不装配客户端或访问业务上下文。 */
export function createDefaultRuntime(): RuntimePort {
  return {
    nowMs: () => Date.now(),
    nextRequestId,
    sleepMs,
  };
}
