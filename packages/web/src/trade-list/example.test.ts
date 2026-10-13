import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, test } from 'vitest';
import { scenarioTest } from '../__tests__/support';
import { useApplicationStore } from '../store';
import TradeList from './ui/TradeList/TradeList.vue';
import type { TradeListPort } from './ports';

const trade = { trade_no: 'T-1', status: 'CREATED', amount: 25, merchant_id: 1001 } as const;
const completed = { ...trade, status: 'SUCCEEDED' } as const;

beforeEach(() => setActivePinia(createPinia()));

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-003',
    caseId: 'list-view',
    checks: ['merchant-from-url', 'list-rendered'],
  },
  async ({ expect, checkpoint }) => {
    let calls = 0;
    const port: TradeListPort = {
      async list(merchantId) {
        calls += 1;
        expect(merchantId).toBe(42);
        return { kind: 'success', items: [completed] };
      },
    };
    const wrapper = mount(TradeList, { props: { merchantId: 42, listTrades: port } });
    expect(calls).toBe(0);
    useApplicationStore().setCurrentTrade(completed);
    await flushPromises();
    await checkpoint('merchant-from-url', () => expect(calls).toBe(1));
    await checkpoint('list-rendered', () => {
      expect(wrapper.get('[data-testid="trade-list"]').text()).toContain('T-1');
      expect(wrapper.get('[data-testid="trade-list"]').text()).toContain('已完成');
    });
  },
);

test('trade list renders every terminal and active status label', async () => {
  useApplicationStore().setCurrentTrade(completed);
  const wrapper = mount(TradeList, {
    props: {
      merchantId: 42,
      listTrades: {
        async list() {
          return {
            kind: 'success' as const,
            items: [
              { ...trade, trade_no: 'T-1', status: 'SUCCEEDED' as const },
              { ...trade, trade_no: 'T-2', status: 'FAILED' as const },
              { ...trade, trade_no: 'T-3', status: 'CANCELLED' as const },
              { ...trade, trade_no: 'T-4', status: 'CREATED' as const },
            ],
          };
        },
      },
    },
  });
  await flushPromises();
  const text = wrapper.text();
  expect(text).toContain('已完成');
  expect(text).toContain('失败');
  expect(text).toContain('已取消');
  expect(text).toContain('进行中');
});

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-005',
    caseId: 'transport-failure-view',
    checks: ['failure-component-shown'],
  },
  async ({ expect, checkpoint }) => {
    useApplicationStore().setCurrentTrade(completed);
    const wrapper = mount(TradeList, {
      props: {
        merchantId: 42,
        listTrades: {
          async list() {
            return { kind: 'transport-failure' as const };
          },
        },
      },
    });
    await flushPromises();
    await checkpoint('failure-component-shown', () => {
      expect(wrapper.find('[data-testid="loading-failure"]').exists()).toBe(true);
      expect(wrapper.get('[data-testid="loading-failure"]').text()).toContain('加载失败');
    });
  },
);
