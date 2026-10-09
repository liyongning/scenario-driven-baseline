import { spawnSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfigFromFile } from 'vite';
import { errorMessage, loadProjectManifest, type TestProject } from './lib/project-manifest.ts';
import { changeScopeHelp, parseChangeArguments } from './lib/spec-sources.ts';

/** 一个验收步骤：整项目命令，或 perFile 项目的逐文件运行。 */
export type VerifyStep =
  | Readonly<{ kind: 'command'; name: string; argv: ReadonlyArray<string> }>
  | Readonly<{
      kind: 'per-file';
      name: string;
      runner: ReadonlyArray<string>;
      files: ReadonlyArray<string>;
      prepare?: string;
      reportDirectory: string;
    }>;

export type VerifyOptions = Readonly<{
  runId?: string;
  from?: string;
  changes?: ReadonlyArray<string>;
}>;

export type VerifyContext = Readonly<{ branch: string | null; now: Date }>;

export type VerifyPlan = Readonly<{
  runId: string;
  changeScope?: string;
  steps: ReadonlyArray<VerifyStep>;
  startIndex: number;
}>;

/** 执行一条已组装命令并返回退出码；注入实现让计划与执行分开测试。 */
export type VerifyExecute = (
  argv: ReadonlyArray<string>,
  env: Readonly<Record<string, string>>,
) => number;

export type VerifyOutcome = Readonly<{
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
}>;

export type VerifyResult = Readonly<{
  runId: string;
  outcomes: ReadonlyArray<VerifyOutcome>;
  exitCode: number;
  lines: ReadonlyArray<string>;
  resumeHint?: string;
}>;

export type VerifyCliResult = Readonly<{
  exitCode: number;
  lines: ReadonlyArray<string>;
  issues: ReadonlyArray<string>;
  result?: VerifyResult;
}>;

/** `pnpm verify` 的命令帮助。 */
export const verifyHelp = [
  'verify 依次执行 check:fast、platform 项目的 test:e2e:<name> 与 check:scenarios。',
  '用法：pnpm verify [--run-id <id>] [--from <command>] [--change <name>[,<name>]] [--help]',
  '  --run-id <id>  指定 run id；缺省为 <分支名>-<YYYYMMDDTHHmmssZ>，分支名的 / 替换为 -。',
  '  --from <命令>  从该步骤续跑，跳过此前步骤并复用 run id：check:fast、test:e2e:<平台项目名>、check:scenarios。',
  changeScopeHelp,
].join('\n');

/** UTC 时间戳，形如 `YYYYMMDDTHHmmssZ`。 */
export function formatUtcTimestamp(date: Date): string {
  // 复用内建 ISO 形态（已是 UTC），只去掉分隔符与毫秒。
  return date.toISOString().replace(/[-:]|\.\d{3}/g, '');
}

/** 默认 run id：`<分支名>-<YYYYMMDDTHHmmssZ>`，detached 时分支名部分为 detached。 */
export function defaultRunId(branch: string | null, now: Date): string {
  const name = branch === null || branch === '' || branch === 'HEAD' ? 'detached' : branch;
  return `${name.replace(/\//g, '-')}-${formatUtcTimestamp(now)}`;
}

/** 当前分支名；不是 git 工作区或命令失败时返回 null（按 detached 处理）。 */
export function gitBranch(root: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** perFile 项目的单文件报告名：文件名去掉测试后缀，保持 `<文件名>.json` 形态。 */
export function reportNameForFile(file: string): string {
  return basename(file).replace(/\.(?:spec|test)\.[cm]?[jt]s$/, '');
}

/** 从 Vitest 项目配置读取 include glob：perFile 项目必须显式登记，否则无法逐文件运行。 */
async function projectTestFiles(root: string, project: TestProject): Promise<string[]> {
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false },
    resolve(root, project.config),
    root,
  );
  const test = loaded?.config.test as { root?: string; include?: unknown } | undefined;
  const patterns = (Array.isArray(test?.include) ? test.include : []).filter(
    (pattern): pattern is string => typeof pattern === 'string' && !pattern.startsWith('!'),
  );
  if (patterns.length === 0)
    throw new Error(`${project.name}: Vitest 配置没有可用的 include，无法逐文件运行`);
  const configRoot = test?.root ?? root;
  const files = patterns.flatMap((pattern) =>
    globSync(pattern, { cwd: configRoot, exclude: ['**/node_modules/**'] }),
  );
  return [...new Set(files.map((file) => relative(root, resolve(configRoot, file))))].sort();
}

/** 组装验收计划：check:fast、按清单派生的 platform 步骤、check:scenarios。 */
export async function planVerify(
  root: string,
  options: VerifyOptions,
  context: VerifyContext,
): Promise<VerifyPlan> {
  const manifest = loadProjectManifest(root);
  const runId = options.runId ?? defaultRunId(context.branch, context.now);
  const steps: VerifyStep[] = [
    { kind: 'command', name: 'check:fast', argv: ['pnpm', 'run', 'check:fast'] },
  ];
  for (const project of manifest.testProjects) {
    if (project.class !== 'platform') continue;
    const name = `test:e2e:${project.name}`;
    if (project.perFile) {
      steps.push({
        kind: 'per-file',
        name,
        runner: ['pnpm', 'exec', 'vitest', 'run', '--project', project.name],
        files: await projectTestFiles(root, project),
        ...(project.prepare === undefined ? {} : { prepare: project.prepare }),
        reportDirectory: resolve(root, 'artifacts', runId, 'reports', project.name),
      });
    } else {
      steps.push({ kind: 'command', name, argv: ['pnpm', 'run', name] });
    }
  }
  steps.push({
    kind: 'command',
    name: 'check:scenarios',
    argv: ['pnpm', 'run', 'check:scenarios'],
  });
  const startIndex = options.from === undefined ? 0 : stepIndex(steps, options.from);
  return {
    runId,
    steps,
    startIndex,
    ...(options.changes === undefined || options.changes.length === 0
      ? {}
      : { changeScope: options.changes.join(',') }),
  };
}

function stepIndex(steps: ReadonlyArray<VerifyStep>, from: string): number {
  const index = steps.findIndex((step) => step.name === from);
  if (index < 0)
    throw new Error(
      `--from ${from}: 不是本次验收的步骤（${steps.map((step) => step.name).join('、')}）`,
    );
  return index;
}

/** 续跑判定：报告存在且全部用例通过时跳过该文件。 */
function reportPassed(path: string): boolean {
  try {
    const report = JSON.parse(readFileSync(path, 'utf8')) as {
      tests?: ReadonlyArray<{ status?: string }>;
    };
    return (
      Array.isArray(report.tests) &&
      report.tests.length > 0 &&
      report.tests.every((test) => test.status === 'passed')
    );
  } catch {
    return false;
  }
}

function runStep(
  step: VerifyStep,
  execute: VerifyExecute,
  env: Readonly<Record<string, string>>,
  isResume: boolean,
): number {
  if (step.kind === 'command') return execute(step.argv, env);
  const runPrepare = (): number =>
    step.prepare === undefined ? 0 : execute(['pnpm', 'run', step.prepare], env);
  let skipping = isResume;
  for (const file of step.files) {
    const reportFile = join(step.reportDirectory, `${reportNameForFile(file)}.json`);
    if (skipping && reportPassed(reportFile)) continue;
    skipping = false;
    if (runPrepare() !== 0) return 1;
    let code = execute([...step.runner, file], { ...env, VERIFY_REPORT_FILE: reportFile });
    if (code !== 0) {
      if (runPrepare() !== 0) return 1;
      code = execute([...step.runner, file], { ...env, VERIFY_REPORT_FILE: reportFile });
    }
    if (code !== 0) return code;
  }
  return 0;
}

/** 依序执行计划；任一步失败即停止，后续步骤记为跳过并打印续跑提示。 */
export async function runVerify(
  root: string,
  options: VerifyOptions,
  execute: VerifyExecute,
  context: VerifyContext,
): Promise<VerifyResult> {
  const plan = await planVerify(root, options, context);
  const env: Record<string, string> = { VERIFY_RUN_ID: plan.runId };
  if (plan.changeScope !== undefined) env.SCENARIO_GATE_CHANGES = plan.changeScope;
  const outcomes: VerifyOutcome[] = [];
  let failed: string | undefined;
  for (const [index, step] of plan.steps.entries()) {
    if (index < plan.startIndex || failed !== undefined) {
      outcomes.push({ name: step.name, status: 'skipped', durationMs: 0 });
      continue;
    }
    const started = Date.now();
    const code = runStep(step, execute, env, options.from !== undefined);
    const durationMs = Date.now() - started;
    if (code === 0) {
      outcomes.push({ name: step.name, status: 'passed', durationMs });
      continue;
    }
    failed = step.name;
    outcomes.push({ name: step.name, status: 'failed', durationMs });
  }
  const lines = outcomes.map(
    (outcome) =>
      `${outcome.name}：${
        outcome.status === 'passed' ? '通过' : outcome.status === 'failed' ? '失败' : '跳过'
      }（${outcome.durationMs}ms）`,
  );
  return {
    runId: plan.runId,
    outcomes,
    exitCode: failed === undefined ? 0 : 1,
    lines,
    ...(failed === undefined
      ? {}
      : {
          resumeHint: `续跑：pnpm verify --from ${failed} --run-id ${plan.runId}${
            plan.changeScope === undefined ? '' : ` --change ${plan.changeScope}`
          }`,
        }),
  };
}

type ParsedVerifyArguments = Readonly<{
  options: VerifyOptions;
  issues: ReadonlyArray<string>;
  help: boolean;
}>;

function parseVerifyArguments(argv: ReadonlyArray<string>): ParsedVerifyArguments {
  const issues: string[] = [];
  let runId: string | undefined;
  let from: string | undefined;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (argument === '--run-id' || argument === '--from') {
      const value = argv[index + 1];
      index += 1;
      if (value === undefined || value === '' || value.startsWith('-')) {
        issues.push(`${argument} 需要取值`);
        continue;
      }
      if (argument === '--run-id') runId = value;
      else from = value;
      continue;
    }
    if (argument === '--change') {
      index += 1;
      continue;
    }
    issues.push(`未知参数 ${argument}`);
  }
  const changes = parseChangeArguments(argv);
  issues.push(...changes.issues);
  return {
    help,
    issues,
    options: {
      ...(runId === undefined ? {} : { runId }),
      ...(from === undefined ? {} : { from }),
      ...(changes.specified ? { changes: [...new Set(changes.names)] } : {}),
    },
  };
}

/** CLI 入口：解析参数、组装计划、执行并给出各步结论。 */
export async function runVerifyCli(
  argv: ReadonlyArray<string>,
  root: string,
  execute: VerifyExecute,
  now: Date = new Date(),
): Promise<VerifyCliResult> {
  const parsed = parseVerifyArguments(argv);
  if (parsed.help) return { exitCode: 0, lines: [verifyHelp], issues: [] };
  if (parsed.issues.length > 0) return { exitCode: 1, lines: parsed.issues, issues: parsed.issues };
  let result: VerifyResult;
  try {
    result = await runVerify(root, parsed.options, execute, { branch: gitBranch(root), now });
  } catch (error) {
    const message = errorMessage(error);
    return { exitCode: 1, lines: [message], issues: [message] };
  }
  return {
    exitCode: result.exitCode,
    lines: [...result.lines, ...(result.resumeHint === undefined ? [] : [result.resumeHint])],
    issues: [],
    result,
  };
}

/* v8 ignore start -- 真实子进程执行与 CLI 分支由工程门禁（pnpm verify 与 tooling 用例）承担。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const execute: VerifyExecute = (argv, env) => {
    const [command, ...args] = argv;
    if (command === undefined) return 1;
    const result = spawnSync(command, [...args], {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    return result.status ?? 1;
  };
  void runVerifyCli(process.argv.slice(2), process.cwd(), execute).then((cli) => {
    for (const line of cli.lines) console.log(line);
    process.exitCode = cli.exitCode;
  });
}
/* v8 ignore stop */
