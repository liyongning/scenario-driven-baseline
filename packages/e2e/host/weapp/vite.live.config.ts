import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  envPrefix: '__PAYMENT_LIVE_DISABLED__',
  build: {
    target: 'es2020',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./pages/live/index.js', import.meta.url)),
      formats: ['cjs'],
      fileName: () => 'pages/live/index.js',
    },
  },
});

export const exampleLiveConfig = defineConfig({
  envPrefix: '__PAYMENT_LIVE_DISABLED__',
  build: {
    target: 'es2020',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./pages/live/example/index.js', import.meta.url)),
      formats: ['cjs'],
      fileName: () => 'pages/live/example/index.js',
    },
  },
});
