import { defineConfig } from 'vite';
import dts from 'unplugin-dts/vite';
import { fileURLToPath } from 'node:url';

// 根入口与生成模块各自构建，契约文件始终停在生产导入图之外。
const entries = ['index', 'generated/operations', 'generated/codes'];

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      entryRoot: 'src',
      bundleTypes: true,
      outDirs: ['dist', { dir: 'dist', moduleFormat: 'cjs' }],
      aliasesExclude: ['@daqian/template-openapi'],
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
  },
});
