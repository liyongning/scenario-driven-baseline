import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';
export default mergeConfig(
  shared,
  defineProject({
    test: {
      name: 'sdk-unit',
      include: ['packages/sdk/src/**/*.test.ts', 'packages/sdk/testing/**/*.test.ts'],
    },
  }),
);
