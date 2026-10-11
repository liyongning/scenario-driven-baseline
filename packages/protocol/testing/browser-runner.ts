import {
  createFetchHttp,
  createProtocolClient,
  type Cancellation,
} from '@daqian/template-protocol';
import type { RpcMethodMeta } from '@daqian/template-protocol/generated/std';
import * as tradeIdl from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';

/** 浏览器计划中的取消时点；in-flight 在 fetch 已启动后通知停止。 */
export type BrowserRunnerCancel = 'before-send' | 'in-flight';
export type BrowserPlanStep = Readonly<{
  method: string;
  input: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  cancel?: BrowserRunnerCancel;
}>;
export type BrowserStepResult = Readonly<Record<string, unknown>>;

const generatedIdlModules: ReadonlyArray<Record<string, unknown>> = [tradeIdl];

/** 按接口名扫描 generated 导出，不写死任何业务接口。 */
function findMethod(name: string): RpcMethodMeta<unknown, unknown> | undefined {
  for (const module of generatedIdlModules) {
    for (const value of Object.values(module)) {
      const meta = (value as { meta?: RpcMethodMeta<unknown, unknown> } | null)?.meta;
      if (meta?.name === name && meta.method && meta.path && meta.requestCodec) return meta;
    }
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

/** 将协议客户端的真实结果投影为可经 JSON 通道传递的形态。 */
export function browserSerializable(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)),
  ) as unknown;
}

async function runStep(step: BrowserPlanStep): Promise<BrowserStepResult> {
  const meta = findMethod(step.method);
  if (!meta) return { ok: false, error: { code: 'UNRESOLVED_METHOD', method: step.method } };

  let input: unknown;
  try {
    input = meta.requestCodec!.fromJSON(step.input);
  } catch {
    return { ok: false, error: { code: 'CODEC_ERROR', method: step.method } };
  }

  const source = cancellationSource();
  if (step.cancel === 'before-send') source.stop();
  const rawHttp = createFetchHttp();
  const http =
    step.cancel === 'in-flight'
      ? {
          send(request: Parameters<typeof rawHttp.send>[0]) {
            const pending = rawHttp.send(request);
            queueMicrotask(source.stop);
            return pending;
          },
        }
      : rawHttp;
  const client = createProtocolClient({
    gatewayBaseUrl: '',
    getAccessToken: () => 'browser-fixture-token',
    http,
    runtime: {
      nowMs: () => Date.now(),
      sleepMs: () => new Promise<void>(() => undefined),
    },
  });
  const timeoutMs = step.timeoutMs ?? meta.timeoutMs ?? 5_000;
  const result = await client.request(meta, input, {
    deadlineAtMs: Date.now() + timeoutMs,
    ...(step.cancel ? { cancellation: source.cancellation } : {}),
  });
  return browserSerializable(result) as BrowserStepResult;
}

/** 顺序执行页面下发计划，逐项返回可序列化结果；单个步骤失败不会中断后续步骤。 */
export async function run(plan: ReadonlyArray<BrowserPlanStep>): Promise<BrowserStepResult[]> {
  const results: BrowserStepResult[] = [];
  for (const step of plan) results.push(await runStep(step));
  return results;
}
