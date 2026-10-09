import type { Cancellation, OperationContext } from '@daqian/template-protocol';
import type {
  ExampleClient,
  ExampleCreateInput,
  ExampleCreateResult,
  ExampleError,
  ExampleOutcome,
  ExamplePolicyOverrides,
  ExampleResourceRef,
  ExampleRunOptions,
} from '../contracts';
import type { ExampleBackend, ExampleBackendResult, ExampleRuntimePort } from '../ports/backend';

declare function setTimeout(callback: () => void, durationMs: number): number;
declare function clearTimeout(handle: number): void;

const DEFAULT_POLICY = Object.freeze({
  requestTimeoutMs: 10_000,
  intervalMs: 3_000,
  windowMs: 60_000,
});
type Policy = Readonly<{ requestTimeoutMs: number; intervalMs: number; windowMs: number }>;

const messages: Readonly<Record<ExampleError['category'], string>> = {
  invalid_input: '示例参数无效',
  unauthorized: '访问令牌无效或缺失',
  host: '宿主上下文不可用',
  network: '网络请求失败',
  timeout: '请求超时',
  server: '服务端处理失败',
  protocol: '协议响应无效',
};
export function exampleError(
  category: ExampleError['category'],
  details: Partial<Pick<ExampleError, 'serverCode' | 'serverDescription'>> = {},
): ExampleError {
  return {
    category,
    message: messages[category],
    ...(details.serverCode === undefined ? {} : { serverCode: details.serverCode }),
    ...(details.serverDescription === undefined
      ? {}
      : { serverDescription: details.serverDescription }),
  };
}

function mergePolicy(base: Policy, override?: ExamplePolicyOverrides): Policy {
  return {
    requestTimeoutMs: override?.requestTimeoutMs ?? base.requestTimeoutMs,
    intervalMs: override?.intervalMs ?? base.intervalMs,
    windowMs: override?.windowMs ?? base.windowMs,
  };
}
function validPolicy(value: ExamplePolicyOverrides | undefined): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return [value.requestTimeoutMs, value.intervalMs, value.windowMs].every(
    (item) => item === undefined || (typeof item === 'number' && Number.isFinite(item) && item > 0),
  );
}
function validInput(input: ExampleCreateInput): boolean {
  if (input === null || typeof input !== 'object') return false;
  if (
    typeof input.ownerId !== 'string' ||
    !/^[1-9]\d*$/.test(input.ownerId) ||
    BigInt(input.ownerId) > 9223372036854775807n
  )
    return false;
  return (
    typeof input.externalRef === 'string' &&
    input.externalRef.length >= 1 &&
    input.externalRef.length <= 64 &&
    Number.isInteger(input.units) &&
    input.units >= 1 &&
    input.units <= 999
  );
}
function validReference(reference: ExampleResourceRef): boolean {
  return (
    reference !== null &&
    typeof reference === 'object' &&
    typeof reference.id === 'string' &&
    reference.id.length > 0 &&
    typeof reference.externalRef === 'string' &&
    reference.externalRef.length >= 1 &&
    reference.externalRef.length <= 64
  );
}

type Controller = Readonly<{ signal: Cancellation; stop(): void }>;
function controller(parent?: Cancellation): Controller {
  let stopped = parent?.isStopped() ?? false;
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    unsubscribe?.();
    const pending = [...listeners];
    listeners.clear();
    for (const listener of pending) {
      try {
        listener();
      } catch {
        /* 取消订阅不能阻断其他清理。 */
      }
    }
  };
  const signal: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      if (stopped) listener();
      else listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  if (parent) unsubscribe = parent.subscribe(stop);
  return { signal, stop };
}

async function request<T>(
  backendCall: (context: OperationContext) => Promise<ExampleBackendResult<T>>,
  runtime: ExampleRuntimePort,
  deadlineAtMs: number,
  parent?: Cancellation,
): Promise<ExampleBackendResult<T> | Readonly<{ timeout: true }>> {
  const local = controller(parent);
  let timer = 0;
  let resolveStop: (() => void) | undefined;
  const stopped = new Promise<'cancelled'>((resolve) => {
    resolveStop = () => resolve('cancelled');
  });
  const unsubscribe = local.signal.subscribe(() => resolveStop?.());
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), Math.max(0, deadlineAtMs - runtime.nowMs()));
  });
  const operation = Promise.resolve()
    .then(() => backendCall({ deadlineAtMs, cancellation: local.signal }))
    .catch(() => ({ ok: false, error: exampleError('network') }) as const);
  const result = await Promise.race([operation, stopped, timeout]);
  clearTimeout(timer);
  unsubscribe();
  local.stop();
  if (result === 'cancelled' || parent?.isStopped()) return { ok: false, cancelled: true };
  if (result === 'timeout') return { timeout: true };
  return result;
}

/** 创建中立示例核心；不依赖协议消息、平台全局或支付核心。 */
export function createExampleCore(
  options: Readonly<{
    backend: ExampleBackend;
    runtime: ExampleRuntimePort;
    policy?: ExamplePolicyOverrides;
  }>,
): ExampleClient {
  const policy = mergePolicy(DEFAULT_POLICY, options.policy);
  return {
    async create(input: ExampleCreateInput): Promise<ExampleCreateResult> {
      if (!validInput(input)) return { ok: false, error: exampleError('invalid_input') };
      const result = await request(
        (context) => options.backend.create(input, context),
        options.runtime,
        options.runtime.nowMs() + policy.requestTimeoutMs,
      );
      if ('timeout' in result) return { ok: false, error: exampleError('timeout') };
      if (!result.ok) {
        if ('cancelled' in result) return { ok: false, error: exampleError('network') };
        return result;
      }
      return { ok: true, reference: result.value.reference };
    },
    async observe(
      reference: ExampleResourceRef,
      runOptions?: ExampleRunOptions,
    ): Promise<ExampleOutcome> {
      if (!validReference(reference) || !validPolicy(runOptions?.policy))
        return { end: 'failed', lastState: 'unknown', error: exampleError('invalid_input') };
      const runPolicy = mergePolicy(policy, runOptions?.policy);
      const parent = runOptions?.cancellation;
      if (parent?.isStopped()) return { end: 'cancelled', lastState: 'unknown' };
      const deadlineAtMs = options.runtime.nowMs() + runPolicy.windowMs;
      let lastState: 'pending' | 'completed' | 'closed' | 'unknown' = 'unknown';
      while (!(parent?.isStopped() ?? false)) {
        const now = options.runtime.nowMs();
        if (now >= deadlineAtMs) return { end: 'window_elapsed', lastState };
        const result = await request(
          (context) => options.backend.query(reference, context),
          options.runtime,
          Math.min(now + runPolicy.requestTimeoutMs, deadlineAtMs),
          parent,
        );
        if (parent?.isStopped() || ('cancelled' in result && result.cancelled))
          return { end: 'cancelled', lastState };
        if ('timeout' in result) {
          if (options.runtime.nowMs() >= deadlineAtMs) return { end: 'window_elapsed', lastState };
        } else if (!result.ok) {
          if (!('error' in result) || result.retryable !== true)
            return {
              end: 'failed',
              lastState,
              error: 'error' in result ? result.error : exampleError('network'),
            };
        } else {
          lastState = result.value.state;
          if (lastState === 'completed') return { end: 'completed', lastState };
          if (lastState === 'closed') return { end: 'closed', lastState };
        }
        const remaining = deadlineAtMs - options.runtime.nowMs();
        if (remaining <= 0) return { end: 'window_elapsed', lastState };
        await options.runtime.sleepMs(Math.min(runPolicy.intervalMs, remaining), parent);
        if (parent?.isStopped()) return { end: 'cancelled', lastState };
      }
      return { end: 'cancelled', lastState };
    },
  };
}
