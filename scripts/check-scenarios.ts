import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readSpecInventory } from './lib/spec-inventory.ts';
import {
  activeChangeNames,
  changeScopeHelp,
  readEffectiveSpecs,
  resolveChangeScope,
} from './lib/spec-sources.ts';
import { buildContractInventory } from './lib/contract-inventory.ts';
import { buildVerificationFingerprints } from './lib/fingerprints.ts';
import { evaluateCoverage, type ScenarioCase } from './lib/scenario-coverage.ts';
import { loadReporterOutputs, scenarioCoverageDefinition } from './lib/scenario-reports.ts';
import { defaultScenarioCommand, runScenarioPrechecks } from './lib/scenario-precheck.ts';

// 拆分后保持既有公共出口：覆盖评估与前置检查由 lib/ 下的模块提供。
export { evaluateCoverage } from './lib/scenario-coverage.ts';
export { loadReporterOutputs, scenarioCoverageDefinition } from './lib/scenario-reports.ts';
export { runScenarioPrechecks } from './lib/scenario-precheck.ts';
import { defaultReportPaths, loadProjectManifest } from './lib/project-manifest.ts';

export type Project = string;
export type VerificationKind = 'behavior' | 'module' | 'engineering';
export type ScenarioCommandResult = Readonly<{
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: unknown;
}>;
export type ScenarioCommand = (
  command: string,
  args: ReadonlyArray<string>,
  options: Readonly<{ cwd: string }>,
) => ScenarioCommandResult;

/** `check:scenarios` 的命令帮助；作用域默认语义见 GATE-12。 */
export const scenariosHelp = [
  'check:scenarios 对账 Scenario/FLOW/协议义务的登记与执行证据。',
  '用法：pnpm check:scenarios [--inventory] [--report <file>...] [--input <file>] [--change <name>[,<name>]] [--help]',
  changeScopeHelp,
].join('\n');

type Cover = Readonly<{ id: string; caseKey: string; checks: ReadonlyArray<string> }>;
export type CaseBinding = Readonly<{
  ownerId: string;
  caseId: string;
  fixtureCase: string | null;
  environment: Project;
  covers: ReadonlyArray<Cover>;
  flowId?: string;
  flowCase?: string;
}>;
export type ExecutionReport = Readonly<{
  runId: string;
  sourceDigest: string;
  specDigest: string;
  protocolDigest: string;
  fixtureDigest: string | null;
  /** 报告记录的摘要文件明细（`path -> sha256`），用于过期说明（GATE-14）。 */
  files?: Readonly<Record<string, string>>;
  project: Project;
  file: string;
  fullName: string;
  caseId: string;
  status: 'passed' | 'failed' | 'skipped';
  assertions: number;
  checkpoints: ReadonlyArray<string>;
  flow?: Readonly<{
    id: string;
    caseKey: string;
    continuityId: string;
    stages: ReadonlyArray<string>;
  }>;
}>;
export type CoverageInput = Readonly<{
  current: Readonly<{
    runId: string;
    sourceDigest: string;
    specDigest: string;
    protocolDigest: string;
    fixtureDigest: string;
    /** 本次运行的摘要文件明细；缺省表示无法比对变化文件。 */
    files?: Readonly<Record<string, string>>;
  }>;
  scenarios: ReadonlyArray<
    Readonly<{ id: string; cases: ReadonlyArray<ScenarioCase>; blockedBy?: ReadonlyArray<string> }>
  >;
  contracts: ReadonlyArray<
    Readonly<{ id: string; cases: ReadonlyArray<string>; requiredIn: ReadonlyArray<string> }>
  >;
  flows: ReadonlyArray<
    Readonly<{
      id: string;
      cases: ReadonlyArray<string>;
      requiredIn: ReadonlyArray<string>;
      requiredStages: ReadonlyArray<string>;
    }>
  >;
  bindings: ReadonlyArray<CaseBinding>;
  reports: ReadonlyArray<ExecutionReport>;
  sourceIssues?: ReadonlyArray<string>;
  baselineIds?: ReadonlyArray<string>;
  reductionReasons?: Readonly<
    Record<
      string,
      Readonly<{
        reason: string;
        reviewId: string;
        sourceDigest: string;
        evidence: ReadonlyArray<string>;
      }>
    >
  >;
}>;

export type ScenarioPrecheckResult = Readonly<{
  issues: ReadonlyArray<string>;
  effective?: Awaited<ReturnType<typeof readEffectiveSpecs>>;
  inventory?: Awaited<ReturnType<typeof readSpecInventory>>;
}>;

export async function runScenariosCli(
  argv: ReadonlyArray<string>,
  root = process.cwd(),
  environment: Readonly<Record<string, string | undefined>> = process.env,
  command: ScenarioCommand = defaultScenarioCommand,
) {
  if (argv.includes('--help') || argv.includes('-h'))
    return {
      output: { mode: 'help', issues: [], help: scenariosHelp },
      exitCode: 0,
    };
  const inputIndex = argv.indexOf('--input');
  if (inputIndex >= 0 && argv[inputIndex + 1]) {
    const input = JSON.parse(
      await readFile(resolve(root, argv[inputIndex + 1]!), 'utf8'),
    ) as CoverageInput;
    const result = evaluateCoverage(input);
    return { output: result, exitCode: Math.min(1, result.issues.length) };
  }
  const resolution = resolveChangeScope({
    argv,
    environment,
    activeChanges: await activeChangeNames(root),
  });
  // 作用域非法时不输出覆盖结论，也不退化为不带作用域运行。
  if (resolution.issues.length > 0)
    return {
      output: {
        mode: argv.includes('--inventory') ? 'inventory' : 'complete',
        issues: [...resolution.issues],
      },
      exitCode: 1,
    };
  const precheck = await runScenarioPrechecks(root, command, {
    ...(resolution.scope.changes === undefined ? {} : { changes: resolution.scope.changes }),
  });
  if (precheck.issues.length > 0) {
    return {
      output: {
        mode: argv.includes('--inventory') ? 'inventory' : 'complete',
        issues: precheck.issues,
        /* c8 ignore next 3 -- a missing OpenSpec tree stops before inventory exists. */
        ...(precheck.inventory
          ? { scenarios: precheck.inventory.scenarios, flows: precheck.inventory.flows }
          : {}),
      },
      exitCode: 1,
    };
  }
  const effective = precheck.effective!;
  const specs = precheck.inventory!;
  const manifest = loadProjectManifest(root);
  const contracts = await buildContractInventory(root);
  const fingerprints = buildVerificationFingerprints(root);
  const reportArguments = argv.flatMap((value, index) =>
    value === '--report' && argv[index + 1] ? [resolve(root, argv[index + 1]!)] : [],
  );
  // 默认报告集合由清单的测试项目派生：unit 类合并为 unit.json，非 perFile 项目各一份
  // <name>.json，perFile 项目取其目录下的全部报告文件（GATE-14）。
  const defaultReports = defaultReportPaths(root, environment.VERIFY_RUN_ID ?? 'local', manifest);
  const loaded = await loadReporterOutputs(
    reportArguments.length > 0 ? reportArguments : defaultReports,
  );
  // 任一报告带 partial 标记时不输出覆盖结论：按需结果不能冒充验收证据（GATE-13）。
  if (loaded.partial.length > 0)
    return {
      output: {
        mode: argv.includes('--inventory') ? 'inventory' : 'complete',
        issues: loaded.issues,
      },
      exitCode: 1,
    };
  const coverage = evaluateCoverage({
    current: { runId: environment.VERIFY_RUN_ID ?? 'local', ...fingerprints },
    scenarios: specs.scenarios.map(scenarioCoverageDefinition),
    contracts: contracts.obligations.map((obligation) => ({
      ...obligation,
      requiredIn: obligation.requiredIn,
    })),
    flows: specs.flows.map((flow) => ({
      id: flow.id,
      cases: flow.cases,
      requiredIn: flow.requiredIn,
      requiredStages: flow.stages
        .split('→')
        .map((stage) => stage.trim())
        .filter(Boolean),
    })),
    bindings: loaded.bindings,
    reports: loaded.reports,
  });
  const output = {
    mode: argv.includes('--inventory') ? 'inventory' : 'complete',
    scenarios: specs.scenarios,
    flows: specs.flows,
    contractFields: contracts.discoveries,
    contracts: contracts.obligations,
    summaries: coverage.summaries,
    issues: [
      ...effective.issues,
      ...specs.issues,
      ...contracts.issues,
      ...loaded.issues,
      ...coverage.issues,
    ],
    digests: fingerprints,
  };
  return { output, exitCode: Math.min(1, output.issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by SCN-SCENARIO-GATE-009. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  void runScenariosCli(process.argv).then((result) => {
    console.log(JSON.stringify(result.output, null, 2));
    process.exitCode = result.exitCode;
  });
/* v8 ignore stop */
