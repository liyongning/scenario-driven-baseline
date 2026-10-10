import { afterEach, expect, expectTypeOf, test, vi } from 'vitest';
import type { Cancellation } from '@daqian/template-protocol';
import type { RuntimePort } from './port';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(1296);
  vi.resetModules();
  return (await import('./default')).createDefaultRuntime;
}

test(
  'SCN-PROTOCOL-CONTRACT-008 runtime-port-shape',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-008',
        caseId: 'runtime-port-shape',
        fixtureCase: null,
        environment: 'sdk-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-008',
            caseKey: 'runtime-port-shape',
            checks: ['host-cannot-override'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const create = await setup();
    const runtime = create();
    context.expect(runtime.nowMs()).toBe(1296);
    // 端口类型与实例都不再有请求 ID 能力：宿主无法覆盖（PC-05）。
    expectTypeOf<RuntimePort>().not.toHaveProperty('nextRequestId');
    context.expect(Object.keys(runtime).sort()).toEqual(['nowMs', 'sleepMs']);
    context.expect('nextRequestId' in runtime).toBe(false);
    const sdk = await import('../index');
    context.expect(Object.keys(sdk).filter((name) => /requestId/i.test(name))).toEqual([]);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['host-cannot-override'],
      }),
      'scenario-evidence',
    );
  },
);

test('普通等待按时结束', async () => {
  const create = await setup();
  let done = false;
  const wait = create()
    .sleepMs(10)
    .then(() => {
      done = true;
    });
  await vi.advanceTimersByTimeAsync(9);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await wait;
  expect(done).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

function cancellation() {
  let stopped = false;
  let listener: (() => void) | undefined;
  let subscriptions = 0;
  const value: Cancellation = {
    isStopped: () => stopped,
    subscribe(callback) {
      listener = callback;
      subscriptions++;
      return () => {
        subscriptions--;
        listener = undefined;
      };
    },
  };
  return {
    value,
    stop() {
      stopped = true;
      listener?.();
    },
    subscriptions: () => subscriptions,
  };
}

test('停止结束等待并清理定时器和订阅，不等待旧时间', async () => {
  const create = await setup();
  const cancel = cancellation();
  const wait = create().sleepMs(100, cancel.value);
  expect(cancel.subscriptions()).toBe(1);
  cancel.stop();
  await wait;
  expect(cancel.subscriptions()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test('已停止不登记等待；正常到时解除取消订阅', async () => {
  const create = await setup();
  const stopped = cancellation();
  stopped.stop();
  await create().sleepMs(100, stopped.value);
  expect(vi.getTimerCount()).toBe(0);
  expect(stopped.subscriptions()).toBe(0);
  const cancel = cancellation();
  const wait = create().sleepMs(1, cancel.value);
  await vi.advanceTimersByTimeAsync(1);
  await wait;
  expect(cancel.subscriptions()).toBe(0);
});

test('订阅时同步停止也清理订阅，迟到停止不能再次结束', async () => {
  const create = await setup();
  let unsubscribed = false;
  let late: (() => void) | undefined;
  await create().sleepMs(100, {
    isStopped: () => false,
    subscribe(listener) {
      late = listener;
      listener();
      return () => {
        unsubscribed = true;
      };
    },
  });
  late?.();
  expect(unsubscribed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
