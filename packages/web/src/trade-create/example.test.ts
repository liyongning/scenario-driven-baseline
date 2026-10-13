import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { parse } from 'yaml';
import { beforeEach, expect, test, vi } from 'vitest';
import { scenarioTest } from '../__tests__/support';
import AppRoot from '../app/AppRoot/AppRoot.vue';
import { applicationContext } from '../app/platform/url-context';
import { useApplicationStore } from '../store';
import { createDisplayState } from './core/display';
import { createOutcomeForCode, createTradeOutcomeByCode } from './adapters/outcomes';
import { getTradeOutcomeByCode } from '../trade-status/adapters/outcomes';
import { listTradesOutcomeByCode } from '../trade-list/adapters/outcomes';
import type { CreateTradePort } from './ports';
import TradeCreate from './ui/TradeCreate/TradeCreate.vue';
import TradeList from '../trade-list/ui/TradeList/TradeList.vue';
import TradeStatus from '../trade-status/ui/TradeStatus/TradeStatus.vue';

const trade = { trade_no: 'T-1', status: 'CREATED', amount: 25, merchant_id: 1001 } as const;

beforeEach(() => setActivePinia(createPinia()));

function runtime() {
  return {
    clock: { now: () => 0, setTimeout: () => 1, clearTimeout: () => undefined },
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
    createCancellation: () => ({
      port: { isCancelled: () => false, subscribe: () => () => undefined },
      cancel: () => undefined,
    }),
  };
}

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-001',
    caseId: 'create-form',
    checks: ['single-create', 'token-from-url', 'current-trade-shown'],
  },
  async ({ expect, checkpoint }) => {
    const context = applicationContext('?token=unit-token&merchant=1001');
    const calls: unknown[] = [];
    const createTrade: CreateTradePort = {
      async submit(input) {
        calls.push(input);
        return { kind: 'success', trade };
      },
    };
    const wrapper = mount(AppRoot, {
      props: {
        context,
        createTrade,
        getTrade: {
          async get() {
            return new Promise<never>(() => undefined);
          },
        },
        listTrades: {
          async list() {
            return { kind: 'success', items: [trade] };
          },
        },
        runtime: runtime(),
      },
    });
    await checkpoint('single-create', async () => {
      expect(calls).toEqual([]);
      await wrapper.get('[data-testid="amount-input"]').setValue('25');
      await wrapper.get('[data-testid="create-submit"]').trigger('submit');
      await flushPromises();
      expect(calls).toEqual([{ merchantId: 1001, amount: 25, channel: 'WEB' }]);
    });
    await checkpoint('token-from-url', () => {
      expect(context).toEqual({ token: 'unit-token', merchantId: 1001 });
      expect(applicationContext('?token=other-token&merchant=7')).toEqual({
        token: 'other-token',
        merchantId: 7,
      });
      expect(wrapper.get('[data-testid="context-token"]').text()).toBe('unit-token');
    });
    await checkpoint('current-trade-shown', async () => {
      await flushPromises();
      expect(useApplicationStore().currentTrade).toEqual(trade);
      expect(wrapper.get('[data-testid="current-trade"]').text()).toContain('T-1');
    });
  },
);

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-007',
    caseId: 'state-layers',
    checks: ['layers-placed', 'global-shared-read'],
  },
  async ({ expect, checkpoint }) => {
    const create = mount(TradeCreate, {
      attachTo: document.body,
      props: {
        merchantId: 1001,
        createTrade: {
          async submit() {
            return { kind: 'success' as const, trade };
          },
        },
      },
    });
    await create.get('[data-testid="amount-input"]').setValue('25');
    const amountInput = create.get('[data-testid="amount-input"]');
    (amountInput.element as HTMLInputElement).focus();

    await checkpoint('layers-placed', () => {
      expect((create.get('[data-testid="amount-input"]').element as HTMLInputElement).value).toBe(
        '25',
      );
      expect(document.activeElement).toBe(create.get('[data-testid="amount-input"]').element);
      const storeKeys = Object.keys(useApplicationStore());
      expect(storeKeys).not.toContain('amount');
      expect(storeKeys).not.toContain('focused');
    });
    (amountInput.element as HTMLInputElement).blur();

    let statusCalls = 0;
    let listCalls = 0;
    useApplicationStore().setCurrentTrade({ ...trade, status: 'SUCCEEDED' });
    const status = mount(TradeStatus, {
      props: {
        getTrade: {
          async get() {
            statusCalls += 1;
            return { kind: 'success', trade: { ...trade, status: 'SUCCEEDED' } };
          },
        },
        runtime: runtime(),
      },
    });
    const list = mount(TradeList, {
      props: {
        merchantId: 1001,
        listTrades: {
          async list() {
            listCalls += 1;
            return { kind: 'success', items: [{ ...trade, status: 'SUCCEEDED' }] };
          },
        },
      },
    });
    await flushPromises();
    await checkpoint('global-shared-read', () => {
      expect(useApplicationStore().currentTrade).toEqual({ ...trade, status: 'SUCCEEDED' });
      expect(status.get('[data-testid="trade-status"]').text()).toContain('已完成');
      expect(statusCalls).toBe(0);
      expect(listCalls).toBe(1);
      expect(list.get('[data-testid="trade-list"]').text()).toContain('T-1');
    });
  },
);

test('transport failures render the shared loading failure component', async () => {
  const create = mount(TradeCreate, {
    props: {
      merchantId: 1001,
      createTrade: {
        async submit() {
          return { kind: 'transport-failure' as const };
        },
      },
    },
  });
  await create.get('[data-testid="amount-input"]').setValue('25');
  await create.get('[data-testid="create-submit"]').trigger('submit');
  await flushPromises();
  expect(create.get('[data-testid="loading-failure"]').text()).toContain('加载失败');

  useApplicationStore().setCurrentTrade(trade);
  const status = mount(TradeStatus, {
    props: {
      getTrade: {
        async get() {
          return { kind: 'transport-failure' as const };
        },
      },
      runtime: runtime(),
    },
  });
  await flushPromises();
  expect(status.get('[data-testid="loading-failure"]').text()).toContain('加载失败');
});

test('create form rejects invalid and duplicate submissions before calling the port', async () => {
  let resolveSubmit!: (result: { kind: 'success'; trade: typeof trade }) => void;
  const submit = vi.fn(
    () =>
      new Promise<{ kind: 'success'; trade: typeof trade }>((resolve) => {
        resolveSubmit = resolve;
      }),
  );
  const wrapper = mount(TradeCreate, {
    props: { merchantId: 1001, createTrade: { submit } },
  });

  await wrapper.get('form').trigger('submit');
  expect(submit).not.toHaveBeenCalled();
  expect(wrapper.get('[data-testid="create-result"]').text()).toContain('请求无效');

  await wrapper.get('[data-testid="amount-input"]').setValue('25');
  const first = wrapper.get('form').trigger('submit');
  await Promise.resolve();
  expect(wrapper.get('[data-testid="create-submit"]').attributes('disabled')).toBeDefined();
  await wrapper.get('form').trigger('submit');
  expect(submit).toHaveBeenCalledTimes(1);
  resolveSubmit({ kind: 'success', trade });
  await first;
  await flushPromises();
  expect(wrapper.get('[data-testid="create-result"]').text()).toContain('T-1');
});

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-004',
    caseId: 'code-outcomes',
    checks: ['code-outcome-shown', 'failure-no-follow-up'],
  },
  async ({ expect, checkpoint }) => {
    const outcomes = ['INVALID_REQUEST', 'TRADE_CONFLICT'] as const;
    const responses = outcomes.map((code) => {
      const outcome = createOutcomeForCode(code);
      return { kind: 'business-failure' as const, outcome };
    });
    let createCalls = 0;
    let statusCalls = 0;
    const wrapper = mount(AppRoot, {
      props: {
        context: { token: 'unit-token', merchantId: 1001 },
        createTrade: {
          async submit() {
            return responses[createCalls++]!;
          },
        },
        getTrade: {
          async get() {
            statusCalls += 1;
            return { kind: 'success', trade: { ...trade, status: 'SUCCEEDED' } };
          },
        },
        listTrades: {
          async list() {
            return { kind: 'success', items: [] };
          },
        },
        runtime: runtime(),
      },
    });
    for (const response of responses) {
      await wrapper.get('[data-testid="amount-input"]').setValue('25');
      await wrapper.get('[data-testid="create-submit"]').trigger('submit');
      await flushPromises();
      expect(wrapper.get('[data-testid="create-result"]').text()).toContain(
        response.outcome === 'invalid-request' ? '请求无效' : '交易冲突',
      );
    }
    await checkpoint('code-outcome-shown', () => {
      expect(createCalls).toBe(2);
      expect(wrapper.get('[data-testid="create-result"]').text()).toContain('交易冲突');
    });
    await checkpoint('failure-no-follow-up', () => {
      expect(statusCalls).toBe(0);
      expect(useApplicationStore().currentTrade).toBeNull();
    });
  },
);

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-010',
    caseId: 'code-table-reconcile',
    checks: ['codes-reconciled'],
  },
  async ({ expect, checkpoint }) => {
    const contract = parse(
      readFileSync(resolve(process.cwd(), 'packages/openapi/contracts/trade-v1.yaml'), 'utf8'),
    ) as {
      paths: Record<
        string,
        {
          post?: { operationId: string; 'x-business-codes': string[] };
          get?: { operationId: string; 'x-business-codes': string[] };
        }
      >;
      'x-common-business-codes': string[];
    };
    const operation = (id: string) => {
      for (const path of Object.values(contract.paths)) {
        for (const method of [path.post, path.get]) if (method?.operationId === id) return method;
      }
      throw new Error(`missing operation ${id}`);
    };
    await checkpoint('codes-reconciled', () => {
      for (const id of ['createTrade', 'getTrade', 'listTrades'] as const) {
        const expected = [
          ...contract['x-common-business-codes'],
          ...operation(id)['x-business-codes'],
        ];
        const outcomes = {
          createTrade: createTradeOutcomeByCode,
          getTrade: getTradeOutcomeByCode,
          listTrades: listTradesOutcomeByCode,
        } as const;
        expect(Object.keys(outcomes[id]).sort()).toEqual([...new Set(expected)].sort());
      }
    });
  },
);

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-011',
    caseId: 'unreachable-rewrite',
    checks: ['rewrite-covered'],
  },
  async ({ expect, checkpoint }) => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/web/src/trade-create/core/display.ts'),
      'utf8',
    );
    await checkpoint('rewrite-covered', () => {
      expect(createDisplayState({ kind: 'idle' })).toBe('等待创建');
      expect(createDisplayState({ kind: 'success', trade })).toBe('T-1 CREATED');
      expect(createDisplayState({ kind: 'transport-failure' })).toBe('加载失败，请稍后重试');
      expect(createDisplayState({ kind: 'failure', outcome: 'trade-not-found' })).toBe(
        '交易不存在',
      );
      expect(createDisplayState({ kind: 'failure', outcome: 'trade-conflict' })).toBe('交易冲突');
      expect(source).not.toMatch(/(?:v8|istanbul|c8)\s+ignore/);
    });
  },
);
