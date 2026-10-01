import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { checkSchemaDocumentation } from './lib/schema-docs.ts';

type Manifest = { name: string; private?: boolean; exports?: Record<string, unknown>; dependencies?: Record<string, string>; scripts?: Record<string, string> };
const packageNames = ['payment-sdk', 'payment-protocol', 'e2e'];
const requiredCommands = ['proto:version', 'proto:validate', 'proto:status', 'proto:sync', 'lint', 'typecheck', 'build', 'test:unit', 'test:integration', 'test:e2e:weapp', 'check:architecture', 'check:fixtures', 'check:scenarios', 'check:package', 'check:fast', 'check'];
const allowedDirectories: Record<string, string[]> = {
  'payment-sdk': ['src', 'dist', 'node_modules'],
  'payment-protocol': ['src', 'testing', 'dist', 'node_modules'],
  e2e: ['src', 'host', 'tests', 'node_modules'],
};

/** 只补目录、清单和规则链接检查；导入图由 dependency-cruiser 唯一解析。 */
export function checkArchitecture(root: string, dependencyExitCode: number): string[] {
  const errors: string[] = [];
  if (dependencyExitCode !== 0) errors.push('dependency-cruiser failed');
  const readManifest = (path: string): Manifest => JSON.parse(readFileSync(join(root, path), 'utf8')) as Manifest;
  const scripts = readManifest('package.json').scripts ?? {};
  for (const command of requiredCommands) if (!scripts[command]) errors.push(`missing command ${command}`);
  for (const name of readdirSync(join(root, 'packages'))) if (!packageNames.includes(name)) errors.push(`unexpected package ${name}`);
  for (const path of ['AGENTS.md', ...packageNames.map(name => `packages/${name}/AGENTS.md`)]) {
    const full = join(root, path);
    if (!existsSync(full)) { errors.push(`missing ${path}`); continue; }
    const tree = unified().use(remarkParse).parse(readFileSync(full, 'utf8'));
    visit(tree, 'link', node => {
      if (/^(https?:|#)/.test(node.url)) return;
      const target = node.url.split('#')[0]!;
      if (!existsSync(resolve(dirname(full), decodeURIComponent(target)))) errors.push(`broken link ${path} -> ${node.url}`);
    });
  }
  for (const name of packageNames) {
    const manifest = readManifest(`packages/${name}/package.json`);
    if (manifest.name !== `@daqian/${name === 'e2e' ? 'payment-e2e' : name}`) errors.push(`wrong package name ${name}`);
    if (name === 'e2e' && manifest.private !== true) errors.push('e2e must be private');
    if (name === 'payment-protocol' && Object.keys(manifest.dependencies ?? {}).some(dep => ['@daqian/payment-sdk', '@daqian/payment-e2e'].includes(dep))) errors.push('protocol cannot depend on SDK/E2E');
    if (Object.keys(manifest.exports ?? {}).some(entry => /testing|internal|core/.test(entry))) errors.push(`private entry exported by ${name}`);
    for (const entry of readdirSync(join(root, 'packages', name), { withFileTypes: true })) {
      if (entry.isDirectory() && !allowedDirectories[name]!.includes(entry.name)) errors.push(`unexpected directory packages/${name}/${entry.name}`);
    }
  }
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
