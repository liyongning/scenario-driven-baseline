import { defineConfig } from 'vite';
import dts from 'unplugin-dts/vite';
import { fileURLToPath } from 'node:url';

// 直接以生成模块作为库入口，不在 ProtoGen 独占目录内维护手写 barrel。
const entries = [
  'index',
  'generated/std',
  'generated/idl/base',
  'generated/idl/common/v1/enums',
  'generated/idl/infra/pay/v1/pay',
  'generated/idl/infra/trade/v1/trade',
];

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      entryRoot: 'src',
      bundleTypes: true,
      outDirs: ['dist', { dir: 'dist', moduleFormat: 'cjs' }],
      aliasesExclude: ['@daqian/template-protocol'],
    }),
  ],
  build: {
    target: 'es2020',
    lib: {
      entry: Object.fromEntries(
        entries.map((entry) => [
          entry,
          fileURLToPath(new URL(`./src/${entry}.ts`, import.meta.url)),
        ]),
      ),
      formats: ['es', 'cjs'],
      fileName: (format, entry) => `${entry}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rolldownOptions: { external: ['@daqian/template-protocol'] },
  },
});
