import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { collectFiles } from './fingerprints.ts';
import type { ProjectManifest } from './project-manifest.ts';
import { readSourceInventory } from './source-inventory.ts';

/** 一个构建输出文件及其内容摘要。 */
export type BundleOutput = Readonly<{ file: string; sha256: string }>;

/** 产物中的一个模块来源及其关联输出文件。 */
export type BundleModule = Readonly<{
  source: string;
  dependency: boolean;
  outputs: ReadonlyArray<string>;
}>;

/** 由 Vite 插件写出、供产物边界检查读取的模块清单。 */
export type BundleManifest = Readonly<{
  formatVersion: 1;
  product: string;
  entry: string;
  productDigest: string;
  modules: ReadonlyArray<BundleModule>;
  outputs: ReadonlyArray<BundleOutput>;
}>;

export type BundleSourceKind =
  'dependency' | 'handwritten' | 'test-infrastructure' | 'contract' | 'unknown';

const sha256Pattern = /^[a-f0-9]{64}$/;
const cssResidues = [':deep(', ':slotted(', ':global('] as const;
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.svg', '.txt', '.xml']);

/** 模块清单固定写入仓库构建产物侧目录，不进入部署目录。 */
export function bundleManifestPath(root: string, productDirectory: string): string {
  return join(root, 'artifacts', 'build', productDirectory, 'bundle-manifest.json');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function relativePathIssue(path: string, label: string): string | undefined {
  if (path.length === 0 || isAbsolute(path) || path.startsWith('../') || path.includes('/../'))
    return `${label} must be a relative path: ${path}`;
  return undefined;
}

export function parseBundleManifest(
  value: unknown,
  productDirectory: string,
): { manifest?: BundleManifest; issues: string[] } {
  const issues: string[] = [];
  const record = asRecord(value);
  if (!record) return { issues: ['bundle manifest must be an object'] };
  if (record.formatVersion !== 1) issues.push('bundle manifest formatVersion must be 1');
  if (record.product !== productDirectory)
    issues.push(`bundle manifest product must be ${productDirectory}`);
  const entry = record.entry;
  if (typeof entry !== 'string') issues.push('bundle manifest entry must be a string');
  if (typeof record.productDigest !== 'string' || !sha256Pattern.test(record.productDigest))
    issues.push('bundle manifest productDigest must be sha256');
  if (!Array.isArray(record.outputs) || record.outputs.length === 0)
    issues.push('bundle manifest outputs must be non-empty');
  if (!Array.isArray(record.modules) || record.modules.length === 0)
    issues.push('bundle manifest modules must be non-empty');
  if (issues.length > 0) return { issues };

  const outputs: BundleOutput[] = [];
  for (const item of record.outputs as unknown[]) {
    const output = asRecord(item);
    if (!output) {
      issues.push('bundle output must be an object');
      continue;
    }
    if (typeof output.file !== 'string' || typeof output.sha256 !== 'string') {
      issues.push('bundle output file and sha256 must be strings');
      continue;
    }
    const pathIssue = relativePathIssue(output.file, 'bundle output file');
    if (pathIssue) issues.push(pathIssue);
    if (!sha256Pattern.test(output.sha256))
      issues.push(`bundle output ${output.file} sha256 is invalid`);
    outputs.push({ file: output.file, sha256: output.sha256 });
  }

  const modules: BundleModule[] = [];
  for (const item of record.modules as unknown[]) {
    const module = asRecord(item);
    if (!module) {
      issues.push('bundle module must be an object');
      continue;
    }
    if (typeof module.source !== 'string' || typeof module.dependency !== 'boolean') {
      issues.push('bundle module source and dependency must have valid types');
      continue;
    }
    const pathIssue = relativePathIssue(module.source, 'bundle module source');
    if (pathIssue) issues.push(pathIssue);
    if (!Array.isArray(module.outputs) || module.outputs.length === 0) {
      issues.push(`bundle module ${module.source} outputs must be non-empty`);
      continue;
    }
    const moduleOutputs = module.outputs.filter(
      (output): output is string => typeof output === 'string',
    );
    if (moduleOutputs.length !== module.outputs.length)
      issues.push(`bundle module ${module.source} outputs must be strings`);
    modules.push({
      source: module.source,
      dependency: module.dependency,
      outputs: moduleOutputs,
    });
  }
  if (issues.length > 0) return { issues };
  return {
    manifest: {
      formatVersion: 1,
      product: productDirectory,
      entry: entry as string,
      productDigest: record.productDigest as string,
      modules,
      outputs,
    },
    issues,
  };
}

function packageRoot(directory: string): string {
  return `packages/${directory}/`;
}

function testInfrastructurePrefixes(manifest: ProjectManifest): string[] {
  const testPackage = manifest.packages.find((item) => item.role === 'test');
  const protocolPackages = manifest.packages.filter((item) => item.role === 'protocol');
  return [
    ...(testPackage ? [packageRoot(testPackage.directory)] : []),
    ...protocolPackages.map((item) => `${packageRoot(item.directory)}testing/`),
  ];
}

function contractSources(manifest: ProjectManifest): Set<string> {
  const sources = new Set<string>();
  for (const protocol of manifest.packages.filter((item) => item.role === 'protocol')) {
    if (protocol.contract) sources.add(protocol.contract.file);
    sources.add(`${packageRoot(protocol.directory)}testing/contract.bundle.json`);
  }
  return sources;
}

/** 工作区包构建产物前缀：产品经 workspace 依赖消费绑定协议包时，其 dist 属于依赖而不是手写源码。 */
function workspaceDistPrefixes(manifest: ProjectManifest): string[] {
  return manifest.packages.map((item) => `${packageRoot(item.directory)}dist/`);
}

function isDependencySource(source: string): boolean {
  return (
    source.startsWith('virtual:') ||
    source === 'node_modules' ||
    source.startsWith('node_modules/') ||
    source.includes('/node_modules/')
  );
}

/** 按清单事实判定产物模块来源，测试设施判断不使用路径子串匹配。 */
export function classifyBundleSource(
  root: string,
  manifest: ProjectManifest,
  module: Pick<BundleModule, 'source' | 'dependency'>,
): BundleSourceKind {
  if (contractSources(manifest).has(module.source)) return 'contract';
  if (testInfrastructurePrefixes(manifest).some((prefix) => module.source.startsWith(prefix)))
    return 'test-infrastructure';
  if (workspaceDistPrefixes(manifest).some((prefix) => module.source.startsWith(prefix)))
    return 'dependency';
  if (module.dependency) return isDependencySource(module.source) ? 'dependency' : 'unknown';
  const source = readSourceInventory(root, manifest).files.find(
    (item) => item.path === module.source && item.class !== 'test',
  );
  return source ? 'handwritten' : 'unknown';
}

export function outputDigest(
  root: string,
  productDirectory: string,
  output: BundleOutput,
): string | undefined {
  const path = join(root, 'packages', productDirectory, 'dist', output.file);
  if (!existsSync(path)) return undefined;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function distOutputFiles(distRoot: string): string[] {
  return collectFiles(distRoot, () => true)
    .map((path) => relative(distRoot, path).split('\\').join('/'))
    .filter((path) => path !== 'index.html')
    .sort((left, right) => left.localeCompare(right));
}

export function relativeAssetIssues(distRoot: string): string[] {
  const indexPath = join(distRoot, 'index.html');
  if (!existsSync(indexPath)) return ['dist/index.html is missing'];
  const source = readFileSync(indexPath, 'utf8');
  const issues: string[] = [];
  for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const path = match[1]!;
    if (path.startsWith('/') || path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path))
      issues.push(`dist/index.html resource is not relative: ${path}`);
  }
  return issues;
}

export function cssResidueIssues(distRoot: string): string[] {
  const issues: string[] = [];
  for (const path of collectFiles(distRoot, (file) => file.endsWith('.css'))) {
    const source = readFileSync(path, 'utf8');
    for (const residue of cssResidues)
      if (source.includes(residue))
        issues.push(`${relative(distRoot, path)} contains compiled CSS residue ${residue}`);
  }
  return issues;
}

export function leakedSourceIssues(
  root: string,
  distRoot: string,
  productDirectory: string,
): string[] {
  const issues: string[] = [];
  const sourcePrefix = `packages/${productDirectory}/src/`;
  for (const path of collectFiles(distRoot, (file) =>
    textExtensions.has(file.slice(file.lastIndexOf('.'))),
  )) {
    const source = readFileSync(path, 'utf8');
    if (source.includes('bundle-manifest.json'))
      issues.push(`${relative(distRoot, path)} contains bundle manifest path`);
    if (source.includes(sourcePrefix))
      issues.push(`${relative(distRoot, path)} leaks source path ${sourcePrefix}`);
  }
  if (existsSync(join(distRoot, 'bundle-manifest.json')))
    issues.push('dist/bundle-manifest.json must live outside dist');
  if (!existsSync(bundleManifestPath(root, productDirectory)))
    issues.push('bundle manifest is not outside dist');
  return issues;
}
