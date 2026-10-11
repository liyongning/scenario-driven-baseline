import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { bundleManifestPlugin } from '../../scripts/lib/vite-plugins/bundle-manifest.ts';

export default defineConfig({
  base: './',
  plugins: [vue(), bundleManifestPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
