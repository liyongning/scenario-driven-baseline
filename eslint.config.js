import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import { defineConfig } from 'eslint/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dependencyRules from './scripts/lib/dependency-rules.cjs';

// 产品包与协议包的路径按清单角色生成，配置里不写死包目录；清单从当前工作目录读取。
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'project.manifest.json'), 'utf8'));
const protocolPackages = dependencyRules.packagesByRole(manifest, 'protocol');
const webPackages = dependencyRules
  .packagesByRole(manifest, 'product')
  .filter((pkg) => pkg.form === 'web-app');
const webSourceFiles = webPackages.map((pkg) => `packages/${pkg.directory}/src/**/*.{ts,vue}`);
const webScriptFiles = webPackages.map((pkg) => `packages/${pkg.directory}/src/**/*.ts`);
const webMainFiles = webPackages.map((pkg) => `packages/${pkg.directory}/src/main.ts`);
const webCoreFiles = webPackages.flatMap((pkg) => {
  const root = dependencyRules.sourceRoot(pkg);
  return [
    `packages/${pkg.directory}/${root}/runtime/**/*.ts`,
    `packages/${pkg.directory}/${root}/*/core/**/*.ts`,
    `packages/${pkg.directory}/${root}/*/ports/**/*.ts`,
    ...(pkg.globalStore ? [`packages/${pkg.directory}/${pkg.globalStore}`] : []),
  ];
});
const componentNameExemptions = manifest.quality?.componentNameExemptions ?? [];

const webStoreSyntax = [
  ...[
    ['AssignmentExpression[left.object.name=/Store$/]', '不得直接写入全局 store 状态'],
    ['CallExpression[callee.property.name="$patch"]', '组件层不得调用全局 store 的 $patch'],
    ['MemberExpression[property.name="$state"]', '组件层不得访问全局 store 的 $state'],
    [
      'CallExpression[callee.object.name="Object"][callee.property.name="assign"]',
      '不得用 Object.assign 绕过只读 store',
    ],
    ['VariableDeclarator[init.name=/Store$/][id.name!=/Store$/]', '不得给全局 store 起别名'],
    [
      'VariableDeclarator[init.callee.name=/^use.*Store$/][id.name!=/Store$/]',
      'store 变量名必须以 Store 结尾',
    ],
    [
      'FunctionDeclaration[id.name=/^use/]:not([id.name=/^use.*Store$/])',
      '组合式函数必须命名为 use<X>Store',
    ],
    [
      'VariableDeclarator[id.name=/^use/]:not([id.name=/^use.*Store$/])',
      '组合式函数必须命名为 use<X>Store',
    ],
    [
      'VariableDeclarator[init.object.type="MetaProperty"][init.property.name="env"]',
      '不得把 import.meta.env 保存到变量',
    ],
  ].map(([selector, message]) => ({ selector, message })),
];
const webEnvSyntax = [
  {
    selector: 'MemberExpression[object.object.type="MetaProperty"][object.property.name="env"]',
    message: 'import.meta.env 只能整体传给纯函数，不能读取单个属性',
  },
  {
    selector: 'MemberExpression[object.type="MetaProperty"][property.name="env"]',
    message: 'import.meta.env 只能出现在 main.ts 中',
  },
];

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.generated/**',
      'artifacts/**',
      '.local/**',
      '.superpowers/**',
      ...protocolPackages.map((pkg) => `packages/${pkg.directory}/src/generated/**`),
      ...protocolPackages.map((pkg) => `packages/${pkg.directory}/testing/engine/generated/**`),
    ],
  },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], plugins: { js }, extends: ['js/recommended'] },
  tseslint.configs.recommended,
  ...vue.configs['flat/base'],
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
  },
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
  ...componentNameExemptions.map((item) => ({
    files: [item.path],
    rules: { 'vue/multi-word-component-names': 'off' },
  })),
  ...(webSourceFiles.length
    ? [
        {
          files: webSourceFiles,
          rules: {
            'no-restricted-syntax': ['error', ...webStoreSyntax, ...webEnvSyntax],
            'no-warning-comments': [
              'error',
              {
                terms: ['v8 ignore', 'istanbul ignore', 'c8 ignore'],
                location: 'anywhere',
              },
            ],
          },
        },
      ]
    : []),
  ...(webMainFiles.length
    ? [
        {
          files: webMainFiles,
          rules: {
            'no-restricted-syntax': [
              'error',
              ...webStoreSyntax,
              ...webEnvSyntax.filter((item) => !item.message.includes('只能出现在')),
            ],
          },
        },
      ]
    : []),
  ...(webScriptFiles.length
    ? [{ files: webScriptFiles, rules: { 'vue/multi-word-component-names': 'off' } }]
    : []),
  ...(webCoreFiles.length
    ? [
        {
          files: webCoreFiles,
          rules: {
            'no-restricted-globals': [
              'error',
              'window',
              'document',
              'navigator',
              'HTMLElement',
              'Element',
              'Event',
            ],
          },
        },
      ]
    : []),
  {
    // CommonJS 门禁配置（dependency-cruiser 与清单派生规则）按 Node 环境解析。
    files: ['**/*.cjs'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: dependencyRules.runtimeFile(manifest),
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
