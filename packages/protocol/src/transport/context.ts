import { BaseReq } from '../generated/idl/base';
import type { Cancellation, OperationContext } from '../ports/context';
import type { CommunicationResult } from './errors';

/** 通信实例所需的公共上下文依赖；不包含支付身份、设备或环境选择。 */
export type ProtocolContextOptions = Readonly<{
  getAccessToken: () => string | null | Promise<string | null>;
  requestContext?: Readonly<{ productId?: string; lane?: string; appVersion?: string }>;
  runtime: Readonly<{
    nowMs: () => number;
    nextRequestId: () => string;
    sleepMs: (durationMs: number, cancellation?: Cancellation) => Promise<void>;
  }>;
}>;
type RequestContext = Readonly<{
  headers: Readonly<Record<string, string>>;
  baseReq: BaseReq;
}>;

/** 当前凭据只在本次预算内读取；结束后清理等待，迟到 provider 不启动 HTTP。 */
export function createRequestContext(
  options: ProtocolContextOptions,
  context: OperationContext,
): Promise<CommunicationResult<RequestContext>> {
  if (context.cancellation?.isStopped())
    return Promise.resolve({ ok: false, error: { code: 'CANCELLED' } });
  const remaining = context.deadlineAtMs - options.runtime.nowMs();
  if (remaining <= 0) return Promise.resolve({ ok: false, error: { code: 'TIMEOUT' } });
  return new Promise((resolve) => {
    let ended = false;
    const subscription: { unsubscribe?: () => void } = {};
    const timerListeners = new Set<() => void>();
    const timerCancellation: Cancellation = {
      isStopped: () => ended,
      subscribe: (listener) => {
        timerListeners.add(listener);
        return () => {
          timerListeners.delete(listener);
        };
      },
    };
    const finish = (result: CommunicationResult<RequestContext>) => {
      // 先锁定结束，再解除宿主订阅和内部定时等待；后来的凭据/停止/计时均无效。
      if (ended) return;
      ended = true;
      subscription.unsubscribe?.();
      for (const listener of timerListeners) listener();
      timerListeners.clear();
      resolve(result);
    };
    if (context.cancellation) {
      subscription.unsubscribe = context.cancellation.subscribe(() =>
        finish({ ok: false, error: { code: 'CANCELLED' } }),
      );
    }
    // subscribe 允许同步通知；此时刚返回的解除函数也必须执行。
    if (ended) {
      subscription.unsubscribe?.();
      return;
    }
    void options.runtime
      .sleepMs(remaining, timerCancellation)
      .then(() => finish({ ok: false, error: { code: 'TIMEOUT' } }));
    void Promise.resolve()
      .then(() => options.getAccessToken())
      .then(
        (token) => {
          if (ended) return;
          if (context.cancellation?.isStopped()) {
            finish({ ok: false, error: { code: 'CANCELLED' } });
            return;
          }
          if (options.runtime.nowMs() >= context.deadlineAtMs) {
            finish({ ok: false, error: { code: 'TIMEOUT' } });
            return;
          }
          if (token === null || (typeof token === 'string' && token.trim() === '')) {
            finish({ ok: false, error: { code: 'EMPTY_ACCESS_TOKEN' } });
            return;
          }
          if (typeof token !== 'string') {
            finish({ ok: false, error: { code: 'HOST_CONTEXT_ERROR' } });
            return;
          }
          const requestId = options.runtime.nextRequestId();
          const config = options.requestContext;
          const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            request_id: requestId,
          };
          const baseReq = BaseReq.create({ requestId });
          if (config?.productId !== undefined) {
            headers['X-Product-ID'] = config.productId;
            baseReq.productId = config.productId;
          }
          if (config?.lane !== undefined) headers.lane = config.lane;
          if (config?.appVersion !== undefined) headers.app_version = config.appVersion;
          finish({ ok: true, value: { headers, baseReq } });
        },
        () => finish({ ok: false, error: { code: 'HOST_CONTEXT_ERROR' } }),
      );
  });
}
