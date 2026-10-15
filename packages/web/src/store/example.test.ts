// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia';
import { createFetchHttp, createRestClient } from '@daqian/template-openapi';
import { beforeEach, vi } from 'vitest';
import { scenarioTest } from '../__tests__/support';
import { createTradeStatusPort } from '../trade-status/adapters/openapi';
import { useApplicationStore, type ApplicationStore } from './index';

const writes = {
  configure: ['apiBaseUrl'],
  setCurrentTrade: ['currentTrade'],
  beginAttempt: ['generation'],
  commitAttempt: ['currentTrade'],
  cancelPending: ['generation', 'abortCount'],
  clearCurrentTrade: ['currentTrade'],
} as const;

function snapshot(store: ApplicationStore) {
  return Object.fromEntries(
    Object.entries(store).filter(
      ([key, value]) => key !== 'configured' && typeof value !== 'function',
    ),
  );
}

function changedKeys(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
) {
  return Object.keys(after).filter((key) => before[key] !== after[key]);
}

function auditAction(
  store: ApplicationStore,
  name: keyof typeof writes,
  action: () => void,
): string[] {
  const before = snapshot(store);
  action();
  const after = snapshot(store);
  const changed = changedKeys(before, after);
  const extras = changed.filter((key) => !writes[name].includes(key as never));
  const missing = writes[name].filter((key) => !changed.includes(key));
  return [
    ...extras.map((key) => `${name} wrote ${key}`),
    ...missing.map((key) => `${name} missed ${key}`),
  ];
}

const trade = { trade_no: 'T-1', status: 'CREATED', amount: 10, merchant_id: 1001 } as const;

beforeEach(() => setActivePinia(createPinia()));

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-007',
    caseId: 'store-write-audit',
    checks: ['write-audit-exact', 'write-audit-catches-extra'],
  },
  async ({ expect, checkpoint }) => {
    await checkpoint('write-audit-exact', () => {
      const applicationStore = useApplicationStore();
      expect(
        auditAction(applicationStore, 'configure', () => applicationStore.configure('/api')),
      ).toEqual([]);
      expect(
        auditAction(applicationStore, 'setCurrentTrade', () =>
          applicationStore.setCurrentTrade(trade),
        ),
      ).toEqual([]);
      expect(
        auditAction(applicationStore, 'beginAttempt', () => applicationStore.beginAttempt()),
      ).toEqual([]);
      expect(
        auditAction(applicationStore, 'commitAttempt', () =>
          applicationStore.commitAttempt(applicationStore.generation, {
            ...trade,
            status: 'PROCESSING',
          }),
        ),
      ).toEqual([]);
      expect(
        auditAction(applicationStore, 'cancelPending', () => applicationStore.cancelPending()),
      ).toEqual([]);
      expect(
        auditAction(applicationStore, 'clearCurrentTrade', () =>
          applicationStore.clearCurrentTrade(),
        ),
      ).toEqual([]);
    });

    await checkpoint('write-audit-catches-extra', () => {
      const applicationStore = useApplicationStore() as ApplicationStore & { hidden?: boolean };
      expect(
        auditAction(applicationStore, 'setCurrentTrade', () => {
          applicationStore.clearCurrentTrade();
          applicationStore.setCurrentTrade(trade);
          Reflect.set(applicationStore, 'hidden', true);
        }),
      ).toEqual(['setCurrentTrade wrote hidden']);
    });
  },
);

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-007',
    caseId: 'store-generation',
    checks: ['stale-generation-dropped', 'navigation-aborts'],
  },
  async ({ expect, checkpoint }) => {
    const applicationStore = useApplicationStore();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = applicationStore.beginAttempt(() => firstController.abort());
    const second = applicationStore.beginAttempt(() => secondController.abort());
    await checkpoint('stale-generation-dropped', () => {
      expect(applicationStore.commitAttempt(first, { ...trade, status: 'FAILED' })).toBe(false);
      expect(applicationStore.currentTrade).toBeNull();
      expect(applicationStore.commitAttempt(second, trade)).toBe(true);
      expect(applicationStore.currentTrade).toEqual(trade);
    });
    await checkpoint('navigation-aborts', async () => {
      applicationStore.cancelPending();
      expect(firstController.signal.aborted).toBe(true);
      expect(secondController.signal.aborted).toBe(true);
      expect(applicationStore.commitAttempt(second, { ...trade, status: 'FAILED' })).toBe(false);
      expect(applicationStore.currentTrade).toEqual(trade);

      const requestController = new AbortController();
      const attempt = applicationStore.beginAttempt(() => requestController.abort());
      const originalFetch = globalThis.fetch;
      let fetchSignal: AbortSignal | undefined;
      globalThis.fetch = vi.fn((_url, init) => {
        fetchSignal = init.signal as AbortSignal;
        return new Promise((resolve) => {
          const finish = () =>
            resolve({
              status: 200,
              headers: { forEach: () => undefined },
              text: async () =>
                JSON.stringify({
                  code: 0,
                  message: 'ok',
                  data: { ...trade, status: 'PROCESSING' },
                }),
            });
          fetchSignal!.addEventListener('abort', finish, { once: true });
          setTimeout(finish, 50);
        });
      }) as typeof fetch;
      try {
        const client = createRestClient({
          gatewayBaseUrl: 'https://fixture.invalid',
          http: createFetchHttp(),
          identity: { scheme: 'accessToken', token: 'fixture-token' },
          securitySchemes: {
            accessToken: { type: 'apiKey', in: 'header', name: 'X-Access-Token' },
          },
        });
        const pending = createTradeStatusPort(client).get(trade.trade_no, requestController.signal);
        applicationStore.cancelPending();
        expect(requestController.signal.aborted).toBe(true);
        await vi.waitFor(() => expect(fetchSignal?.aborted).toBe(true));
        await expect(pending).resolves.toEqual({ kind: 'transport-failure' });
        expect(applicationStore.commitAttempt(attempt, { ...trade, status: 'FAILED' })).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  },
);
