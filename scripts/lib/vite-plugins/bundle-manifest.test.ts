import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createEngineeringFormRoot } from '../../../packages/e2e/tests/tooling/engineering-form-fixture.ts';
import { bundleManifestPath } from '../bundle-manifest.ts';
import { loadProjectManifest } from '../project-manifest.ts';
import {
  bundleManifestPlugin,
  createBundleManifest,
  findRepositoryRoot,
  moduleSource,
} from './bundle-manifest.ts';

const productDirectory = 'web-product';

function write(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function outputBundle(root: string): Record<string, unknown> {
  const main = join(root, 'packages', productDirectory, 'src/main.ts');
  const component = join(root, 'packages', productDirectory, 'src/AppRoot/AppRoot.vue');
  const html = join(root, 'packages', productDirectory, 'index.html');
  write(join(root, 'packages', productDirectory, 'dist/index.html'), '<html></html>\n');
  write(join(root, 'packages', productDirectory, 'dist/assets/index.js'), 'index\n');
  write(join(root, 'packages', productDirectory, 'dist/assets/index.css'), '.root {}\n');
  write(join(root, 'packages', productDirectory, 'dist/assets/extra.css'), '.extra {}\n');
  write(join(root, 'packages', productDirectory, 'dist/assets/before-main.js'), 'before\n');
  write(join(root, 'packages', productDirectory, 'dist/assets/extra.js'), 'extra\n');
  return {
    html: { type: 'asset', fileName: 'index.html', source: '<html></html>' },
    css: { type: 'asset', fileName: 'assets/index.css', source: '.root {}' },
    extraCss: { type: 'asset', fileName: 'assets/extra.css', source: '.extra {}' },
    beforeMain: {
      type: 'chunk',
      fileName: 'assets/before-main.js',
      modules: { [component]: {} },
    },
    js: {
      type: 'chunk',
      fileName: 'assets/index.js',
      modules: { [main]: {}, [component]: {}, [html]: {} },
      viteMetadata: {
        importedCss: new Set(['assets/extra.css', 'assets/index.css', 'assets/index.js']),
      },
    },
    extra: {
      type: 'chunk',
      fileName: 'assets/extra.js',
      modules: { [main]: {} },
      viteMetadata: { importedCss: new Set(['assets/index.css']) },
    },
    empty: {
      type: 'chunk',
      fileName: 'assets/index.js',
      modules: { [component]: {} },
      viteMetadata: { importedCss: new Set(['assets/index.css']) },
    },
    noModules: {
      type: 'chunk',
      fileName: 'assets/index.js',
    },
  };
}

function hookHandler<T extends (...args: never[]) => unknown>(hook: unknown): T {
  if (typeof hook === 'function') return hook as T;
  if (hook && typeof hook === 'object' && 'handler' in hook && typeof hook.handler === 'function')
    return hook.handler as T;
  throw new Error('hook has no callable handler');
}

describe('bundle manifest Vite plugin', () => {
  test('normalizes module paths without substring matching', () => {
    const root = '/repo';
    expect(moduleSource(root, '/repo/packages/web/src/main.ts?raw')).toEqual({
      source: 'packages/web/src/main.ts',
      dependency: false,
    });
    expect(moduleSource(root, '/repo/node_modules/vue/index.js')).toEqual({
      source: 'node_modules/vue/index.js',
      dependency: true,
    });
    expect(moduleSource(root, '/outside/vue/index.js')).toEqual({
      source: 'virtual:/outside/vue/index.js',
      dependency: true,
    });
    expect(moduleSource(root, 'node_modules/vue/index.js')).toEqual({
      source: 'node_modules/vue/index.js',
      dependency: true,
    });
    expect(moduleSource(root, '\0vite/helper')).toEqual({
      source: 'virtual:\u0000vite/helper',
      dependency: true,
    });
  });

  test('finds the repository root or reports a bounded failure', () => {
    const root = createEngineeringFormRoot();
    const plain = mkdtempSync(join(tmpdir(), 'bundle-no-manifest-'));
    try {
      expect(findRepositoryRoot(join(root.root, 'packages/web-product'))).toBe(root.root);
      expect(() => findRepositoryRoot(plain)).toThrow(/cannot find project.manifest.json/);
    } finally {
      root.cleanup();
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test('writes outputs, associates CSS with style modules and selects main entry', () => {
    const root = createEngineeringFormRoot();
    try {
      const manifest = loadProjectManifest(root.root);
      const product = manifest.packages.find((item) => item.directory === productDirectory)!;
      const value = createBundleManifest(root.root, manifest, product, outputBundle(root.root));
      expect(value.entry).toBe(`packages/${productDirectory}/src/main.ts`);
      expect(value.modules.some((item) => item.source.endsWith('index.html'))).toBe(false);
      expect(value.modules.find((item) => item.source.endsWith('AppRoot.vue'))?.outputs).toContain(
        'assets/index.css',
      );
      expect(readFileSync(bundleManifestPath(root.root, productDirectory), 'utf8')).toContain(
        'assets/index.js',
      );
    } finally {
      root.cleanup();
    }
  });

  test('fails when no product entry module is present', () => {
    const root = createEngineeringFormRoot();
    try {
      const manifest = loadProjectManifest(root.root);
      const product = manifest.packages.find((item) => item.directory === productDirectory)!;
      write(join(root.root, 'packages', productDirectory, 'dist/index.html'), '<html></html>\n');
      expect(() =>
        createBundleManifest(root.root, manifest, product, {
          html: { type: 'asset', fileName: 'index.html', source: '<html></html>' },
        }),
      ).toThrow(/no src\/main.ts entry module/);
    } finally {
      root.cleanup();
    }
  });

  test('connects config resolution to the final writeBundle output', () => {
    const root = createEngineeringFormRoot();
    try {
      const productRoot = join(root.root, 'packages', productDirectory);
      const plugin = bundleManifestPlugin();
      const writeBundle = hookHandler<(options: unknown, bundle: unknown) => void>(
        plugin.writeBundle,
      );
      const configResolved = hookHandler<(config: { root: string }) => void>(plugin.configResolved);
      expect(() => writeBundle({}, {})).toThrow(/before config resolution/);
      configResolved({ root: productRoot });
      writeBundle({}, outputBundle(root.root));
      expect(readFileSync(bundleManifestPath(root.root, productDirectory), 'utf8')).toContain(
        productDirectory,
      );

      const invalid = bundleManifestPlugin();
      expect(() =>
        hookHandler<(config: { root: string }) => void>(invalid.configResolved)({
          root: join(productRoot, 'src'),
        }),
      ).toThrow(/not a registered web-app package/);
    } finally {
      root.cleanup();
    }
  });
});
