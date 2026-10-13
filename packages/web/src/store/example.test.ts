// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach } from 'vitest';
import { scenarioTest } from '../__tests__/support';
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
  return {
    apiBaseUrl: store.apiBaseUrl,
    currentTrade: store.currentTrade,
    generation: store.generation,
    abortCount: store.abortCount,
  };
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
      const before = { currentTrade: null, generation: 0 };
      const after = { currentTrade: trade, generation: 0, hidden: true };
      expect(changedKeys(before, after)).toEqual(['currentTrade', 'hidden']);
      expect(
        changedKeys(before, after).filter((key) => !writes.setCurrentTrade.includes(key as never)),
      ).toEqual(['hidden']);
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
    const cancelled: string[] = [];
    const first = applicationStore.beginAttempt(() => cancelled.push('first'));
    const second = applicationStore.beginAttempt(() => cancelled.push('second'));
    await checkpoint('stale-generation-dropped', () => {
      expect(applicationStore.commitAttempt(first, { ...trade, status: 'FAILED' })).toBe(false);
      expect(applicationStore.currentTrade).toBeNull();
      expect(applicationStore.commitAttempt(second, trade)).toBe(true);
      expect(applicationStore.currentTrade).toEqual(trade);
    });
    await checkpoint('navigation-aborts', () => {
      applicationStore.cancelPending();
      expect(cancelled).toEqual(['first', 'second']);
      expect(applicationStore.commitAttempt(second, { ...trade, status: 'FAILED' })).toBe(false);
      expect(applicationStore.currentTrade).toEqual(trade);
    });
  },
);
