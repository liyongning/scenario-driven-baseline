import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { visit } from 'unist-util-visit';
import { checkProjectMap } from './check-project-map.ts';
import {
  architectureRelativePath,
  checkArchitectureDoc,
  guideRelativePath,
} from './lib/architecture-doc.ts';
import { checkExampleMarkers } from './lib/example-markers.ts';
import { headingsOf, linkTarget, linksTo, markdown, relativeLinks } from './lib/markdown-docs.ts';
import { checkSchemaDocumentation } from './lib/schema-docs.ts';
import { unregisteredScenarioIds } from './lib/scenario-ids.ts';
import { loadScenarioConfig } from './lib/scenario-config.ts';
import {
  errorMessage,
  loadProjectManifest,
  packageByRole,
  projectManifestSchemaUrl,
  type ProjectManifest,
} from './lib/project-manifest.ts';
import { readEffectiveSpecs } from './lib/spec-sources.ts';

/** 依赖与平台规则的路径按清单角色生成；实现与 dependency-cruiser 配置共用同一份 CJS 模块。 */
type DependencyRules = Readonly<{ cruiseTargets(manifest: ProjectManifest): string[] }>;
const dependencyRules = createRequire(import.meta.url)(
  './lib/dependency-rules.cjs',
) as DependencyRules;

type Manifest = {
  name: string;
  private?: boolean;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

/** 使用指南的固定章节标题；架构检查按标题层级与文字判定。 */
const guideSections = {
  level2: [
    '能力地图',
    '从方案到验收',
    '初始化方式',
    '移除模板示例',
    '归档已知限制',
    '版本对齐',
    '使用方约定',
    '复刻验收',
    '替换点地图',
  ],
  level3: ['协议来源', '运行平台', '包发布'],
} as const;
/** pnpm 内置命令不作为根 package.json 的脚本核对。 */
const pnpmBuiltins = new Set(['install', 'add', 'remove', 'exec', 'dlx']);
/** 模板命令识别的具名环境变量；行内代码里出现表外的 `NAME=` 前缀视为不可执行的命令写法。 */
const templateEnvironmentNames = new Set([
  'SCENARIO_GATE_CHANGES',
  'TEMPLATE_COPY',
  'TEST_AFFECTED_PARTIAL',
  'VERIFY_REPORT_FILE',
  'VERIFY_RUN_ID',
  'WECHAT_DEVTOOLS_CLI',
]);
/** 指南「移除模板示例」必须逐项写明的删除白名单；包路径按清单角色派生，与 ENG-06 的清单一致。 */
function exampleWhitelistEntries(manifest: ProjectManifest): string[] {
  const product = packageByRole(manifest, 'product').directory;
  const protocol = packageByRole(manifest, 'protocol').directory;
  const test = packageByRole(manifest, 'test').directory;
  return [
    `packages/${product}/src/example/`,
    `packages/${protocol}/testing/shadow/example/`,
    `packages/${test}/tests/example/`,
    `packages/${test}/tests/weapp/example/`,
    `packages/${test}/host/weapp/example-runner.ts`,
    `packages/${test}/tests/fixtures/`,
    'SCN-TEMPLATE-EXAMPLE-*',
    'FLOW-TEMPLATE-EXAMPLE-*',
    `packages/${test}/tests/tooling/SCN-TEMPLATE-EXAMPLE-*`,
    'openspec/specs/template-example/',
    `packages/${test}/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`,
    `packages/${test}/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`,
    `packages/${test}/tests/protocol/SCN-PROTOCOL-CONTRACT-002-extension.spec.ts`,
    'template-example:begin',
    'template-example:end',
    `packages/${product}/src/index.ts`,
    'consumed-operations.ts',
    `packages/${test}/host/weapp/app.js`,
    `packages/${test}/src/drivers/weapp-host.test.ts`,
    'protocol-matrix.json',
    'fixtures:refresh',
    'coverageExclusions',
  ];
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

/**
 * 取行内代码里作为命令前缀的具名环境变量，如 `VERIFY_RUN_ID=<run-id> pnpm check:fast` 的 `VERIFY_RUN_ID`；
 * `NAME` 允许小写字母与连字符，以便把 `SCN-SCENARIO_GATE_CHANGES=...` 这类笔误也识别出来；`==` 比较不算。
 */
function environmentPrefixes(code: string): string[] {
  return [...code.matchAll(/(?:^|[\s(（"'`])([A-Z][A-Za-z0-9_-]{2,})=(?!=)/g)].map(
    (match) => match[1]!,
  );
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

/** 使用指南的结构与机械可核对事实：存在、链接、章节、删除白名单、相对链接、Scenario ID、pnpm 命令与清单字段。 */
async function checkTemplateGuide(
  root: string,
  scripts: Record<string, string>,
  manifest: ProjectManifest,
): Promise<string[]> {
  const errors: string[] = [];
  const guideFile = join(root, guideRelativePath);
  if (!existsSync(guideFile)) return [`missing ${guideRelativePath}`];
  const target = resolve(guideFile);
  if (!linksTo(join(root, 'AGENTS.md'), target))
    errors.push(`AGENTS.md does not link ${guideRelativePath}`);
  if (!linksTo(join(root, 'README.md'), target))
    errors.push(`README.md does not link ${guideRelativePath}`);
  const content = readFileSync(guideFile, 'utf8');
  const headings = new Set(headingsOf(content).map((node) => `${node.depth}:${node.text}`));
  for (const section of guideSections.level2)
    if (!headings.has(`2:${section}`)) errors.push(`missing guide section ## ${section}`);
  for (const section of guideSections.level3)
    if (!headings.has(`3:${section}`)) errors.push(`missing guide section ### ${section}`);
  for (const entry of exampleWhitelistEntries(manifest))
    if (!content.includes(entry)) errors.push(`missing removal whitelist entry ${entry}`);
  for (const url of relativeLinks(content)) {
    if (!existsSync(linkTarget(guideFile, url)))
      errors.push(`broken link ${guideRelativePath} -> ${url}`);
  }
  const config = await loadScenarioConfig(root);
  const registered = new Set<string>();
  for (const document of (await readEffectiveSpecs(root)).documents) {
    for (const match of document.content.matchAll(/^####\s+Scenario:\s+(\S+)/gm))
      registered.add(match[1]!);
  }
  errors.push(
    ...unregisteredScenarioIds(content, guideRelativePath, config.scenarioIdPatterns, registered),
  );
  const architectureFile = join(root, architectureRelativePath);
  if (existsSync(architectureFile))
    errors.push(
      ...unregisteredScenarioIds(
        readFileSync(architectureFile, 'utf8'),
        architectureRelativePath,
        config.scenarioIdPatterns,
        registered,
      ),
    );
  const schema = JSON.parse(readFileSync(projectManifestSchemaUrl, 'utf8')) as unknown;
  const inlineCode: string[] = [];
  visit(markdown(content), 'inlineCode', (node) => {
    inlineCode.push(node.value);
  });
  for (const code of inlineCode) {
    for (const command of pnpmCommands(code))
      if (!pnpmBuiltins.has(command) && !scripts[command])
        errors.push(`unknown pnpm command ${command}`);
    for (const field of manifestFields(code))
      if (!manifestFieldExists(schema, field)) errors.push(`unknown manifest field ${field}`);
    for (const name of environmentPrefixes(code))
      if (!templateEnvironmentNames.has(name)) errors.push(`unknown environment variable ${name}`);
  }
  return errors;
}

/** 只补目录、清单、规则链接与使用指南检查；导入图由 dependency-cruiser 唯一解析。 */
export async function checkArchitecture(
  root: string,
  dependencyExitCode: number,
): Promise<string[]> {
  const errors: string[] = [];
  if (dependencyExitCode !== 0) errors.push('dependency-cruiser failed');
  let manifest: ProjectManifest;
  try {
    manifest = loadProjectManifest(root);
  } catch (error) {
    return [...errors, errorMessage(error)];
  }
  const readManifest = (path: string): Manifest =>
    JSON.parse(readFileSync(join(root, path), 'utf8')) as Manifest;
  const scripts = readManifest('package.json').scripts ?? {};
  for (const command of manifest.requiredCommands)
    if (!scripts[command]) errors.push(`missing command ${command}`);
  const declared = new Set(manifest.packages.map((item) => item.directory));
  for (const name of readdirSync(join(root, 'packages')))
    if (!declared.has(name)) errors.push(`unexpected package ${name}`);
  for (const path of [
    'AGENTS.md',
    ...manifest.packages.map((item) => `packages/${item.directory}/AGENTS.md`),
  ]) {
    const full = join(root, path);
    if (!existsSync(full)) {
      errors.push(`missing ${path}`);
      continue;
    }
    const tree = markdown(readFileSync(full, 'utf8'));
    visit(tree, 'link', (node) => {
      if (/^(https?:|#)/.test(node.url)) return;
      const target = node.url.split('#')[0]!;
      if (!existsSync(resolve(dirname(full), decodeURIComponent(target))))
        errors.push(`broken link ${path} -> ${node.url}`);
    });
  }
  const product = manifest.packages.find((item) => item.role === 'product')!;
  const protocol = manifest.packages.find((item) => item.role === 'protocol')!;
  const test = manifest.packages.find((item) => item.role === 'test')!;
  for (const entry of manifest.packages) {
    const directory = join(root, 'packages', entry.directory);
    if (!existsSync(directory)) {
      errors.push(`missing package directory packages/${entry.directory}`);
      continue;
    }
    const packageManifest = readManifest(`packages/${entry.directory}/package.json`);
    if (packageManifest.name !== entry.name) errors.push(`wrong package name ${entry.directory}`);
    if (entry.role === 'test' && packageManifest.private !== true)
      errors.push(`${entry.directory} must be private`);
    if (Object.keys(packageManifest.exports ?? {}).some((key) => /testing|internal|core/.test(key)))
      errors.push(`private entry exported by ${entry.directory}`);
    for (const child of readdirSync(directory, { withFileTypes: true })) {
      if (child.isDirectory() && !entry.allowedDirectories.includes(child.name))
        errors.push(`unexpected directory packages/${entry.directory}/${child.name}`);
    }
  }
  const protocolManifest = readManifest(`packages/${protocol.directory}/package.json`);
  if (
    Object.keys(protocolManifest.dependencies ?? {}).some((dep) =>
      [product.name, test.name].includes(dep),
    )
  )
    errors.push('protocol cannot depend on SDK/E2E');
  errors.push(...checkSchemaDocumentation(root));
  errors.push(...checkExampleMarkers(root, manifest));
  errors.push(...checkProjectMap(root, manifest));
  errors.push(...(await checkTemplateGuide(root, scripts, manifest)));
  errors.push(...checkArchitectureDoc(root));
  return errors;
}

/** 按清单组装 dependency-cruiser 参数：配置、输出格式与产品包/协议包的模块根目录。 */
export function cruiseArguments(root: string, manifest: ProjectManifest): string[] {
  return [
    '--config',
    resolve(root, '.dependency-cruiser.cjs'),
    '--output-type',
    'err-long',
    ...dependencyRules.cruiseTargets(manifest),
  ];
}

/** 执行 dependency-cruiser；配置文件从当前 cruise 根读取清单。 */
function runCruise(root: string, manifest: ProjectManifest): number {
  const result = spawnSync(
    resolve(root, 'node_modules/.bin/depcruise'),
    cruiseArguments(root, manifest),
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  return result.status ?? 1;
}

export async function runArchitectureCli(argv: ReadonlyArray<string>, cwd = process.cwd()) {
  const rootIndex = argv.indexOf('--root');
  const dependencyIndex = argv.indexOf('--dependency-exit-code');
  const root = rootIndex >= 0 && argv[rootIndex + 1] ? resolve(argv[rootIndex + 1]!) : cwd;
  let dependencyExitCode: number;
  if (dependencyIndex >= 0 && argv[dependencyIndex + 1]) {
    dependencyExitCode = Number(argv[dependencyIndex + 1]);
    if (!Number.isInteger(dependencyExitCode) || dependencyExitCode < 0)
      throw new Error('--dependency-exit-code must be a non-negative integer');
  } else {
    dependencyExitCode = runCruise(root, loadProjectManifest(root));
  }
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
