import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { checkSchemaDocumentation } from './lib/schema-docs.ts';
import { loadScenarioConfig, matchesAny } from './lib/scenario-config.ts';
import { errorMessage, loadProjectManifest, projectManifestSchemaUrl, type ProjectManifest } from './lib/project-manifest.ts';
import { nodeText } from './lib/spec-inventory.ts';
import { readEffectiveSpecs } from './lib/spec-sources.ts';

type Manifest = { name: string; private?: boolean; exports?: Record<string, unknown>; dependencies?: Record<string, string>; scripts?: Record<string, string> };

/** 使用指南的路径与固定章节标题；架构检查按标题层级与文字判定。 */
const guideRelativePath = 'docs/template-guide.md';
const guideSections = {
  level2: ['能力地图', '从方案到验收', '初始化方式', '替换点地图'],
  level3: ['协议来源', '运行平台', '包发布'],
} as const;
/** pnpm 内置命令不作为根 package.json 的脚本核对。 */
const pnpmBuiltins = new Set(['install', 'add', 'remove', 'exec', 'dlx']);

function markdown(content: string) {
  return unified().use(remarkParse).parse(content);
}

function linksIn(content: string): string[] {
  const urls: string[] = [];
  visit(markdown(content), 'link', node => { urls.push(node.url); });
  return urls;
}

function linkTarget(baseFile: string, url: string): string {
  return resolve(dirname(baseFile), decodeURIComponent(url.split('#')[0]!));
}

/** 文件存在且其中任一链接解析到目标文件。 */
function linksTo(filePath: string, target: string): boolean {
  if (!existsSync(filePath)) return false;
  return linksIn(readFileSync(filePath, 'utf8')).some(url => linkTarget(filePath, url) === target);
}

/** 按项目配置的格式从全文中提取 Scenario ID 词元。 */
function extractScenarioIds(text: string, patterns: ReadonlyArray<string>): string[] {
  return text.split(/[^A-Za-z0-9_-]+/).filter(token => matchesAny(token, patterns));
}

/** 取行内代码中紧跟在 `pnpm`/`pnpm run` 之后、不以 `-` 开头的命令词。 */
function pnpmCommands(code: string): string[] {
  const commands: string[] = [];
  for (const match of code.matchAll(/pnpm(?:\s+run)?\s+(\S+)/g)) {
    const command = match[1]!.replace(/[,.;:，。；：)）]+$/, '');
    if (!command.startsWith('-')) commands.push(command);
  }
  return commands;
}

/** 取行内代码中的清单字段引用，如 `manifest.packages[].directory`。 */
function manifestFields(code: string): string[] {
  const match = /^manifest\.[A-Za-z0-9_.[\]]+$/.exec(code.trim());
  return match ? [match[0]] : [];
}

/** 按点号分段解析清单 schema 的 properties/items；数组元素字段写作 `packages[]`。 */
function manifestFieldExists(schema: unknown, field: string): boolean {
  let current: unknown = schema;
  for (const segment of field.replace(/^manifest\./, '').split('.')) {
    const isArray = segment.endsWith('[]');
    const key = isArray ? segment.slice(0, -2) : segment;
    const { properties = {} } = current as { properties?: Record<string, unknown> };
    if (!(key in properties)) return false;
    const property = properties[key] as { items?: unknown };
    current = isArray ? property.items : property;
  }
  return true;
}

/** 使用指南的结构与机械可核对事实：存在、链接、章节、相对链接、Scenario ID、pnpm 命令与清单字段。 */
async function checkTemplateGuide(root: string, scripts: Record<string, string>): Promise<string[]> {
  const errors: string[] = [];
  const guideFile = join(root, guideRelativePath);
  if (!existsSync(guideFile)) return [`missing ${guideRelativePath}`];
  const target = resolve(guideFile);
  if (!linksTo(join(root, 'AGENTS.md'), target)) errors.push(`AGENTS.md does not link ${guideRelativePath}`);
  if (!linksTo(join(root, 'README.md'), target)) errors.push(`README.md does not link ${guideRelativePath}`);
  const content = readFileSync(guideFile, 'utf8');
  const headings = new Set<string>();
  visit(markdown(content), 'heading', node => { headings.add(`${node.depth}:${nodeText(node)}`); });
  for (const section of guideSections.level2) if (!headings.has(`2:${section}`)) errors.push(`missing guide section ## ${section}`);
  for (const section of guideSections.level3) if (!headings.has(`3:${section}`)) errors.push(`missing guide section ### ${section}`);
  for (const url of linksIn(content)) {
    if (/^(https?:|#|mailto:)/.test(url)) continue;
    if (!existsSync(linkTarget(guideFile, url))) errors.push(`broken link ${guideRelativePath} -> ${url}`);
  }
  const config = await loadScenarioConfig(root);
  const registered = new Set<string>();
  for (const document of (await readEffectiveSpecs(root)).documents) {
    for (const match of document.content.matchAll(/^####\s+Scenario:\s+(\S+)/gm)) registered.add(match[1]!);
  }
  for (const id of new Set(extractScenarioIds(content, config.scenarioIdPatterns))) {
    if (!registered.has(id)) errors.push(`unregistered Scenario ID ${id}`);
  }
  const schema = JSON.parse(readFileSync(projectManifestSchemaUrl, 'utf8')) as unknown;
  const inlineCode: string[] = [];
  visit(markdown(content), 'inlineCode', node => { inlineCode.push(node.value); });
  for (const code of inlineCode) {
    for (const command of pnpmCommands(code)) if (!pnpmBuiltins.has(command) && !scripts[command]) errors.push(`unknown pnpm command ${command}`);
    for (const field of manifestFields(code)) if (!manifestFieldExists(schema, field)) errors.push(`unknown manifest field ${field}`);
  }
  return errors;
}

/** 只补目录、清单、规则链接与使用指南检查；导入图由 dependency-cruiser 唯一解析。 */
export async function checkArchitecture(root: string, dependencyExitCode: number): Promise<string[]> {
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
    const tree = markdown(readFileSync(full, 'utf8'));
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
  errors.push(...await checkTemplateGuide(root, scripts));
  return errors;
}

export async function runArchitectureCli(argv: ReadonlyArray<string>, cwd = process.cwd()) {
  const rootIndex = argv.indexOf('--root');
  const dependencyIndex = argv.indexOf('--dependency-exit-code');
  const root = rootIndex >= 0 && argv[rootIndex + 1] ? resolve(argv[rootIndex + 1]!) : cwd;
  const dependencyExitCode = dependencyIndex >= 0 && argv[dependencyIndex + 1]
    ? Number(argv[dependencyIndex + 1])
    : 0;
  if (!Number.isInteger(dependencyExitCode) || dependencyExitCode < 0) throw new Error('--dependency-exit-code must be a non-negative integer');
  const issues = await checkArchitecture(root, dependencyExitCode);
  return { issues, exitCode: Math.min(1, issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by SCN-SCENARIO-GATE-009. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await runArchitectureCli(process.argv);
  console.log(JSON.stringify({ issues: result.issues }, null, 2));
  process.exitCode = result.exitCode;
}
/* v8 ignore stop */
