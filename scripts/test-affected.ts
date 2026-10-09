import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { collectFiles } from './lib/fingerprints.ts';
import {
  errorMessage,
  loadProjectManifest,
  packageByRole,
  projectManifestFile,
  testProjectsByClass,
  type ProjectManifest,
} from './lib/project-manifest.ts';
import { loadScenarioConfig } from './lib/scenario-config.ts';
import { readSpecInventory } from './lib/spec-inventory.ts';
import {
  findOwnerRequirement,
  projectEffectiveSpecs,
  requirementDigest,
} from './lib/spec-sources.ts';
import type { PlannedCommand } from './run-by-manifest.ts';

/** `test:affected` 的命令帮助；全量触发与选择顺序见 GATE-13。 */
export const affectedHelp = [
  'test:affected 选择受改动影响的用例并按需运行，报告带 partial 标记。',
  '用法：pnpm test:affected [--base <ref>] [--scenario <ID...>] [--dry-run] [--help]',
  '  --base <ref>     比较工作区与该引用的差异（默认 HEAD）',
  '  --scenario <ID>  直接指定场景或 FLOW，可重复或一次给多个',
  '  --dry-run        只打印计划，不运行任何用例',
].join('\n');

/** 仓库根由脚本位置推导：受控根中的副本仍使用仓库自己的分析工具。 */
const toolRoot = resolve(import.meta.dirname, '..');
const depcruiseBin = resolve(toolRoot, 'node_modules/.bin/depcruise');

/** 一条可执行的分析命令：命令、参数与工作目录。 */
export type AnalysisRunner = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
) => Readonly<{ status: number | null; stdout?: string | null; stderr?: string | null }>;

const defaultAnalysisRunner: AnalysisRunner = (command, args, cwd) => {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** 静态提取的一条 `defineCase` 绑定：文件、owner、case、环境与全部 cover ID。 */
export type StaticBinding = Readonly<{
  file: string;
  ownerId: string;
  caseId: string;
  environment: string;
  covers: ReadonlyArray<string>;
  flowId?: string;
}>;

export type AffectedOptions = Readonly<{
  base: string;
  scenarios: ReadonlyArray<string>;
  runId: string;
  analyze?: (
    root: string,
    manifest: ProjectManifest,
    changed: ReadonlyArray<string>,
  ) => ReadonlyArray<string>;
}>;

export type AffectedSelection = Readonly<{ id: string; reason: string }>;
export type AffectedTestFile = Readonly<{
  project: string;
  className: string;
  file: string;
}>;
export type AffectedPlan = Readonly<{
  runId: string;
  base: string;
  changed: ReadonlyArray<string>;
  full?: Readonly<{ command: 'check:fast'; reasons: ReadonlyArray<string> }>;
  selections: ReadonlyArray<AffectedSelection>;
  files: ReadonlyArray<AffectedTestFile>;
  related: ReadonlyArray<string>;
  commands: ReadonlyArray<PlannedCommand>;
}>;

/** 按需运行的 run id：`affected-<UTC YYYYMMDDTHHmmssZ>`（GATE-13）。 */
export function affectedRunId(now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  return `affected-${stamp}`;
}

/** 解析命令行；`--scenario` 的值持续到下一个选项。 */
export function parseAffectedArguments(argv: ReadonlyArray<string>): Readonly<{
  help: boolean;
  dryRun: boolean;
  base: string;
  scenarios: ReadonlyArray<string>;
  issues: ReadonlyArray<string>;
}> {
  const issues: string[] = [];
  let help = false;
  let dryRun = false;
  let base = 'HEAD';
  const scenarios: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === '--help' || value === '-h') help = true;
    else if (value === '--dry-run') dryRun = true;
    else if (value === '--base') {
      const raw = argv[index + 1];
      if (raw === undefined || raw.startsWith('-')) {
        issues.push('--base 需要引用名，不能没有值或为空');
        continue;
      }
      index += 1;
      base = raw;
    } else if (value === '--scenario') {
      let consumed = 0;
      while (index + 1 < argv.length && !argv[index + 1]!.startsWith('-')) {
        scenarios.push(argv[index + 1]!);
        index += 1;
        consumed += 1;
      }
      if (consumed === 0) issues.push('--scenario 需要至少一个 ID');
    } else issues.push(`未知参数 ${value}`);
  }
  return { help, dryRun, base, scenarios, issues };
}

/** 工作区相对 `base` 的改动文件：已跟踪文件的差异与未跟踪的新文件。 */
export function changedFilesSince(root: string, base: string): string[] {
  const run = (args: ReadonlyArray<string>): string =>
    execFileSync('git', [...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  const tracked = run(['diff', '--name-only', base, '--']);
  const untracked = run(['ls-files', '--others', '--exclude-standard']);
  const files = [...tracked.split('\n'), ...untracked.split('\n')].filter(
    (path) => path.length > 0,
  );
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

const matchesAny = (path: string, patterns: ReadonlyArray<string>): boolean =>
  patterns.some((pattern) => matchesGlob(path, pattern));

/**
 * 全量触发（GATE-13 第 1 条）：命中清单、协议来源、工具配置、构建输入、
 * 平台适配目录、宿主目录或驱动目录时退化为全量 `check:fast`。
 */
export function fullTriggers(
  manifest: ProjectManifest,
  changed: ReadonlyArray<string>,
  testDirectory: string,
): string[] {
  const toolConfig =
    /(^|\/)(?:vitest\.config[^/]*\.ts|vitest\.shared\.ts|\.dependency-cruiser\.cjs|eslint\.config\.js)$/;
  const reasons: string[] = [];
  for (const path of changed) {
    if (path === projectManifestFile) reasons.push(`${path} 是清单文件（全量触发）`);
    else if (matchesAny(path, manifest.fingerprints.protocolInputs))
      reasons.push(`${path} 命中协议来源输入（全量触发）`);
    else if (toolConfig.test(path)) reasons.push(`${path} 是工具配置（全量触发）`);
    else if (matchesAny(path, manifest.fingerprints.buildInputs))
      reasons.push(`${path} 命中构建输入（全量触发）`);
    else if (path.includes('/adapters/network/'))
      reasons.push(`${path} 在平台适配目录（全量触发）`);
    else if (path.startsWith(`${testDirectory}/host/`))
      reasons.push(`${path} 在宿主目录（全量触发）`);
    else if (path.startsWith(`${testDirectory}/src/drivers/`))
      reasons.push(`${path} 在驱动目录（全量触发）`);
  }
  return reasons;
}

/** 按 `spec-sources` 的同一分块规则切出 Requirement 块（用于比较 base 与工作区）。 */
export function requirementBlocks(content: string): ReadonlyArray<{ id: string; block: string }> {
  const lines = content.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^### Requirement:\s+/.test(line)) starts.push(index);
  });
  return starts.map((start, index) => {
    let end = starts[index + 1] ?? lines.length;
    for (let cursor = start + 1; cursor < end; cursor += 1)
      if (/^#{1,2}\s/.test(lines[cursor]!)) {
        end = cursor;
        break;
      }
    return {
      id: lines[start]!.replace(/^### Requirement:\s+/, '')
        .trim()
        .split(/\s+/, 1)[0]!,
      block: lines.slice(start, end).join('\n').trimEnd(),
    };
  });
}

const specPathPattern = /^openspec\/(?:specs\/.*\/spec\.md|changes\/[^/]+\/specs\/.*\/spec\.md)$/;

function fileAtBase(root: string, base: string, path: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${base}:${path}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

/** Requirement 块摘要（与 GATE-10 相同的规范化算法）变化的 Requirement ID。 */
export function changedRequirements(
  root: string,
  base: string,
  changed: ReadonlyArray<string>,
): string[] {
  const ids = new Set<string>();
  for (const path of changed.filter((item) => specPathPattern.test(item))) {
    const atBase = fileAtBase(root, base, path);
    const inWorktree = existsSync(join(root, path))
      ? readFileSync(join(root, path), 'utf8')
      : undefined;
    const digests = (content: string | undefined) =>
      new Map(
        requirementBlocks(content ?? '').map(
          (item) => [item.id, requirementDigest(item.block)] as const,
        ),
      );
    const before = digests(atBase);
    const after = digests(inWorktree);
    for (const [id, digest] of after) if (before.get(id) !== digest) ids.add(id);
    for (const id of before.keys()) if (!after.has(id)) ids.add(id);
  }
  return [...ids].sort();
}

/** 由变化的 Requirement 选出其下全部 Scenario 与 FLOW。 */
async function specSelections(
  root: string,
  manifest: ProjectManifest,
  base: string,
  changed: ReadonlyArray<string>,
): Promise<AffectedSelection[]> {
  const requirements = changedRequirements(root, base, changed);
  if (requirements.length === 0) return [];
  const projection = await projectEffectiveSpecs(root);
  const config = await loadScenarioConfig(root);
  const inventory = await readSpecInventory(
    projection.requirements.map((item) => ({
      ...item.source,
      path: `${item.source.path}#${item.id}`,
      content: item.block,
    })),
    config,
    manifest.testProjects,
  );
  const selections: AffectedSelection[] = [];
  for (const scenario of inventory.scenarios) {
    const requirement = scenario.source.slice(scenario.source.lastIndexOf('#') + 1);
    if (requirements.includes(requirement))
      selections.push({ id: scenario.id, reason: `Requirement ${requirement} 摘要变化` });
  }
  for (const flow of inventory.flows) {
    // readSpecInventory 只从 Requirement 正文的 FLOW 行产出 flow，owner 必然存在。
    const owner = findOwnerRequirement(projection.requirements, flow.id)!;
    if (requirements.includes(owner.id))
      selections.push({ id: flow.id, reason: `Requirement ${owner.id} 摘要变化` });
  }
  return selections;
}

/** Fixture 改动：目录名即 owner ID（GATE-13 第 3 条）。 */
export function fixtureSelections(
  changed: ReadonlyArray<string>,
  testDirectory: string,
): AffectedSelection[] {
  const prefix = `${testDirectory}/tests/fixtures/`;
  const selections: AffectedSelection[] = [];
  for (const path of changed) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const [owner, ...tail] = rest.split('/');
    if (!owner || tail.length === 0 || !/^(?:SCN|FLOW)-/.test(owner)) continue;
    selections.push({ id: owner, reason: `Fixture ${owner} 目录下的文件变化` });
  }
  return selections;
}

/** 只供分析的 tsconfig：把清单里的包名映射到各自的 `src` 入口（不参与构建与测试）。 */
export function analysisTsconfig(root: string, manifest: ProjectManifest): string {
  const paths: Record<string, string[]> = {};
  // 包目录相对仓库的 packages 根；路径映射只用于分析，不改变构建与测试的模块解析。
  for (const item of manifest.packages)
    paths[item.name] = [`packages/${item.directory}/src/index.ts`];
  return `${JSON.stringify(
    {
      compilerOptions: { baseUrl: root, paths },
      include: manifest.fingerprints.sourceRoots.map((source) => `${root}/${source}/**/*.ts`),
    },
    null,
    2,
  )}\n`;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 用 dependency-cruiser 的 `--reaches` 求出"能到达改动文件"的测试文件：
 * 经包名（package exports 指向 dist）导入的 integration 与平台用例也能被找到。
 */
export function reachedTestFiles(
  root: string,
  manifest: ProjectManifest,
  changed: ReadonlyArray<string>,
  run: AnalysisRunner = defaultAnalysisRunner,
): string[] {
  const code = changed.filter(
    (path) => /\.(?:ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(path) && !path.endsWith('.d.ts'),
  );
  const directories = manifest.fingerprints.sourceRoots.filter((source) =>
    existsSync(join(root, source)),
  );
  if (code.length === 0 || directories.length === 0) return [];
  const directory = mkdtempSync(join(tmpdir(), 'affected-analysis-'));
  try {
    const tsconfig = join(directory, 'tsconfig.analysis.json');
    const config = join(directory, 'dependency-cruiser.cjs');
    writeFileSync(tsconfig, analysisTsconfig(root, manifest));
    writeFileSync(
      config,
      `module.exports = ${JSON.stringify({
        forbidden: [],
        options: {
          doNotFollow: { path: ['node_modules'] },
          tsConfig: { fileName: tsconfig },
        },
      })};\n`,
    );
    const result = run(
      depcruiseBin,
      [...directories, '--reaches', code.map(escapeRegExp).join('|'), '-T', 'json', '-c', config],
      root,
    );
    if (result.status !== 0)
      throw new Error(
        `dependency-cruiser 分析失败：退出码 ${String(result.status)}：${result.stderr ?? '（无 stderr）'}`,
      );
    const parsed = JSON.parse(result.stdout ?? '{}') as {
      modules?: ReadonlyArray<{ source: string }>;
    };
    return [...new Set((parsed.modules ?? []).map((module) => module.source))]
      .filter((path) => /\.(?:test|spec)\.ts$/.test(path))
      .sort((left, right) => left.localeCompare(right));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** 静态提取一段源码里全部 `defineCase` 绑定的 owner、case、环境与 cover ID。 */
export function extractCaseBindings(file: string, source: string): StaticBinding[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const bindings: StaticBinding[] = [];
  const text = (node: ts.Node | undefined): string | undefined =>
    node && ts.isStringLiteralLike(node) ? node.text : undefined;
  const propertyName = (name: ts.PropertyName): string | undefined =>
    ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineCase'
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        const properties = new Map<string, ts.Expression>();
        for (const property of argument.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = propertyName(property.name);
          if (name !== undefined) properties.set(name, property.initializer);
        }
        const ownerId = text(properties.get('ownerId'));
        const caseId = text(properties.get('caseId'));
        const environment = text(properties.get('environment'));
        const flowId = text(properties.get('flowId'));
        if (ownerId && caseId && environment) {
          const covers: string[] = [];
          const coversNode = properties.get('covers');
          if (coversNode && ts.isArrayLiteralExpression(coversNode))
            for (const element of coversNode.elements)
              if (ts.isObjectLiteralExpression(element))
                for (const entry of element.properties)
                  if (ts.isPropertyAssignment(entry) && propertyName(entry.name) === 'id') {
                    const id = text(entry.initializer);
                    if (id) covers.push(id);
                  }
          bindings.push({
            file,
            ownerId,
            caseId,
            environment,
            covers,
            ...(flowId === undefined ? {} : { flowId }),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return bindings;
}

/** 扫描测试包 `tests/` 下全部 spec 的绑定；扩展选择与代码选择共用这份台账。 */
export function scanCaseBindings(root: string, manifest: ProjectManifest): StaticBinding[] {
  const testDirectory = `packages/${packageByRole(manifest, 'test').directory}`;
  const files = collectFiles(resolve(root, testDirectory, 'tests'), (path) =>
    path.endsWith('.spec.ts'),
  ).sort();
  return files.flatMap((path) =>
    extractCaseBindings(relative(root, path), readFileSync(path, 'utf8')),
  );
}

/** 由选中的 ID 扩展到绑定它们的全部测试文件，覆盖其登记的全部环境。 */
export function expandSelections(
  manifest: ProjectManifest,
  bindings: ReadonlyArray<StaticBinding>,
  ids: ReadonlyArray<string>,
): AffectedTestFile[] {
  const wanted = new Set(ids);
  const files = new Map<string, AffectedTestFile>();
  for (const binding of bindings) {
    const bound = [binding.ownerId, ...binding.covers, ...(binding.flowId ? [binding.flowId] : [])];
    if (!bound.some((id) => wanted.has(id))) continue;
    const project = manifest.testProjects.find((item) => item.name === binding.environment);
    if (!project) continue;
    files.set(`${binding.environment}\0${binding.file}`, {
      project: project.name,
      className: project.class,
      file: binding.file,
    });
  }
  return [...files.values()].sort(
    (left, right) =>
      left.project.localeCompare(right.project) || left.file.localeCompare(right.file),
  );
}

const buildRoles = new Set(['product', 'protocol']);

/** 组装按需运行的命令：先构建（改动落在产品/协议包 src）、再 unit related、再逐文件用例。 */
export function affectedCommands(
  root: string,
  manifest: ProjectManifest,
  plan: Readonly<{
    runId: string;
    files: ReadonlyArray<AffectedTestFile>;
    related: ReadonlyArray<string>;
    build: boolean;
  }>,
): PlannedCommand[] {
  const commands: PlannedCommand[] = [];
  if (plan.build) commands.push({ command: 'pnpm', args: ['build'] });
  const unitProjects = testProjectsByClass(manifest, ['unit']);
  if (plan.related.length > 0 && unitProjects.length > 0)
    commands.push({
      command: 'vitest',
      args: ['related', ...plan.related, '--project', ...unitProjects, '--run'],
      env: {
        VERIFY_RUN_ID: plan.runId,
        TEST_AFFECTED_PARTIAL: '1',
        VERIFY_REPORT_FILE: reportPath(root, plan.runId, 'unit'),
      },
    });
  for (const file of plan.files)
    commands.push({
      command: 'vitest',
      args: ['run', '--project', file.project, file.file],
      env: {
        VERIFY_RUN_ID: plan.runId,
        TEST_AFFECTED_PARTIAL: '1',
        VERIFY_REPORT_FILE: reportPath(root, plan.runId, reportFor(file)),
      },
    });
  return commands;
}

/** 报告名沿用清单约定：unit 类项目合并为 unit，其余项目各一份同名报告。 */
function reportFor(file: AffectedTestFile): string {
  return file.className === 'unit' ? 'unit' : file.project;
}

function reportPath(root: string, runId: string, name: string): string {
  return resolve(root, 'artifacts', runId, 'reports', `${name}.json`);
}

/** 计算按需运行的完整计划；不执行任何用例。 */
export async function planAffected(root: string, options: AffectedOptions): Promise<AffectedPlan> {
  const manifest = loadProjectManifest(root);
  const testDirectory = `packages/${packageByRole(manifest, 'test').directory}`;
  const changed = changedFilesSince(root, options.base);
  const reasons = fullTriggers(manifest, changed, testDirectory);
  if (reasons.length > 0)
    return {
      runId: options.runId,
      base: options.base,
      changed,
      full: { command: 'check:fast', reasons },
      selections: [],
      files: [],
      related: [],
      commands: [{ command: 'pnpm', args: ['check:fast'] }],
    };
  const analyze = options.analyze ?? reachedTestFiles;
  const reached = analyze(root, manifest, changed);
  const bindings = scanCaseBindings(root, manifest);
  const selections: AffectedSelection[] = [
    ...(await specSelections(root, manifest, options.base, changed)),
    ...fixtureSelections(changed, testDirectory),
    ...options.scenarios.map((id) => ({ id, reason: '--scenario 直接指定' })),
  ];
  // 同一 ID 被多条规则选中时把原因并列，便于打印后核对每条选择依据。
  const byId = new Map<string, AffectedSelection>();
  const add = (id: string, reason: string) => {
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, reason });
      return;
    }
    if (!existing.reason.split('；').includes(reason))
      byId.set(id, { id, reason: `${existing.reason}；${reason}` });
  };
  for (const item of selections) add(item.id, item.reason);
  for (const file of reached)
    for (const binding of bindings.filter((item) => item.file === file)) {
      const ids = [binding.ownerId, ...binding.covers, ...(binding.flowId ? [binding.flowId] : [])];
      for (const id of ids) add(id, `代码改动经依赖分析到达 ${file}`);
    }
  const ordered = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
  const files = expandSelections(
    manifest,
    bindings,
    ordered.map((item) => item.id),
  );
  // 改动落在产品包或协议包 src 时先构建产物，保证用例测的是新代码（GATE-13 第 4 条）。
  const build = changed.some((path) =>
    manifest.packages.some(
      (item) => buildRoles.has(item.role) && path.startsWith(`packages/${item.directory}/src/`),
    ),
  );
  const related = changed.filter((path) => /\.(?:ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(path));
  return {
    runId: options.runId,
    base: options.base,
    changed,
    selections: ordered,
    files,
    related,
    commands: affectedCommands(root, manifest, { runId: options.runId, files, related, build }),
  };
}

/** 打印计划：全量触发原因、选中 ID、原因、测试文件与将执行的步骤。 */
export function formatAffectedPlan(plan: AffectedPlan): string {
  const lines = [`test:affected 计划（run id ${plan.runId}，基线 ${plan.base}）`];
  lines.push(`改动文件（${plan.changed.length}）：`);
  for (const path of plan.changed) lines.push(`  ${path}`);
  if (plan.full) {
    lines.push('全量触发：pnpm check:fast');
    lines.push('触发原因：');
    for (const reason of plan.full.reasons) lines.push(`  ${reason}`);
    return lines.join('\n');
  }
  lines.push(`选中 ID（${plan.selections.length}）：`);
  for (const item of plan.selections) lines.push(`  ${item.id}  原因：${item.reason}`);
  lines.push(`测试文件（${plan.files.length}）：`);
  for (const file of plan.files) lines.push(`  ${file.project}[${file.className}] ${file.file}`);
  lines.push(`vitest related 改动文件（${plan.related.length}）：`);
  for (const file of plan.related) lines.push(`  ${file}`);
  lines.push(`步骤（${plan.commands.length}）：`);
  plan.commands.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${[step.command, ...step.args].join(' ')}`);
  });
  return lines.join('\n');
}

/** 执行一步：继承标准输出，非零退出即停止。 */
export function spawnAffectedStep(step: PlannedCommand): number {
  const result = spawnSync(step.command, [...step.args], {
    stdio: 'inherit',
    env: { ...process.env, ...step.env },
  });
  return result.status ?? 1;
}

/** CLI：解析参数、打印计划，非 `--dry-run` 时执行计划并透传退出码。 */
export async function runAffectedCli(
  argv: ReadonlyArray<string>,
  root = process.cwd(),
  execute: (step: PlannedCommand) => number = spawnAffectedStep,
): Promise<Readonly<{ output: string; exitCode: number }>> {
  const parsed = parseAffectedArguments(argv);
  if (parsed.help) return { output: affectedHelp, exitCode: 0 };
  if (parsed.issues.length > 0)
    return { output: `${parsed.issues.join('\n')}\n${affectedHelp}`, exitCode: 1 };
  let plan: AffectedPlan;
  try {
    plan = await planAffected(root, {
      base: parsed.base,
      scenarios: parsed.scenarios,
      runId: affectedRunId(),
    });
  } catch (error) {
    return { output: `test:affected 无法计算计划：${errorMessage(error)}`, exitCode: 1 };
  }
  const output = formatAffectedPlan(plan);
  if (parsed.dryRun) return { output, exitCode: 0 };
  for (const step of plan.commands) {
    const code = execute(step);
    if (code !== 0) return { output, exitCode: code };
  }
  return { output, exitCode: 0 };
}

/* v8 ignore start -- 真实 CLI 分支由 SCN-SCENARIO-GATE-020/021/022 的工程用例执行。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  void runAffectedCli(process.argv.slice(2)).then((result) => {
    console.log(result.output);
    process.exitCode = result.exitCode;
  });
/* v8 ignore stop */
