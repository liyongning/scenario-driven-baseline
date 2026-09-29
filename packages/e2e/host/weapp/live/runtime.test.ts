import { afterEach, expect, test, vi } from 'vitest';
import { createLiveRuntime } from './runtime';

afterEach(() => vi.useRealTimers());

test('Live runtime creates distinct controlled request IDs and cancellable waits', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const runtime = createLiveRuntime();
  expect(runtime.nowMs()).toBe(1000);
  expect(runtime.nextRequestId()).toMatch(/^live-[a-z0-9]+-[0-9a-f]{16}-\d+$/);
  expect(runtime.nextRequestId()).not.toBe(runtime.nextRequestId());

  let stop!: () => void;
  const cancellation = { isStopped: () => false, subscribe(listener: () => void) { stop = listener; return vi.fn(); } };
  const pending = runtime.sleepMs(60_000, cancellation);
  stop();
  await expect(pending).resolves.toBeUndefined();
  stop();
  await expect(runtime.sleepMs(0)).resolves.toBeUndefined();
  await expect(runtime.sleepMs(1, { isStopped: () => true, subscribe: () => () => undefined })).resolves.toBeUndefined();
  const timed = runtime.sleepMs(10);
  await vi.advanceTimersByTimeAsync(10);
  await expect(timed).resolves.toBeUndefined();
  let syncUnsubscribed = false;
  await expect(runtime.sleepMs(10, { isStopped: () => false, subscribe(listener) { listener(); return () => { syncUnsubscribed = true; }; } })).resolves.toBeUndefined();
  expect(syncUnsubscribed).toBe(true);
});
