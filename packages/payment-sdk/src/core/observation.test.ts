import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BackendResult } from '../ports/backend';
import type { Cancellation } from '../contracts';
import { createDefaultRuntime } from '../runtime/default';
import { createCleanup, requestOnce } from './observation';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

it('cleanup notifies each listener once, isolates abort errors and immediately acknowledges a late subscription', () => {
  const cleanup = createCleanup(); const trace: string[] = [];
  cleanup.signal.subscribe(() => { trace.push('abort-throws'); throw new Error('fixture-abort'); });
  cleanup.signal.subscribe(() => { trace.push('second-request'); });
  const unsubscribe = cleanup.signal.subscribe(() => { trace.push('removed'); }); unsubscribe();
  cleanup.stop(); cleanup.stop();
  const unsubscribeLate = cleanup.signal.subscribe(() => { trace.push('late'); }); unsubscribeLate();
  expect(cleanup.signal.isStopped()).toBe(true);
  expect(trace).toEqual(['abort-throws', 'second-request', 'late']);
});

it('an already ended owner prevents provider execution and detaches a synchronous subscription', async () => {
  const execute = vi.fn(); const result = vi.fn(); let detached = 0;
  const cleanup: Cancellation = { isStopped: () => true, subscribe(listener) { listener(); return () => { detached++; }; } };
  await requestOnce(execute, createDefaultRuntime(), 50, { cleanup }, result);
  expect(execute).toHaveBeenCalledTimes(0); expect(result).toHaveBeenCalledTimes(0); expect(detached).toBe(1); expect(vi.getTimerCount()).toBe(0);
});

it('a stopped owner discovered before scheduling prevents provider execution', async () => {
  const execute = vi.fn(); const result = vi.fn();
  await requestOnce(execute, createDefaultRuntime(), 50, { active: () => false }, result);
  expect(execute).toHaveBeenCalledTimes(0); expect(result).toHaveBeenCalledTimes(0); expect(vi.getTimerCount()).toBe(0);
});

it('an exhausted per-request budget never enters the provider and returns a public TIMEOUT result', async () => {
  const execute = vi.fn(); const result = vi.fn();
  await requestOnce(execute, createDefaultRuntime(), 0, {}, result);
  expect(execute).toHaveBeenCalledTimes(0); expect(result.mock.calls).toEqual([[{ ok: false, error: { code: 'TIMEOUT', source: 'sdk', message: '支付请求超时，请稍后确认支付结果' } }]]); expect(vi.getTimerCount()).toBe(0);
});

it('locks the accepted request before synchronous abort and ignores its cancellation/late resolution', async () => {
  const runtime = createDefaultRuntime(); const trace: string[] = [];
  let reply!: (value: BackendResult<number>) => void;
  const execution = requestOnce<number>(async context => {
    context.cancellation?.subscribe(() => { trace.push('abort'); reply({ ok: false, cancelled: true }); });
    return new Promise(resolve => { reply = resolve; });
  }, runtime, 5, {}, value => { trace.push(value.ok ? 'success' : value.error.code); });
  await vi.advanceTimersByTimeAsync(5); await execution;
  reply({ ok: true, value: 1 }); await vi.advanceTimersByTimeAsync(50);
  expect(trace).toEqual(['TIMEOUT', 'abort']); expect(vi.getTimerCount()).toBe(0);
});

it('attributes a protocol timeout at the shared deadline to the SDK budget owner', async () => {
  const result = vi.fn();
  const execution = requestOnce(async () => {
    await vi.advanceTimersByTimeAsync(5);
    return { ok: false as const, error: { code: 'TIMEOUT' as const, source: 'network' as const, message: '支付请求超时，请稍后确认支付结果' } };
  }, createDefaultRuntime(), 5, {}, result);
  await vi.runAllTimersAsync();
  await execution;
  expect(result).toHaveBeenCalledWith({ ok: false, error: { code: 'TIMEOUT', source: 'sdk', message: '支付请求超时，请稍后确认支付结果' } });
});
