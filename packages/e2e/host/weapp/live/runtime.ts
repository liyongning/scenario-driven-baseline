import type { Cancellation, ProtocolClientOptions } from '@daqian/payment-protocol';

let requestSequence = 0;

function randomHex16(): string {
  let value = '';
  for (let index = 0; index < 16; index += 1) value += Math.floor(Math.random() * 16).toString(16);
  return value;
}

function sleepMs(durationMs: number, cancellation?: Cancellation): Promise<void> {
  if (durationMs <= 0 || cancellation?.isStopped()) return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    const subscription: { unsubscribe?: () => void } = {};
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe?.();
      resolve();
    };
    const timer = setTimeout(finish, durationMs);
    if (cancellation) subscription.unsubscribe = cancellation.subscribe(finish);
    if (settled) subscription.unsubscribe?.();
  });
}

/** Live 宿主自己的协议运行依赖；不引用 SDK 私有 runtime。 */
export function createLiveRuntime(): ProtocolClientOptions['runtime'] {
  return {
    nowMs: () => Date.now(),
    nextRequestId: () => {
      requestSequence += 1;
      return `live-${Date.now().toString(36)}-${randomHex16()}-${requestSequence}`;
    },
    sleepMs,
  };
}
