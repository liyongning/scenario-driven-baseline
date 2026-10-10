import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dependencyRules from './scripts/lib/dependency-rules.cjs';

// 产品包与协议包的路径按清单角色生成，配置里不写死包目录；清单从当前工作目录读取。
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'project.manifest.json'), 'utf8'));
const protocolPackage = dependencyRules.packageByRole(manifest, 'protocol');

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.generated/**',
      'artifacts/**',
      '.local/**',
      '.superpowers/**',
      `packages/${protocolPackage.directory}/src/generated/**`,
    ],
  },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], plugins: { js }, extends: ['js/recommended'] },
  tseslint.configs.recommended,
  {
    files: [
      'scripts/**/*.ts',
      '*.ts',
      '*.js',
      '*.cjs',
      'packages/**/*.config*.ts',
      'packages/**/*.test.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/e2e/host/weapp/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, App: 'readonly', Page: 'readonly', wx: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // CommonJS 门禁配置（dependency-cruiser 与清单派生规则）按 Node 环境解析。
    files: ['**/*.cjs'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [dependencyRules.runtimeFile(manifest)],
    languageOptions: { globals: { setTimeout: 'readonly', clearTimeout: 'readonly' } },
  },
  // 行数上限与豁免只来自清单：源文件 300、测试文件 600，空行与注释不计（ENG-08）。
  ...dependencyRules.maxLinesConfig(manifest),
  // 每个业务模块的 core/ports 只能通过端口访问宿主（按目录模式覆盖全部业务模块），详见产品包 AGENTS.md。
  {
    files: dependencyRules.restrictedGlobalFiles(manifest),
    rules: { 'no-restricted-globals': ['error', 'wx'] },
  },
]);
