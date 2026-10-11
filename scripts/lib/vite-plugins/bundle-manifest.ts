import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { productDigest, writeBundleManifest } from '../bundle.ts';
import type { BundleManifest, BundleOutput } from '../bundle-manifest.ts';
import {
  loadProjectManifest,
  type ManifestPackage,
  type ProjectManifest,
} from '../project-manifest.ts';
import { webAppPackages } from '../web-app-checks.ts';

type OutputLike = Readonly<{
  type: 'asset' | 'chunk';
  fileName: string;
  modules?: Readonly<Record<string, unknown>>;
  viteMetadata?: Readonly<{ importedCss?: ReadonlySet<string> }>;
}>;

/** 从 Vite root 向上定位项目清单，避免依赖配置被临时打包后的 `import.meta.url`。 */
export function findRepositoryRoot(start: string): string {
  let current = resolve(start);
  while (!existsSync(resolve(current, 'project.manifest.json'))) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`cannot find project.manifest.json from ${start}`);
    current = parent;
  }
  return current;
}

function outputHash(root: string, product: ManifestPackage, output: OutputLike): string {
  const path = join(root, 'packages', product.directory, 'dist', output.fileName);
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** 将 Rollup 模块 ID 归一为仓库相对路径、node_modules 路径或稳定的虚拟模块名。 */
export function moduleSource(
  root: string,
  id: string,
): Readonly<{ source: string; dependency: boolean }> {
  const clean = id.replace(/^\0/, '').split('?')[0]!;
  if (isAbsolute(clean)) {
    const path = relative(root, clean).split('\\').join('/');
    if (!path.startsWith('../') && !isAbsolute(path))
      return { source: path, dependency: path.startsWith('node_modules/') };
    return { source: `virtual:${id}`, dependency: true };
  }
  if (clean === 'node_modules' || clean.startsWith('node_modules/'))
    return { source: clean, dependency: true };
  return { source: `virtual:${id}`, dependency: true };
}

type MutableModule = { source: string; dependency: boolean; outputs: string[] };

function addOutput(
  modules: Map<string, MutableModule>,
  source: Readonly<{ source: string; dependency: boolean }>,
  file: string,
): void {
  const module = modules.get(source.source) ?? {
    source: source.source,
    dependency: source.dependency,
    outputs: [],
  };
  if (!module.outputs.includes(file)) module.outputs.push(file);
  module.outputs.sort((left, right) => left.localeCompare(right));
  modules.set(source.source, module);
}

function recordChunk(root: string, output: OutputLike, modules: Map<string, MutableModule>): void {
  const sourceIds = Object.keys(output.modules ?? {});
  const sources = sourceIds
    .map((id) => moduleSource(root, id))
    .filter((source) => !source.source.endsWith('.html'));
  for (const source of sources) addOutput(modules, source, output.fileName);
  const styleFiles = [...(output.viteMetadata?.importedCss ?? [])]
    .filter((file) => file.endsWith('.css'))
    .sort((left, right) => left.localeCompare(right));
  if (styleFiles.length === 0) return;
  const styleSource = sources.find((source) => /\.(?:css|vue)$/.test(source.source));
  const fallbackSource = styleSource ?? sources[0];
  if (fallbackSource)
    for (const styleFile of styleFiles) addOutput(modules, fallbackSource, styleFile);
}

/** 从一次 Vite 构建输出生成并写出模块清单；入口必须来自产品手写源码。 */
export function createBundleManifest(
  root: string,
  manifest: ProjectManifest,
  product: ManifestPackage,
  bundle: Readonly<Record<string, unknown>>,
): BundleManifest {
  const outputs: BundleOutput[] = [];
  for (const value of Object.values(bundle)) {
    const output = value as OutputLike;
    outputs.push({ file: output.fileName, sha256: outputHash(root, product, output) });
  }
  outputs.sort((left, right) => left.file.localeCompare(right.file));

  const modules = new Map<string, MutableModule>();
  const productMain = `packages/${product.directory}/src/main.ts`;
  let entry: string | undefined;
  for (const value of Object.values(bundle)) {
    const output = value as OutputLike;
    if (output.type !== 'chunk') continue;
    recordChunk(root, output, modules);
    if (modules.has(productMain)) entry = productMain;
  }
  if (!entry) throw new Error(`bundle ${product.directory} has no src/main.ts entry module`);
  const value: BundleManifest = {
    formatVersion: 1,
    product: product.directory,
    entry,
    productDigest: productDigest(root, manifest, product),
    modules: [...modules.values()].sort((left, right) => left.source.localeCompare(right.source)),
    outputs,
  };
  writeBundleManifest(root, manifest, product, value);
  return value;
}

/** 把模块清单插件接到产品包构建；插件本体位于仓库工具层，不进入产品源码。 */
export function bundleManifestPlugin(): Plugin {
  let repositoryRoot: string | undefined;
  let product: ManifestPackage | undefined;
  return {
    name: 'template-bundle-manifest',
    apply: 'build',
    configResolved(config) {
      const root = findRepositoryRoot(config.root);
      repositoryRoot = root;
      product = webAppPackages(loadProjectManifest(root)).find(
        (item) => resolve(root, 'packages', item.directory) === resolve(config.root),
      );
      if (!product)
        throw new Error(`vite root ${basename(config.root)} is not a registered web-app package`);
    },
    writeBundle(_options, bundle) {
      if (!repositoryRoot || !product)
        throw new Error('bundle manifest plugin was used before config resolution');
      createBundleManifest(
        repositoryRoot,
        loadProjectManifest(repositoryRoot),
        product,
        bundle as Readonly<Record<string, unknown>>,
      );
    },
  };
}
