import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: fileURLToPath(new URL('./.generated', import.meta.url)),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('./protocol-runner.ts', import.meta.url)),
      formats: ['cjs'],
      fileName: () => 'protocol-runner.js',
    },
  },
});
