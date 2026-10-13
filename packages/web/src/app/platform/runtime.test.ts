import { afterEach, expect, test, vi } from 'vitest';
import { browserClock, browserVisibility, createBrowserCancellation } from './runtime';

afterEach(() => vi.useRealTimers());

test('browser runtime ports delegate clock, visibility and cancellation deterministically', () => {
  vi.useFakeTimers();
  const callback = vi.fn();
  const clock = browserClock();
  const handle = clock.setTimeout(callback, 25);
  clock.clearTimeout(handle);
  vi.advanceTimersByTime(25);
  expect(callback).not.toHaveBeenCalled();
  expect(clock.now()).toBeGreaterThan(0);

  const visibilityListener = vi.fn();
  const visibility = browserVisibility();
  const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  expect(visibility.isVisible()).toBe(false);
  const unsubscribe = visibility.subscribe(visibilityListener);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(visibility.isVisible()).toBe(true);
  expect(visibilityListener).toHaveBeenLastCalledWith(true);
  unsubscribe();
  document.dispatchEvent(new Event('visibilitychange'));
  expect(visibilityListener).toHaveBeenCalledTimes(1);
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);

  const cancellation = createBrowserCancellation();
  const first = vi.fn();
  const second = vi.fn();
  const unsubscribeFirst = cancellation.port.subscribe(first);
  cancellation.port.subscribe(second);
  expect(cancellation.port.isCancelled()).toBe(false);
  unsubscribeFirst();
  cancellation.cancel();
  expect(cancellation.port.isCancelled()).toBe(true);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});
