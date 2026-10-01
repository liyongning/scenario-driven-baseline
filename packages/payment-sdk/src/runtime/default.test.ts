import { afterEach, expect, test, vi } from 'vitest';
import type { Cancellation } from '@daqian/payment-protocol';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.resetModules(); });

async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(1296);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.resetModules();
  return (await import('./default')).createDefaultRuntime;
}

test('请求标识采用固定公式，跨实例共享序号，同毫秒与时间回拨不重复', async () => {
  const create = await setup();
  const first = create(); const second = create();
  expect(first.nowMs()).toBe(1296);
  expect(first.nextRequestId()).toBe('pay-100-i-1');
  expect(second.nextRequestId()).toBe('pay-100-i-2');
  vi.setSystemTime(36);
  expect(first.nextRequestId()).toBe('pay-10-i-3');
  const ids = Array.from({ length: 1000 }, () => second.nextRequestId());
  expect(new Set(ids).size).toBe(1000);
  for (const id of ids) { expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/); expect(id.length).toBeLessThanOrEqual(128); }
});

test('普通等待按时结束', async () => {
  const create = await setup();
  let done = false;
  const wait = create().sleepMs(10).then(() => { done = true; });
  await vi.advanceTimersByTimeAsync(9); expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1); await wait;
  expect(done).toBe(true); expect(vi.getTimerCount()).toBe(0);
});

function cancellation() {
  let stopped = false; let listener: (() => void) | undefined; let subscriptions = 0;
  const value: Cancellation = { isStopped: () => stopped, subscribe(callback) { listener = callback; subscriptions++; return () => { subscriptions--; listener = undefined; }; } };
  return { value, stop() { stopped = true; listener?.(); }, subscriptions: () => subscriptions };
}

test('停止结束等待并清理定时器和订阅，不等待旧时间', async () => {
  const create = await setup(); const cancel = cancellation();
  const wait = create().sleepMs(100, cancel.value);
  expect(cancel.subscriptions()).toBe(1); cancel.stop(); await wait;
  expect(cancel.subscriptions()).toBe(0); expect(vi.getTimerCount()).toBe(0);
});

test('已停止不登记等待；正常到时解除取消订阅', async () => {
  const create = await setup(); const stopped = cancellation(); stopped.stop();
  await create().sleepMs(100, stopped.value);
  expect(vi.getTimerCount()).toBe(0); expect(stopped.subscriptions()).toBe(0);
  const cancel = cancellation(); const wait = create().sleepMs(1, cancel.value);
  await vi.advanceTimersByTimeAsync(1); await wait;
  expect(cancel.subscriptions()).toBe(0);
});

test('订阅时同步停止也清理订阅，迟到停止不能再次结束', async () => {
  const create = await setup(); let unsubscribed = false; let late: (() => void) | undefined;
  await create().sleepMs(100, { isStopped: () => false, subscribe(listener) { late = listener; listener(); return () => { unsubscribed = true; }; } });
  late?.(); expect(unsubscribed).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
