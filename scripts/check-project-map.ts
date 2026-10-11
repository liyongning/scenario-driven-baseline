import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { nodeText } from './lib/spec-inventory.ts';
import { errorMessage, loadProjectManifest, type ProjectManifest } from './lib/project-manifest.ts';

/** 模块级 AGENTS.md 的固定五节；顺序即检查顺序，没有内容的节写「无」，不得删节。 */
export const moduleSections = ['职责', '对外入口', '允许依赖', '本地约束', '子模块'] as const;
/** 根「项目地图」与包级「子模块」两节负责两级列表的对账。 */
export const rootMapSection = '项目地图';
export const packageMapSection = '子模块';
/** 不视为模块的一级子目录：生成代码、测试夹具、隐藏目录与依赖目录。 */
const nonModuleDirectories = new Set(['generated', '.generated', 'fixtures', 'node_modules']);
/** CLAUDE.md 的首个非空行固定为该导入行，保证 Claude Code 加载同目录 AGENTS.md。 */
export const claudeImport = '@AGENTS.md';

type Section = Readonly<{
  heading: string;
  depth: number;
  code: ReadonlyArray<string>;
  links: ReadonlyArray<string>;
}>;

function markdown(content: string) {
  return unified().use(remarkParse).parse(content);
}

/** 把 Markdown 顶层切成「标题 → 该节行内代码与链接」；标题自身也登记为一条。 */
function sectionsOf(content: string): Section[] {
  const sections: Section[] = [];
  let current: { heading: string; depth: number; code: string[]; links: string[] } | undefined;
  for (const node of markdown(content).children) {
    if (node.type === 'heading') {
      current = { heading: nodeText(node), depth: node.depth, code: [], links: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    visit(node, 'inlineCode', (child) => {
      current!.code.push(child.value);
    });
    visit(node, 'link', (child) => {
      current!.links.push(child.url);
    });
  }
  return sections;
}

/** 模块目录：清单 `moduleRoots` 每个根下的一级子目录，生成目录、夹具与隐藏目录不算模块。 */
export function moduleDirectories(root: string, manifest: ProjectManifest): string[] {
  const modules: string[] = [];
  for (const pkg of manifest.packages) {
    for (const moduleRoot of pkg.moduleRoots ?? ['src']) {
      const directory = join(root, 'packages', pkg.directory, moduleRoot);
      if (!existsSync(directory)) continue;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || nonModuleDirectories.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        modules.push(`packages/${pkg.directory}/${moduleRoot}/${entry.name}`);
      }
    }
  }
  return modules;
}

/** 各级 AGENTS.md 的仓库相对路径：根、每个包目录、每个模块目录。 */
export function agentsPaths(root: string, manifest: ProjectManifest): string[] {
  return [
    'AGENTS.md',
    ...manifest.packages.map((pkg) => `packages/${pkg.directory}/AGENTS.md`),
    ...moduleDirectories(root, manifest).map((module) => `${module}/AGENTS.md`),
  ];
}

/** 取行内代码里的仓库相对模块/包路径；其余行内代码（目录名、命令、字段）不参与对账。 */
function mappedPaths(section: Section): string[] {
  return section.code.filter((code) => /^packages\/[^\s]+$/.test(code));
}

function claudePath(agents: string): string {
  return agents.replace(/AGENTS\.md$/, 'CLAUDE.md');
}

/** 目录树下的全部 CLAUDE.md（跳过依赖、产物与生成目录），用于反向配对检查。 */
function claudeFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string, relative: string) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (nonModuleDirectories.has(entry.name) || entry.name.startsWith('.')) continue;
        if (['dist', 'artifacts', 'coverage'].includes(entry.name)) continue;
        walk(join(directory, entry.name), relative ? `${relative}/${entry.name}` : entry.name);
        continue;
      }
      if (entry.name === 'CLAUDE.md') found.push(relative ? `${relative}/CLAUDE.md` : 'CLAUDE.md');
    }
  };
  walk('.', '');
  return found;
}

function firstNonEmptyLine(content: string): string {
  return (
    content
      .split('\n')
      .find((line) => line.trim() !== '')
      ?.trim() ?? ''
  );
}

/** 逐项检查项目地图结构；内容是否准确由评审负责，机器只检查结构与列表一致。 */
export function checkProjectMap(
  root: string,
  manifest: ProjectManifest = loadProjectManifest(root),
): string[] {
  const errors: string[] = [];
  const modules = moduleDirectories(root, manifest);
  // 1. 根、包、模块三级都要有 AGENTS.md。
  for (const path of agentsPaths(root, manifest)) {
    if (!existsSync(join(root, path))) errors.push(`missing ${path}`);
  }
  // 2. 模块级 AGENTS.md 的五节齐全且保持顺序。
  for (const module of modules) {
    const path = `${module}/AGENTS.md`;
    if (!existsSync(join(root, path))) continue;
    const headings = sectionsOf(readFileSync(join(root, path), 'utf8')).map(
      (section) => section.heading,
    );
    let previous = -1;
    for (const name of moduleSections) {
      const index = headings.indexOf(name);
      if (index < 0) errors.push(`${path}: missing section ## ${name}`);
      else if (index < previous) errors.push(`${path}: section ## ${name} is out of order`);
      else previous = index;
    }
  }
  // 3. 包级「子模块」列表与实际模块目录一致；根「项目地图」的包与清单一致。
  const rootAgents = join(root, 'AGENTS.md');
  if (existsSync(rootAgents)) {
    const section = sectionsOf(readFileSync(rootAgents, 'utf8')).find(
      (item) => item.heading === rootMapSection,
    );
    if (!section) errors.push(`AGENTS.md: missing section ## ${rootMapSection}`);
    else {
      const listed = new Set(mappedPaths(section));
      for (const pkg of manifest.packages) {
        const expected = `packages/${pkg.directory}`;
        if (!listed.has(expected))
          errors.push(`AGENTS.md: ${rootMapSection} is missing ${expected}`);
        listed.delete(expected);
        if (!section.links.some((url) => url.split('#')[0]!.endsWith(`${expected}/AGENTS.md`)))
          errors.push(`AGENTS.md: ${rootMapSection} does not link ${expected}/AGENTS.md`);
      }
      for (const entry of listed)
        errors.push(`AGENTS.md: ${rootMapSection} lists unknown entry ${entry}`);
    }
  }
  for (const pkg of manifest.packages) {
    const path = `packages/${pkg.directory}/AGENTS.md`;
    if (!existsSync(join(root, path))) continue;
    const section = sectionsOf(readFileSync(join(root, path), 'utf8')).find(
      (item) => item.heading === packageMapSection,
    );
    const expected = new Set(
      modules.filter((module) => module.startsWith(`packages/${pkg.directory}/`)),
    );
    if (!section) {
      errors.push(`${path}: missing section ## ${packageMapSection}`);
      continue;
    }
    const listed = new Set(mappedPaths(section));
    for (const module of expected)
      if (!listed.has(module)) errors.push(`${path}: ${packageMapSection} is missing ${module}`);
    for (const entry of listed)
      if (!expected.has(entry))
        errors.push(`${path}: ${packageMapSection} lists unknown entry ${entry}`);
  }
  // 4. AGENTS.md 与 CLAUDE.md 双向配对，CLAUDE.md 首个非空行为 @AGENTS.md。
  for (const path of agentsPaths(root, manifest)) {
    const claude = claudePath(path);
    if (!existsSync(join(root, claude))) {
      errors.push(`missing ${claude}`);
      continue;
    }
    const first = firstNonEmptyLine(readFileSync(join(root, claude), 'utf8'));
    if (first !== claudeImport)
      errors.push(`${claude}: first non-empty line must be ${claudeImport}, found ${first}`);
  }
  for (const claude of claudeFiles(root)) {
    const agents = claude.replace(/CLAUDE\.md$/, 'AGENTS.md');
    if (!existsSync(join(root, agents)))
      errors.push(`${claude}: missing ${agents} in the same directory`);
  }
  return errors;
}

export function runProjectMapCli(argv: ReadonlyArray<string>, cwd = process.cwd()) {
  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 && argv[rootIndex + 1] ? resolve(argv[rootIndex + 1]!) : cwd;
  let issues: string[];
  try {
    issues = checkProjectMap(root);
  } catch (error) {
    issues = [errorMessage(error)];
  }
  return { issues, exitCode: Math.min(1, issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by SCN-TEMPLATE-ENGINEERING-011. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = runProjectMapCli(process.argv);
  console.log(JSON.stringify({ issues: result.issues }, null, 2));
  process.exitCode = result.exitCode;
}
/* v8 ignore stop */
