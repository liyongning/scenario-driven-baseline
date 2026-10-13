import * as openapi from '@daqian/template-openapi';
import type { Cancellation, RestOperation, SecurityScheme } from '@daqian/template-openapi';

export type BrowserRunnerCancel = 'before-send' | 'in-flight';
export type BrowserPlanStep = Readonly<{
  method: string;
  input: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  cancel?: BrowserRunnerCancel;
}>;
export type BrowserStepResult = Readonly<Record<string, unknown>>;
export type BrowserRunnerOptions = Readonly<{
  gatewayBaseUrl?: string;
  securitySchemes?: Readonly<Record<string, SecurityScheme>>;
  identity?: Readonly<{ scheme: string; token: string }>;
}>;

/** 浏览器用例在 Shadow 记录到请求后触发，用于确定性地推进 in-flight 取消。 */
export const browserCancelEvent = 'template-openapi-cancel';

function findOperation(name: string): RestOperation | undefined {
  for (const value of Object.values(openapi)) {
    const operation = value as Partial<RestOperation> | undefined;
    if (operation?.meta?.id === name) return operation as RestOperation;
  }
  return undefined;
}

function cancellationSource() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const cancellation: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    cancellation,
    stop() {
      stopped = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

export function browserSerializable(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)),
  ) as unknown;
}

async function runStep(step: BrowserPlanStep, options: BrowserRunnerOptions) {
  const operation = findOperation(step.method);
  if (!operation) return { kind: 'transport-failure', reason: 'CODEC_ERROR', method: step.method };
  const source = cancellationSource();
  let cleanupCancellation = () => {};
  if (step.cancel === 'before-send') source.stop();
  if (step.cancel === 'in-flight') {
    const cancel = () => source.stop();
    if (typeof window === 'undefined') queueMicrotask(cancel);
    else {
      window.addEventListener(browserCancelEvent, cancel, { once: true });
      cleanupCancellation = () => window.removeEventListener(browserCancelEvent, cancel);
    }
  }
  const http = openapi.createFetchHttp();
  const client = openapi.createRestClient({
    gatewayBaseUrl: options.gatewayBaseUrl ?? '',
    securitySchemes: options.securitySchemes ?? {},
    ...(options.identity ? { identity: options.identity } : {}),
    http,
  });
  try {
    const result = await client.request(operation, step.input as never, {
      deadlineAtMs: Date.now() + (step.timeoutMs ?? 5_000),
      ...(step.cancel ? { cancellation: source.cancellation } : {}),
    });
    return browserSerializable(result) as BrowserStepResult;
  } finally {
    cleanupCancellation();
  }
}

/** 顺序执行页面计划，逐项返回可序列化结果；单步失败不中断后续步骤。 */
export async function run(
  plan: ReadonlyArray<BrowserPlanStep>,
  options: BrowserRunnerOptions = {},
): Promise<BrowserStepResult[]> {
  const results: BrowserStepResult[] = [];
  for (const step of plan) results.push(await runStep(step, options));
  return results;
}
