import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type { ICruiseResult, IModule } from 'dependency-cruiser';
import { loadProjectManifest } from './lib/project-manifest.ts';
import { webAppPackageDirectories } from './lib/web-app-checks.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const depcruise = resolve(repositoryRoot, 'node_modules/.bin/depcruise');
const testFile = /[.](?:test|spec)[.]vue$/;

function normalize(path: string | undefined): string {
  return String(path).split(sep).join('/');
}

function isInside(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}/`);
}

function componentDirectory(path: string): string {
  return dirname(path);
}

function componentName(path: string): string {
  return path.slice(0, -'.vue'.length).split('/').at(-1) as string;
}

type CruiseRunner = typeof spawnSync;

/** 调用 dependency-cruiser 获取 Web 源码依赖图；规则只消费它的 JSON 结果。 */
export function cruiseGraph(
  root: string,
  sourceRoot: string,
  run: CruiseRunner = spawnSync,
): IModule[] {
  const configRoot = mkdtempSync(join(tmpdir(), 'component-tree-config-'));
  const config = join(configRoot, 'dependency-cruiser.cjs');
  writeFileSync(
    config,
    `module.exports = { forbidden: [], options: { doNotFollow: { path: 'node_modules' }, exclude: { path: ['node_modules', 'dist'] }, tsPreCompilationDeps: true, combinedDependencies: true } };\n`,
  );
  try {
    const result = run(depcruise, ['--config', config, '--output-type', 'json', sourceRoot], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (!result.stdout) throw new Error(`dependency-cruiser produced no JSON: ${result.stderr}`);
    return (JSON.parse(result.stdout) as ICruiseResult).modules;
  } finally {
    rmSync(configRoot, { recursive: true, force: true });
  }
}

function styleSources(root: string, path: string): string[] {
  if (!path.endsWith('.vue')) return [];
  const source = readFileSync(join(root, path), 'utf8');
  return [...source.matchAll(/<style\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/g)]
    .map((match) => match[1] as string)
    .map((specifier) => normalize(relative(root, resolve(root, dirname(path), specifier))))
    .filter((target) => existsSync(join(root, target)));
}

/** 五条组件树规则均只处理 web-app 包；无组件时保持可运行。 */
export function checkComponentTree(root = process.cwd()) {
  const manifest = loadProjectManifest(root);
  const checked = webAppPackageDirectories(manifest);
  const issues: string[] = [];
  for (const directory of checked) {
    const pkg = manifest.packages.find((item) => `packages/${item.directory}` === directory)!;
    const sourceRoot = `packages/${pkg.directory}/${pkg.moduleRoots?.[0] ?? 'src'}`;
    const modules = cruiseGraph(root, sourceRoot);
    const graph = new Map<string, Set<string>>();
    for (const module of modules) {
      const source = normalize(module.source);
      if (!isInside(source, sourceRoot) || testFile.test(source)) continue;
      graph.set(source, new Set());
    }
    for (const [source] of graph) {
      const module = modules.find((item) => normalize(item.source) === source)!;
      for (const dependency of module.dependencies) {
        const target = normalize(dependency.resolved);
        if (isInside(target, sourceRoot)) graph.get(source)!.add(target);
      }
      for (const target of styleSources(root, source)) graph.get(source)!.add(target);
    }

    const incoming = new Map<string, Set<string>>();
    for (const [source, targets] of graph) {
      for (const target of targets) {
        if (!graph.has(target)) graph.set(target, new Set());
        incoming.set(target, new Set([...(incoming.get(target) ?? []), source]));
      }
    }

    const vueByDirectory = new Map<string, string[]>();
    for (const source of graph.keys()) {
      if (!source.endsWith('.vue')) continue;
      const component = componentDirectory(source);
      vueByDirectory.set(component, [...(vueByDirectory.get(component) ?? []), source]);
    }
    for (const [component, entries] of vueByDirectory) {
      if (entries.length !== 1) {
        issues.push(
          `component-tree/1 ${component}: expected exactly one .vue, found ${entries.length}`,
        );
        continue;
      }
      const entry = entries[0]!;
      const expected = component.split('/').at(-1)!;
      if (componentName(entry) !== expected)
        issues.push(
          `component-tree/1 ${entry}: file name must equal component directory ${expected}`,
        );
    }

    const componentDirectories = [...vueByDirectory.keys()];
    for (const parent of componentDirectories) {
      for (const child of componentDirectories.filter(
        (candidate) => candidate !== parent && isInside(candidate, parent),
      )) {
        for (const [source, targets] of graph) {
          if (!isInside(source, child)) continue;
          for (const target of targets)
            if (!isInside(target, child) && isInside(target, parent))
              issues.push(
                `component-tree/2 ${source}: child component must not import parent tree ${parent}`,
              );
        }
      }
    }

    const mainEntry = `${sourceRoot}/main.ts`;
    for (const [source, targets] of graph) {
      for (const target of targets) {
        if (!target.endsWith('.css') || source === mainEntry) continue;
        if (!source.endsWith('.vue') || dirname(source) !== dirname(target))
          issues.push(
            `component-tree/3 ${source}: CSS ${target} must be imported by a same-directory .vue, or globally from ${mainEntry}`,
          );
      }
    }

    for (const component of componentDirectories) {
      const entries = vueByDirectory.get(component)!;
      const entry = entries.length === 1 ? entries[0]! : undefined;
      for (const target of graph.keys()) {
        if (!isInside(target, component)) continue;
        for (const source of incoming.get(target) ?? []) {
          if (isInside(source, component) || target === entry) continue;
          issues.push(
            `component-tree/4 ${source}: outside ${component} may only import ${entry ?? 'the component entry'}`,
          );
        }
      }
      if (entry && ![...(incoming.get(entry) ?? [])].some((source) => source !== entry))
        issues.push(`component-tree/5 ${entry}: orphan component has no incoming reference`);
    }
  }
  return { checked, issues: [...new Set(issues)].sort() };
}

/* v8 ignore start -- 真实 CLI 分支由受控临时根工程用例执行。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = checkComponentTree();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = Math.min(1, result.issues.length);
}
/* v8 ignore stop */
