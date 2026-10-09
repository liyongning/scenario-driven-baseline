import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// 副本（TEMPLATE_COPY）中排除会再次创建副本的用例：门禁自测在副本里不得递归建副本。
const copyCreatingSpecs = [
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts',
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-007.spec.ts',
  'packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts',
  'packages/e2e/tests/tooling/SCN-SCENARIO-GATE-026.spec.ts',
];
// 集成测试解析产品 package exports 的构建产物；源码 alias 仅属于单测。
export default defineProject({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
    name: 'integration',
    include: ['packages/e2e/tests/{protocol,tooling,flows,sdk,example}/**/*.spec.ts'],
    exclude: process.env.TEMPLATE_COPY
      ? ['**/node_modules/**', '**/.git/**', ...copyCreatingSpecs.map((path) => `**/${path}`)]
      : ['**/node_modules/**', '**/.git/**'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@template-test/protocol': fileURLToPath(
        new URL('../protocol/testing/index.ts', import.meta.url),
      ),
    },
  },
});
