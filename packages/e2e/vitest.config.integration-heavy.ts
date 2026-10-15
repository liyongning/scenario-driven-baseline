import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { copyCreatingSpecs, heavyIntegrationSpecs } from './vitest.config.integration.ts';

// 重型副本用例串行运行，避免构建、安装和完整 unit 子进程互相争用；其余 integration 仍并行。
export default defineProject({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
    name: 'integration-heavy',
    include: heavyIntegrationSpecs,
    exclude: process.env.TEMPLATE_COPY
      ? ['**/node_modules/**', '**/.git/**', ...copyCreatingSpecs.map((path) => `**/${path}`)]
      : ['**/node_modules/**', '**/.git/**'],
    environment: 'node',
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@template-test/protocol': fileURLToPath(
        new URL('../protocol/testing/index.ts', import.meta.url),
      ),
      '@template-test/shadow': fileURLToPath(new URL('./src/shadow/index.ts', import.meta.url)),
    },
  },
});
