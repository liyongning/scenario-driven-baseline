import { defineConfig } from 'vite';
import dts from 'unplugin-dts/vite';
import { fileURLToPath } from 'node:url';
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
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rolldownOptions: { external: ['@daqian/template-protocol'] },
  },
});
