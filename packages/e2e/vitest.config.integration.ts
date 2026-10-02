import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// 集成测试解析产品 package exports 的构建产物；源码 alias 仅属于单测。
export default defineProject({ root: fileURLToPath(new URL('../..', import.meta.url)), test: {
  root: fileURLToPath(new URL('../..', import.meta.url)), name: 'integration', include: ['packages/e2e/tests/{protocol,tooling,flows,sdk,example}/**/*.spec.ts'], environment: 'node', clearMocks: true, restoreMocks: true,
}, resolve: { alias: { '@template-test/protocol': fileURLToPath(new URL('../protocol/testing/index.ts', import.meta.url)) } } });
