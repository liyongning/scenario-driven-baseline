import { nextTick } from 'vue';
import { beforeEach, describe, test, vi } from 'vitest';

describe('main entry', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
  });

  test(
    'SCN-WEB-APP-011 main-entry',
    {
      meta: {
        scenarioCase: {
          ownerId: 'SCN-WEB-APP-011',
          caseId: 'main-entry',
          fixtureCase: null,
          environment: 'app-unit',
          covers: [
            {
              id: 'SCN-WEB-APP-011',
              caseKey: 'main-entry',
              checks: ['entry-mounts', 'entry-covered'],
            },
          ],
        },
      },
    },
    async ({ annotate, expect: contextExpect }) => {
      await import('./main');
      await nextTick();
      contextExpect(document.querySelector('[data-testid="app-root"]')).not.toBeNull();
      contextExpect(document.body.textContent).toContain('应用已配置');
      await annotate(
        JSON.stringify({ assertions: 2, checkpoints: ['entry-mounts', 'entry-covered'] }),
        'scenario-evidence',
      );
    },
  );
});
