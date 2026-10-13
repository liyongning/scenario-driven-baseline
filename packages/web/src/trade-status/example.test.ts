import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { beforeEach, expect, test } from 'vitest';
import { scenarioTest } from '../__tests__/support';
import { useApplicationStore } from '../store';
import TradeStatus from './ui/TradeStatus/TradeStatus.vue';
import type { TradeStatusPort } from './ports';

class FakeTimers {
  private time = 0;
  private handle = 0;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();
  now() {
    return this.time;
  }
  setTimeout(callback: () => void, delayMs: number) {
    const handle = ++this.handle;
    this.timers.set(handle, { at: this.time + delayMs, callback });
    return handle;
  }
  clearTimeout(handle: number) {
    this.timers.delete(handle);
  }
  async advance(delayMs: number) {
    this.time += delayMs;
    for (;;) {
      const next = [...this.timers.entries()].find(([, timer]) => timer.at <= this.time);
      if (!next) break;
      this.timers.delete(next[0]);
      next[1].callback();
      await Promise.resolve();
    }
  }
}

function visibility() {
  return { isVisible: () => true, subscribe: () => () => undefined };
}

const trade = { trade_no: 'T-1', status: 'CREATED', amount: 25, merchant_id: 1001 } as const;

beforeEach(() => setActivePinia(createPinia()));

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-002',
    caseId: 'status-view',
    checks: ['pending-shown', 'terminal-stops'],
  },
  async ({ expect, checkpoint }) => {
    const clock = new FakeTimers();
    const statuses = ['PROCESSING', 'SUCCEEDED'] as const;
    let calls = 0;
    const cancelled: boolean[] = [];
    const getTrade: TradeStatusPort = {
      async get() {
        const status = statuses[calls++]!;
        return { kind: 'success', trade: { ...trade, status } };
      },
    };
    useApplicationStore().setCurrentTrade(trade);
    const wrapper = mount(TradeStatus, {
      props: {
        getTrade,
        runtime: {
          clock,
          visibility: visibility(),
          createCancellation: () => ({
            port: { isCancelled: () => false, subscribe: () => () => undefined },
            cancel: () => {
              cancelled.push(true);
            },
          }),
        },
      },
    });
    await flushPromises();
    await checkpoint('pending-shown', () => {
      expect(calls).toBe(1);
      expect(wrapper.get('[data-testid="trade-status"]').text()).toContain('进行中');
      expect(wrapper.find('[data-testid="loading-indicator"]').exists()).toBe(true);
    });
    await clock.advance(100);
    await flushPromises();
    await checkpoint('terminal-stops', async () => {
      expect(useApplicationStore().currentTrade?.status).toBe('SUCCEEDED');
      expect(wrapper.get('[data-testid="trade-status"]').text()).toContain('已完成');
      await clock.advance(500);
      expect(calls).toBe(2);
      wrapper.unmount();
      expect(cancelled).toEqual([true]);
    });
  },
);

test('trade status labels failed, cancelled and absent trades', async () => {
  const applicationStore = useApplicationStore();
  applicationStore.setCurrentTrade({ ...trade, status: 'FAILED' });
  const wrapper = mount(TradeStatus, {
    props: {
      getTrade: {
        async get() {
          return { kind: 'success' as const, trade };
        },
      },
      runtime: {
        clock: new FakeTimers(),
        visibility: visibility(),
        createCancellation: () => ({
          port: { isCancelled: () => false, subscribe: () => () => undefined },
          cancel: () => undefined,
        }),
      },
    },
  });
  expect(wrapper.get('[data-testid="trade-status"]').text()).toContain('失败');

  applicationStore.setCurrentTrade({ ...trade, status: 'CANCELLED' });
  await nextTick();
  expect(wrapper.get('[data-testid="trade-status"]').text()).toContain('已取消');

  applicationStore.clearCurrentTrade();
  await nextTick();
  expect(wrapper.get('[data-testid="trade-status"]').text()).toContain('暂无交易');
});
