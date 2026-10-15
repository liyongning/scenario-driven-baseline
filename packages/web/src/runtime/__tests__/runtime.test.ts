import { expect, test } from 'vitest';
import { scenarioTest } from '../../__tests__/support';
import type { CancellationPort, ClockPort, VisibilityPort } from '../ports';
import { createGeneration } from '../generation';
import { createPoller } from '../poller';

class FakeClock implements ClockPort {
  private time = 0;
  private nextHandle = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  now() {
    return this.time;
  }

  setTimeout(callback: () => void, delayMs: number) {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.time + delayMs, callback });
    return handle;
  }

  clearTimeout(handle: number) {
    this.timers.delete(handle);
  }

  async advanceBy(delayMs: number) {
    this.time += delayMs;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= this.time)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      due[1].callback();
      await Promise.resolve();
    }
  }
}

function visibilityPort() {
  let visible = true;
  const listeners = new Set<(value: boolean) => void>();
  const port: VisibilityPort = {
    isVisible: () => visible,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    set(value: boolean) {
      visible = value;
      for (const listener of listeners) listener(value);
    },
  };
}

function cancellationPort() {
  let cancelled = false;
  const listeners = new Set<() => void>();
  const port: CancellationPort = {
    isCancelled: () => cancelled,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    cancel() {
      cancelled = true;
      for (const listener of listeners) listener();
    },
  };
}

test('generation advances and invalidates current values', () => {
  const generation = createGeneration();
  expect(generation.current()).toBe(0);
  const next = generation.next();
  expect(next).toBe(1);
  expect(generation.isCurrent(next)).toBe(true);
  generation.invalidate();
  expect(generation.isCurrent(next)).toBe(false);
});

test('poller covers hidden dispatch, stopped starts, error delivery and unsubscribe cleanup', async () => {
  const clock = new FakeClock();
  let visible = false;
  let visibilityListener: ((visible: boolean) => void) | undefined;
  const cancelled = false;
  const visibility: VisibilityPort = {
    isVisible: () => visible,
    subscribe(listener) {
      visibilityListener = listener;
      return () => undefined;
    },
  };
  const cancellation: CancellationPort = {
    isCancelled: () => cancelled,
    subscribe: () => () => undefined,
  };
  const values: string[] = [];
  const errors: unknown[] = [];
  const poller = createPoller({
    clock,
    visibility,
    cancellation,
    intervalMs: 10,
    query: async () => {
      visible = false;
      throw 'first failure';
    },
    isTerminal: () => false,
    onValue: (value) => values.push(value),
    onError: (error) => errors.push(error),
  });

  poller.start();
  poller.start();
  expect(values).toEqual([]);
  visibilityListener?.(true);
  await Promise.resolve();
  expect(errors).toEqual([]);
  visible = true;
  visibilityListener?.(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(errors).toEqual(['first failure']);
  poller.stop();
  expect(poller.isRunning()).toBe(false);

  let stopFromSubscribe = false;
  const stoppedVisibility: VisibilityPort = {
    isVisible: () => true,
    subscribe() {
      stoppedPoller.stop();
      stopFromSubscribe = true;
      return () => undefined;
    },
  };
  const stoppedPoller = createPoller({
    clock,
    visibility: stoppedVisibility,
    cancellation,
    intervalMs: 10,
    query: async () => 'never',
    isTerminal: () => true,
    onValue: () => undefined,
  });
  stoppedPoller.start();
  expect(stopFromSubscribe).toBe(true);
  expect(stoppedPoller.isRunning()).toBe(false);

  const alreadyCancelled = createPoller({
    clock,
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
    cancellation: { isCancelled: () => true, subscribe: () => () => undefined },
    intervalMs: 10,
    query: async () => 'never',
    isTerminal: () => true,
    onValue: () => undefined,
  });
  alreadyCancelled.start();
  expect(alreadyCancelled.isRunning()).toBe(true);
  alreadyCancelled.stop();
  alreadyCancelled.stop();
});

test('poller drops errors after cancellation without scheduler notification', async () => {
  const clock = new FakeClock();
  let cancelled = false;
  const errors: unknown[] = [];
  const poller = createPoller({
    clock,
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
    cancellation: { isCancelled: () => cancelled, subscribe: () => () => undefined },
    intervalMs: 10,
    query: async () => {
      cancelled = true;
      throw new Error('late failure');
    },
    isTerminal: () => false,
    onValue: () => undefined,
    onError: (error) => errors.push(error),
  });
  poller.start();
  await Promise.resolve();
  expect(errors).toEqual([]);
  expect(poller.isRunning()).toBe(false);
});

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-009',
    caseId: 'poller-fake-clock',
    checks: ['fake-clock-driven', 'cancel-stops', 'generation-discards', 'runtime-ports-only'],
  },
  async ({ expect, checkpoint }) => {
    await checkpoint('fake-clock-driven', async () => {
      const clock = new FakeClock();
      const visibility = visibilityPort();
      const cancellation = cancellationPort();
      const generation = createGeneration();
      const values = ['CREATED', 'PROCESSING', 'SUCCEEDED'];
      let queries = 0;
      const delivered: string[] = [];
      const poller = createPoller({
        clock,
        visibility: visibility.port,
        cancellation: cancellation.port,
        generation,
        intervalMs: 100,
        query: async () => values[queries++]!,
        isTerminal: (value) => value === 'SUCCEEDED',
        onValue: (value) => delivered.push(value),
      });
      poller.start();
      await Promise.resolve();
      expect(queries).toBe(1);
      visibility.set(false);
      expect(poller.isRunning()).toBe(true);
      await clock.advanceBy(99);
      expect(queries).toBe(1);
      visibility.set(true);
      await Promise.resolve();
      expect(queries).toBe(2);
      await clock.advanceBy(1);
      expect(queries).toBe(2);
      await clock.advanceBy(100);
      expect(queries).toBe(3);
      await clock.advanceBy(500);
      expect(queries).toBe(3);
      expect(delivered).toEqual(['CREATED', 'PROCESSING', 'SUCCEEDED']);
      poller.stop();
    });

    await checkpoint('cancel-stops', async () => {
      const clock = new FakeClock();
      const visibility = visibilityPort();
      const cancellation = cancellationPort();
      const generation = createGeneration();
      let resolveQuery: ((value: string) => void) | undefined;
      const delivered: string[] = [];
      const poller = createPoller({
        clock,
        visibility: visibility.port,
        cancellation: cancellation.port,
        generation,
        intervalMs: 100,
        query: () => new Promise<string>((resolve) => (resolveQuery = resolve)),
        isTerminal: () => false,
        onValue: (value) => delivered.push(value),
      });
      poller.start();
      await Promise.resolve();
      cancellation.cancel();
      resolveQuery?.('CREATED');
      await Promise.resolve();
      await clock.advanceBy(500);
      expect(delivered).toEqual([]);
      expect(poller.isRunning()).toBe(false);
    });

    await checkpoint('generation-discards', async () => {
      const clock = new FakeClock();
      const visibility = visibilityPort();
      const cancellation = cancellationPort();
      const generation = createGeneration();
      let resolveQuery: ((value: string) => void) | undefined;
      const delivered: string[] = [];
      const poller = createPoller({
        clock,
        visibility: visibility.port,
        cancellation: cancellation.port,
        generation,
        intervalMs: 100,
        query: () => new Promise<string>((resolve) => (resolveQuery = resolve)),
        isTerminal: () => true,
        onValue: (value) => delivered.push(value),
      });
      const current = generation.current();
      poller.start();
      await Promise.resolve();
      generation.invalidate();
      expect(generation.isCurrent(current)).toBe(false);
      resolveQuery?.('SUCCEEDED');
      await Promise.resolve();
      await clock.advanceBy(500);
      expect(delivered).toEqual([]);
    });

    await checkpoint('runtime-ports-only', () => {
      const source = String(createPoller);
      expect(source).toContain('clock');
      expect(source).toContain('visibility');
      expect(source).toContain('cancellation');
      expect(source).not.toMatch(/\bwindow\b|\bdocument\b|(?<!\.)\bsetTimeout\s*\(/);
    });
  },
);
