import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  bundleManifestPath,
  type BundleManifest,
} from '../../../../scripts/lib/bundle-manifest.ts';
import { productDigest } from '../../../../scripts/lib/bundle.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import { runCli } from './engineering-form-fixture.ts';

export const bundleProductDirectory = 'web-product';
export const bundleMainSource = `packages/${bundleProductDirectory}/src/main.ts`;
export const bundleAppSource = `packages/${bundleProductDirectory}/src/AppRoot/AppRoot.vue`;

function write(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function bundleProduct(root: string) {
  const product = loadProjectManifest(root).packages.find(
    (item) => item.form === 'web-app' && item.directory === bundleProductDirectory,
  );
  if (!product) throw new Error('bundle fixture has no web product');
  return product;
}

export function writeBundleBuild(
  root: string,
  options: Readonly<{ html?: string; js?: string; css?: string }> = {},
): void {
  const dist = join(root, 'packages', bundleProductDirectory, 'dist');
  write(join(dist, 'index.html'), options.html ?? '<script src="./assets/index.js"></script>\n');
  write(join(dist, 'assets/index.js'), options.js ?? 'console.log("web");\n');
  write(join(dist, 'assets/index.css'), options.css ?? '.root { display: block; }\n');
}

export function validBundle(root: string): BundleManifest {
  const dist = join(root, 'packages', bundleProductDirectory, 'dist');
  const manifest = loadProjectManifest(root);
  return {
    formatVersion: 1,
    product: bundleProductDirectory,
    entry: bundleMainSource,
    productDigest: productDigest(root, manifest, bundleProduct(root)),
    modules: [
      { source: bundleMainSource, dependency: false, outputs: ['assets/index.js'] },
      {
        source: bundleAppSource,
        dependency: false,
        outputs: ['assets/index.js', 'assets/index.css'],
      },
      {
        source: 'node_modules/vue/dist/vue.runtime.esm-bundler.js',
        dependency: true,
        outputs: ['assets/index.js'],
      },
    ],
    outputs: [
      { file: 'assets/index.js', sha256: digest(join(dist, 'assets/index.js')) },
      { file: 'assets/index.css', sha256: digest(join(dist, 'assets/index.css')) },
    ],
  };
}

export function writeBundle(root: string, manifest: BundleManifest): void {
  const path = bundleManifestPath(root, bundleProductDirectory);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function refreshBundleDigest(root: string, value: BundleManifest): BundleManifest {
  return {
    ...value,
    productDigest: productDigest(root, loadProjectManifest(root), bundleProduct(root)),
  };
}

export function runBundleCli(root: Readonly<{ root: string; env: NodeJS.ProcessEnv }>) {
  return runCli({ ...root, cleanup: () => {} }, 'scripts/check-bundle.ts');
}

export function runBundleBuild(root: Readonly<{ root: string; env: NodeJS.ProcessEnv }>): void {
  const result = spawnSync('pnpm', ['build'], {
    cwd: root.root,
    env: { ...process.env, ...root.env },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`bundle build failed: ${result.stdout}${result.stderr}`);
}

export function remove(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
