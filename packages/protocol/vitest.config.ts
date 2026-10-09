import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';
export default mergeConfig(
  shared,
  defineProject({
    test: {
      name: 'protocol-unit',
      include: ['packages/protocol/src/**/*.test.ts', 'packages/protocol/testing/**/*.test.ts'],
    },
  }),
);
