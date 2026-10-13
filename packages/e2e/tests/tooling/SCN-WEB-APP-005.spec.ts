import { readFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createEngineeringFormRoot } from './engineering-form-fixture.ts';
import { repositoryRoot } from './helpers.ts';
import { runEslint, runTsc, writeAndRestore } from './web-cli-helpers.ts';

const storePath = 'packages/web/src/store/index.ts';
const guardPath = 'packages/web-product/src/AppRoot/StoreGuard.ts';

const storeSource = [
  "import { defineStore, type Pinia } from 'pinia';",
  "import { computed, readonly, ref } from 'vue';",
  '',
  '/** 全局状态。 */',
  'export interface ApplicationStore {',
  '  readonly configured: boolean;',
  '  configure(apiBaseUrl: string): void;',
  '}',
  '',
  'export const useApplicationStore: (pinia?: Pinia) => ApplicationStore = defineStore("application", () => {',
  "  const apiBaseUrl = ref('');",
  "  const configured = readonly(computed(() => apiBaseUrl.value !== ''));",
  '  function configure(value: string): void {',
  '    apiBaseUrl.value = value;',
  '  }',
  '  return { configured, configure };',
  '});',
  '',
].join('\n');

const guardTsconfig = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      lib: ['ES2022', 'DOM'],
      types: [],
    },
    include: [guardPath],
  },
  null,
  2,
);

function validGuard(): string {
  return [
    "import { useApplicationStore } from '../stores/global';",
    'const applicationStore = useApplicationStore();',
    "applicationStore.configure('https://api.example.test');",
    '',
  ].join('\n');
}

cliEvidence(
  'SCN-WEB-APP-005',
  'store-exposure-fact',
  ['single-readonly-store'],
  async (context, check) => {
    await check('single-readonly-store', () => {
      const source = readFileSync(join(repositoryRoot, storePath), 'utf8');
      context.expect(source.match(/\bdefineStore\s*\(/g)).toHaveLength(1);
      context.expect(source).toContain('readonly(computed(');
      context.expect(source).toMatch(/return\s*\{[\s\S]*\bconfigured\b[\s\S]*\bconfigure\b/);
      context.expect(source).not.toMatch(/return\s*\{[^}]*\bapiBaseUrl\s*,/);
      context.expect(source).toMatch(/defineStore\(\s*'application'/);
      // 反例：在真实 return 中插入裸 ref 后，必须被"裸 ref 不得直接返回"的判定捕获。
      const bare = source.replace('configured,', 'configured, apiBaseUrl,');
      context.expect(bare).toMatch(/return\s*\{[^}]*\bapiBaseUrl\s*,/);
    });
  },
);

cliEvidence(
  'SCN-WEB-APP-005',
  'store-guard-cli',
  ['readonly-type-rejects', 'lint-backstop', 'store-naming', 'store-guard-restorable'],
  async (context, check) => {
    const root = createEngineeringFormRoot(undefined, {
      'packages/web-product/src/stores/global.ts': storeSource,
      'tsconfig.store.json': guardTsconfig,
    });
    symlinkSync(
      resolve(repositoryRoot, 'packages/web/node_modules'),
      join(root.root, 'packages/web-product/node_modules'),
      'dir',
    );
    try {
      await check('readonly-type-rejects', () => {
        writeAndRestore(join(root.root, guardPath), validGuard(), () => {
          const valid = runTsc(root, 'tsconfig.store.json');
          context.expect(valid.status, valid.output).toBe(0);
        });
        for (const source of [
          "import { useApplicationStore } from '../stores/global';\nconst applicationStore = useApplicationStore();\napplicationStore.configured = true;\n",
          "import { useApplicationStore } from '../stores/global';\nconst applicationStore = useApplicationStore();\nconst alias = applicationStore;\nalias.configured = true;\n",
        ])
          writeAndRestore(join(root.root, guardPath), source, () => {
            const result = runTsc(root, 'tsconfig.store.json');
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toMatch(/read-?only/);
          });
      });
      await check('lint-backstop', () => {
        for (const [source, message] of [
          [
            'const applicationStore = useApplicationStore();\napplicationStore.configured = true;\n',
            '不得直接写入',
          ],
          [
            'const applicationStore = useApplicationStore();\napplicationStore.$patch({});\n',
            '$patch',
          ],
          [
            'const applicationStore = useApplicationStore();\nvoid applicationStore.$state;\n',
            '$state',
          ],
          [
            'const applicationStore = useApplicationStore();\nconst alias = applicationStore;\nvoid alias;\n',
            '不得给全局 store 起别名',
          ],
          [
            'const applicationStore = useApplicationStore();\nObject.assign(applicationStore, {});\n',
            'Object.assign',
          ],
        ] as const)
          writeAndRestore(join(root.root, guardPath), source, () => {
            const result = runEslint(root, [guardPath]);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain(message);
          });
      });
      await check('store-naming', () => {
        writeAndRestore(
          join(root.root, guardPath),
          'const store = useApplicationStore();\nvoid store;\n',
          () => {
            const result = runEslint(root, [guardPath]);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('store 变量名必须以 Store 结尾');
          },
        );
        writeAndRestore(join(root.root, guardPath), 'function useFoo() {}\nuseFoo();\n', () => {
          const result = runEslint(root, [guardPath]);
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toContain('组合式函数必须命名为 use<X>Store');
        });
      });
      await check('store-guard-restorable', () => {
        writeAndRestore(join(root.root, guardPath), validGuard(), () => {
          const lint = runEslint(root, [guardPath]);
          context.expect(lint.status, lint.output).toBe(0);
          const types = runTsc(root, 'tsconfig.store.json');
          context.expect(types.status, types.output).toBe(0);
        });
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 60_000 },
);
