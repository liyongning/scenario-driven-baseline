import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount } from '@vue/test-utils';
import { scenarioTest } from '../../__tests__/support';
import LoadingFailure from './LoadingFailure/LoadingFailure.vue';
import LoadingIndicator from './LoadingIndicator/LoadingIndicator.vue';

scenarioTest(
  {
    ownerId: 'SCN-WEB-EXAMPLE-008',
    caseId: 'shared-components',
    checks: ['components-render'],
  },
  async ({ expect, checkpoint }) => {
    await checkpoint('components-render', () => {
      const loading = mount(LoadingIndicator);
      const failure = mount(LoadingFailure);
      expect(loading.get('[data-testid="loading-indicator"]').text()).toContain('加载中');
      expect(failure.get('[data-testid="loading-failure"]').text()).toContain('加载失败');
      const source = readFileSync(
        fileURLToPath(
          new URL(
            'packages/web/src/shared/components/LoadingIndicator/LoadingIndicator.vue',
            `file://${process.cwd()}/`,
          ),
        ),
        'utf8',
      );
      expect(source).toContain('<style scoped src="./LoadingIndicator.css">');
    });
  },
);
