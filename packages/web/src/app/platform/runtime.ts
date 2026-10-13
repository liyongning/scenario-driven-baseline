import type { CancellationPort, ClockPort, VisibilityPort } from '../../runtime/ports';

interface CancellationSource {
  readonly port: CancellationPort;
  cancel(): void;
}

/** 浏览器时钟实现；产品业务代码只消费 ClockPort。 */
export function browserClock(): ClockPort {
  return {
    now: () => performance.now(),
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle),
  };
}

/** 页面可见性实现；隐藏时暂停轮询。 */
export function browserVisibility(): VisibilityPort {
  return {
    isVisible: () => document.visibilityState === 'visible',
    subscribe(listener) {
      const update = () => listener(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', update);
      return () => document.removeEventListener('visibilitychange', update);
    },
  };
}

/** 创建一次性取消源，供组件卸载与代际切换中止在途请求。 */
export function createBrowserCancellation(): CancellationSource {
  let cancelled = false;
  const listeners = new Set<() => void>();
  return {
    port: {
      isCancelled: () => cancelled,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    cancel() {
      cancelled = true;
      for (const listener of [...listeners]) listener();
    },
  };
}
