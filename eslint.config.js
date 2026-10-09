import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.generated/**', 'artifacts/**', '.local/**', '.superpowers/**', 'packages/protocol/src/generated/**'] },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], plugins: { js }, extends: ['js/recommended'] },
  tseslint.configs.recommended,
  { files: ['scripts/**/*.ts', '*.ts', '*.js', '*.cjs', 'packages/**/*.config*.ts', 'packages/**/*.test.ts'], languageOptions: { globals: globals.node } },
  { files: ['packages/e2e/host/weapp/**/*.js'], languageOptions: { globals: { ...globals.node, App: 'readonly', Page: 'readonly', wx: 'readonly' } }, rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['packages/sdk/src/runtime/default.ts'], languageOptions: { globals: { setTimeout: 'readonly', clearTimeout: 'readonly' } } },
  // 每个业务模块的 core/ports 只能通过端口访问宿主（按目录模式覆盖全部业务模块），详见 packages/sdk/AGENTS.md。
  { files: ['packages/sdk/src/*/core/**/*.ts', 'packages/sdk/src/*/ports/**/*.ts'], rules: { 'no-restricted-globals': ['error', 'wx'] } },
]);
