import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  errorMessage,
  loadProjectManifest,
  packageByRole,
  testProjectsByClass,
  type ProjectManifest,
} from './lib/project-manifest.ts';
import { expandSelections, scanCaseBindings } from './lib/affected-bindings.ts';
import { fixtureSelections, fullTriggers } from './lib/affected-triggers.ts';
import { specSelections } from './lib/affected-spec.ts';
import { reachedTestFiles } from './lib/affected-analysis.ts';
import type { PlannedCommand } from './run-by-manifest.ts';
import type { AffectedSelection, AffectedTestFile } from './lib/affected-types.ts';

// 拆分后保持既有公共出口：这些能力由 lib/ 下的按需运行模块提供。
export { analysisTsconfig, reachedTestFiles } from './lib/affected-analysis.ts';
export {
  expandSelections,
  extractCaseBindings,
  scanCaseBindings,
} from './lib/affected-bindings.ts';
export { fixtureSelections, fullTriggers } from './lib/affected-triggers.ts';
export { changedRequirements } from './lib/affected-spec.ts';
export type { AffectedSelection, AffectedTestFile } from './lib/affected-types.ts';
export type { StaticBinding } from './lib/affected-bindings.ts';

/** `test:affected` 的命令帮助；全量触发与选择顺序见 GATE-13。 */
export const affectedHelp = [
  'test:affected 选择受改动影响的用例并按需运行，报告带 partial 标记。',
  '用法：pnpm test:affected [--base <ref>] [--scenario <ID...>] [--dry-run] [--help]',
  '  --base <ref>     比较工作区与该引用的差异（默认 HEAD）',
  '  --scenario <ID>  直接指定场景或 FLOW，可重复或一次给多个',
  '  --dry-run        只打印计划，不运行任何用例',
].join('\n');

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
      // 每个项目各带一个 `--project`：Vitest 的该选项只接受一个值，空格分隔的其余项目名会被当成路径过滤器。
      args: [
        'related',
        ...plan.related,
        ...unitProjects.flatMap((name) => ['--project', name]),
        '--run',
      ],
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
