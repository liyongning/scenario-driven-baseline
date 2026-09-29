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
