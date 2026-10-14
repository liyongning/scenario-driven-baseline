import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// 副本（TEMPLATE_COPY）中排除会再次创建副本的用例：门禁自测在副本里不得递归建副本。
// 具名导出：副本门禁可据这份排除列表推导"副本中不可能产生绑定"的用例集合，不另写一份名单。
export const copyCreatingSpecs = [
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts',
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-007.spec.ts',
  'packages/e2e/tests/tooling/SCN-WEB-APP-001.spec.ts',
  'packages/e2e/tests/tooling/SCN-WEB-APP-012.spec.ts',
  'packages/e2e/tests/tooling/SCN-WEB-APP-010.spec.ts',
  // template-example:begin
  'packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts',
  // template-example:end
  'packages/e2e/tests/tooling/SCN-SCENARIO-GATE-026.spec.ts',
  // web-example:begin
  'packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-015.spec.ts',
  // web-example:end
  // template-example:begin
  // 示例删除验收自身也会创建副本，且只在示例存在时有意义（template-example 的 EX-10）：随示例一起删除。
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts',
  // template-example:end
];
/** 派生构建、安装、完整 unit 或密集 CLI 子进程的用例；由 integration-heavy 项目逐文件串行运行。 */
export const heavyIntegrationSpecs = [
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts',
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-002.spec.ts',
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts',
  // template-example:begin
  'packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-005.spec.ts',
  // template-example:end
  // template-example:begin
  'packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts',
  // template-example:end
  'packages/e2e/tests/tooling/SCN-WEB-APP-010.spec.ts',
  'packages/e2e/tests/tooling/SCN-SCENARIO-GATE-026.spec.ts',
  'packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-006.spec.ts',
  'packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-015.spec.ts',
  'packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-027.spec.ts',
  // 这些门禁自测会启动多轮 tsx CLI；默认并发时其进程启动预算会被其他 integration 文件挤占。
  'packages/e2e/tests/tooling/SCN-SCENARIO-GATE-010.spec.ts',
  'packages/e2e/tests/tooling/SCN-SCENARIO-GATE-017.spec.ts',
  'packages/e2e/tests/tooling/SCN-SCENARIO-GATE-028.spec.ts',
  // web-example:begin
  'packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-015.spec.ts',
  // web-example:end
];
// 集成测试解析产品 package exports 的构建产物；源码 alias 仅属于单测。
export default defineProject({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
    name: 'integration',
    include: [
      'packages/e2e/tests/{protocol,tooling,flows,sdk,web-openapi-browser}/**/*.spec.ts',
      // template-example:begin
      'packages/e2e/tests/example/**/*.spec.ts',
      // template-example:end
    ],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/*.browser.spec.ts',
      ...heavyIntegrationSpecs.map((path) => `**/${path}`),
      ...(process.env.TEMPLATE_COPY ? copyCreatingSpecs.map((path) => `**/${path}`) : []),
    ],
    environment: 'node',
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
