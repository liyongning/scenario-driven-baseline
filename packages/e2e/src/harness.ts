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
