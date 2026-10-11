import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  bundleManifestPath,
  classifyBundleSource,
  cssResidueIssues,
  distOutputFiles,
  leakedSourceIssues,
  outputDigest,
  parseBundleManifest,
  relativeAssetIssues,
  type BundleManifest,
} from './bundle-manifest.ts';
import { digestFiles } from './fingerprints.ts';
import {
  loadProjectManifest,
  type ManifestPackage,
  type ProjectManifest,
} from './project-manifest.ts';
import { isExcludedPath, listGitFiles, readSourceInventory } from './source-inventory.ts';
import { webAppPackages } from './web-app-checks.ts';

export type {
  BundleManifest,
  BundleModule,
  BundleOutput,
  BundleSourceKind,
} from './bundle-manifest.ts';

/** `check:bundle` 按产品返回的检查结果。 */
export type BundleCheckResult = Readonly<{ checked: string[]; issues: string[] }>;

function uniqueSorted(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function packageRoot(directory: string): string {
  return `packages/${directory}/`;
}

function productBinding(manifest: ProjectManifest, product: ManifestPackage) {
  const binding = manifest.bindings.find((item) => item.product === product.directory);
  if (!binding) throw new Error(`web-app ${product.directory} has no binding`);
  const protocol = manifest.packages.find((item) => item.directory === binding.protocol);
  if (!protocol || protocol.role !== 'protocol')
    throw new Error(`web-app ${product.directory} binding has no protocol package`);
  return { binding, protocol };
}

/**
 * 产品摘要只覆盖产品包与绑定协议包的手写源码，以及清单登记的非忽略构建输入。
 * 测试文件、门禁脚本和 `.gitignore` 排除的本地文件都不进入摘要。
 */
export function productDigest(
  root: string,
  manifest: ProjectManifest,
  product: ManifestPackage,
): string {
  const { protocol } = productBinding(manifest, product);
  const productPrefix = packageRoot(product.directory);
  const protocolPrefix = packageRoot(protocol.directory);
  const protocolTestingPrefix = `${protocolPrefix}testing/`;
  const sourceFiles = readSourceInventory(root, manifest)
    .files.filter((file) => file.class !== 'test')
    .filter(
      (file) =>
        file.path.startsWith(productPrefix) ||
        (file.path.startsWith(protocolPrefix) && !file.path.startsWith(protocolTestingPrefix)),
    )
    .map((file) => file.path);
  const buildInputs = listGitFiles(root, manifest.fingerprints.buildInputs).filter(
    (path) => !isExcludedPath(path),
  );
  return digestFiles(
    root,
    uniqueSorted([...sourceFiles, ...buildInputs]).map((path) => join(root, path)),
  );
}

/** 校验一个已解析的产品模块清单与磁盘产物是否一致。 */
export function checkParsedBundle(
  root: string,
  manifest: ProjectManifest,
  product: ManifestPackage,
  value: unknown,
): string[] {
  const parsed = parseBundleManifest(value, product.directory);
  if (!parsed.manifest) return parsed.issues;
  const bundle = parsed.manifest;
  const issues = [...parsed.issues];
  const outputs = new Map(bundle.outputs.map((output) => [output.file, output]));
  const declared = new Set(outputs.keys());
  const distRoot = join(root, 'packages', product.directory, 'dist');
  for (const file of distOutputFiles(distRoot))
    if (!declared.has(file)) issues.push(`dist output ${file} is not recorded in bundle manifest`);
  for (const output of bundle.outputs) {
    const current = outputDigest(root, product.directory, output);
    if (!current)
      issues.push(`bundle output ${output.file} is missing from ${product.directory}/dist`);
    else if (current !== output.sha256)
      issues.push(`bundle output ${output.file} sha256 does not match`);
  }
  const moduleSources = new Map(bundle.modules.map((module) => [module.source, module]));
  for (const module of bundle.modules) {
    const kind = classifyBundleSource(root, manifest, module);
    if (kind === 'unknown')
      issues.push(`bundle module ${module.source} is neither handwritten source nor dependency`);
    if (kind === 'test-infrastructure')
      issues.push(`test infrastructure module ${module.source} is in the bundle`);
    if (kind === 'contract') issues.push(`protocol contract ${module.source} is in the bundle`);
    for (const file of module.outputs)
      if (!outputs.has(file))
        issues.push(`bundle module ${module.source} references unknown output ${file}`);
  }
  const entry = moduleSources.get(bundle.entry);
  if (!entry) issues.push(`bundle entry ${bundle.entry} is missing from modules`);
  else if (entry.dependency || classifyBundleSource(root, manifest, entry) !== 'handwritten')
    issues.push(`bundle entry ${bundle.entry} is not handwritten product source`);
  issues.push(...relativeAssetIssues(distRoot), ...cssResidueIssues(distRoot));
  issues.push(...leakedSourceIssues(root, distRoot, product.directory));
  if (productDigest(root, manifest, product) !== bundle.productDigest)
    issues.push(`bundle product digest is stale for ${product.directory}`);
  return issues;
}

/** `check:bundle` 的完整实现；没有 web-app 包时按空检查通过。 */
export function checkBundle(root = process.cwd()): BundleCheckResult {
  const manifest = loadProjectManifest(root);
  const checked = webAppPackages(manifest).map((pkg) => `packages/${pkg.directory}`);
  const issues: string[] = [];
  for (const product of webAppPackages(manifest)) {
    const path = bundleManifestPath(root, product.directory);
    if (!existsSync(path)) {
      issues.push(`${relative(root, path)} is missing`);
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    } catch {
      issues.push(`${relative(root, path)} is not valid JSON`);
      continue;
    }
    issues.push(...checkParsedBundle(root, manifest, product, value));
  }
  return { checked, issues };
}

export function writeBundleManifest(
  root: string,
  manifest: ProjectManifest,
  product: ManifestPackage,
  value: BundleManifest,
): void {
  const path = bundleManifestPath(root, product.directory);
  mkdirSync(join(root, 'artifacts', 'build', product.directory), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
