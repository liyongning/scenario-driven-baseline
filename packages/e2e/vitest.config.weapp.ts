import { defineProject, mergeConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import shared from '../../vitest.shared.ts';
export default mergeConfig(shared, defineProject({
  resolve: { alias: { '@payment-test/protocol': fileURLToPath(new URL('../payment-protocol/testing/index.ts', import.meta.url)) } },
  test: {
    name: 'weapp',
    include: ["packages/e2e/tests/weapp/**/*.spec.ts"],
    fileParallelism: false,
    globalSetup: fileURLToPath(new URL('./host/weapp/setup.ts', import.meta.url)),
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
}));
