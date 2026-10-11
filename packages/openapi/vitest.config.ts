import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineProject({
    test: {
      name: 'openapi-unit',
      include: ['packages/openapi/src/**/*.test.ts', 'packages/openapi/testing/**/*.test.ts'],
    },
  }),
);
