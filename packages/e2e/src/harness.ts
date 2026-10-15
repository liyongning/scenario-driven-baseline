export type HarnessEvent = Readonly<{
  sequence: number;
  kind: 'provider' | 'http' | 'channel' | 'phase' | 'outcome';
  detail: Readonly<Record<string, unknown>>;
}>;

/** 收集同一次真实 SDK 运行的外部边界顺序，不接受 Fixture 注入阶段事件。 */
export function createHarness(attemptId: string) {
  const events: HarnessEvent[] = [];
  return {
    record(kind: HarnessEvent['kind'], detail: Readonly<Record<string, unknown>>) {
      events.push({ sequence: events.length + 1, kind, detail: { ...detail } });
    },
    snapshot() {
      return {
        attemptId,
        events: events.map((event) => ({ ...event, detail: { ...event.detail } })),
      };
    },
  };
}

export type WaitForCallsOptions = Readonly<{
  timeoutMs?: number;
  intervalMs?: number;
}>;

/** 轮询等待 Shadow 记录达到条件；超时错误携带当前记录，避免只报一个模糊超时。 */
export async function waitForCalls<T>(
  read: () => ReadonlyArray<T>,
  predicate: (records: ReadonlyArray<T>) => boolean,
  options: WaitForCallsOptions = {},
): Promise<ReadonlyArray<T>> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const records = [...read()];
    if (predicate(records)) return records;
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error(`waitForCalls timed out after ${timeoutMs}ms: ${JSON.stringify(records)}`);
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
}
