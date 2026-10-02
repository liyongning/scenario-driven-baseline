import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { checkSchemaDocumentation } from './lib/schema-docs.ts';
import { errorMessage, loadProjectManifest, type ProjectManifest } from './lib/project-manifest.ts';

type Manifest = { name: string; private?: boolean; exports?: Record<string, unknown>; dependencies?: Record<string, string>; scripts?: Record<string, string> };

/** 只补目录、清单和规则链接检查；导入图由 dependency-cruiser 唯一解析。 */
export function checkArchitecture(root: string, dependencyExitCode: number): string[] {
  const errors: string[] = [];
  if (dependencyExitCode !== 0) errors.push('dependency-cruiser failed');
  let manifest: ProjectManifest;
  try {
    manifest = loadProjectManifest(root);
  } catch (error) {
    return [...errors, errorMessage(error)];
  }
  const readManifest = (path: string): Manifest => JSON.parse(readFileSync(join(root, path), 'utf8')) as Manifest;
  const scripts = readManifest('package.json').scripts ?? {};
  for (const command of manifest.requiredCommands) if (!scripts[command]) errors.push(`missing command ${command}`);
  const declared = new Set(manifest.packages.map(item => item.directory));
  for (const name of readdirSync(join(root, 'packages'))) if (!declared.has(name)) errors.push(`unexpected package ${name}`);
  for (const path of ['AGENTS.md', ...manifest.packages.map(item => `packages/${item.directory}/AGENTS.md`)]) {
    const full = join(root, path);
    if (!existsSync(full)) { errors.push(`missing ${path}`); continue; }
    const tree = unified().use(remarkParse).parse(readFileSync(full, 'utf8'));
    visit(tree, 'link', node => {
      if (/^(https?:|#)/.test(node.url)) return;
      const target = node.url.split('#')[0]!;
      if (!existsSync(resolve(dirname(full), decodeURIComponent(target)))) errors.push(`broken link ${path} -> ${node.url}`);
    });
  }
  const product = manifest.packages.find(item => item.role === 'product')!;
  const protocol = manifest.packages.find(item => item.role === 'protocol')!;
  const test = manifest.packages.find(item => item.role === 'test')!;
  for (const entry of manifest.packages) {
    const directory = join(root, 'packages', entry.directory);
    if (!existsSync(directory)) { errors.push(`missing package directory packages/${entry.directory}`); continue; }
    const packageManifest = readManifest(`packages/${entry.directory}/package.json`);
    if (packageManifest.name !== entry.name) errors.push(`wrong package name ${entry.directory}`);
    if (entry.role === 'test' && packageManifest.private !== true) errors.push(`${entry.directory} must be private`);
    if (Object.keys(packageManifest.exports ?? {}).some(key => /testing|internal|core/.test(key))) errors.push(`private entry exported by ${entry.directory}`);
    for (const child of readdirSync(directory, { withFileTypes: true })) {
      if (child.isDirectory() && !entry.allowedDirectories.includes(child.name)) errors.push(`unexpected directory packages/${entry.directory}/${child.name}`);
    }
  }
  const protocolManifest = readManifest(`packages/${protocol.directory}/package.json`);
  if (Object.keys(protocolManifest.dependencies ?? {}).some(dep => [product.name, test.name].includes(dep))) errors.push('protocol cannot depend on SDK/E2E');
  errors.push(...checkSchemaDocumentation(root));
  return errors;
}

export function runArchitectureCli(argv: ReadonlyArray<string>, cwd = process.cwd()) {
  const rootIndex = argv.indexOf('--root');
  const dependencyIndex = argv.indexOf('--dependency-exit-code');
  const root = rootIndex >= 0 && argv[rootIndex + 1] ? resolve(argv[rootIndex + 1]!) : cwd;
  const dependencyExitCode = dependencyIndex >= 0 && argv[dependencyIndex + 1]
    ? Number(argv[dependencyIndex + 1])
    : 0;
  if (!Number.isInteger(dependencyExitCode) || dependencyExitCode < 0) throw new Error('--dependency-exit-code must be a non-negative integer');
  const issues = checkArchitecture(root, dependencyExitCode);
  return { issues, exitCode: Math.min(1, issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by SCN-SCENARIO-GATE-009. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = runArchitectureCli(process.argv);
  console.log(JSON.stringify({ issues: result.issues }, null, 2));
  process.exitCode = result.exitCode;
}
/* v8 ignore stop */
