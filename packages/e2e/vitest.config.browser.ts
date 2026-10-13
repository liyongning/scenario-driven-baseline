import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineProject({
    test: {
      name: 'browser',
      include: ['packages/e2e/tests/web-openapi-browser/**/*.browser.spec.ts'],
      testTimeout: 120_000,
      hookTimeout: 120_000,
    },
  }),
);
