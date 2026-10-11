import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineProject({
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      name: 'app-unit',
      environment: 'jsdom',
      include: ['packages/web/src/**/*.{test,spec}.ts'],
      root: fileURLToPath(new URL('../..', import.meta.url)),
    },
  }),
);
