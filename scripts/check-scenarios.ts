import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readSpecInventory } from './lib/spec-inventory.ts';
import { readEffectiveSpecs } from './lib/spec-sources.ts';
import { loadScenarioConfig, validateScenarioConfig } from './lib/scenario-config.ts';
import { buildContractInventory } from './lib/contract-inventory.ts';
import { buildVerificationFingerprints } from './lib/fingerprints.ts';
import { errorMessage, loadProjectManifest, type TestProject } from './lib/project-manifest.ts';

export type Project = string;
export type VerificationKind = 'behavior' | 'module' | 'engineering';
export type ScenarioCommandResult = Readonly<{ status: number | null; stdout?: string; stderr?: string; error?: unknown }>;
export type ScenarioCommand = (command: string, args: ReadonlyArray<string>, options: Readonly<{ cwd: string }>) => ScenarioCommandResult;

const defaultScenarioCommand: ScenarioCommand = (command, args, options) => {
  const result = spawnSync(command, [...args], { cwd: options.cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error };
};
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
  idlDigest: string;
  fixtureDigest: string | null;
  project: Project;
  file: string;
  fullName: string;
  caseId: string;
  status: 'passed' | 'failed' | 'skipped';
  assertions: number;
  checkpoints: ReadonlyArray<string>;
  flow?: Readonly<{ id: string; caseKey: string; continuityId: string; stages: ReadonlyArray<string> }>;
}>;
type ScenarioCase = Readonly<{
  key: string;
  kind: VerificationKind;
  requiredIn: ReadonlyArray<Project>;
  checks: ReadonlyArray<string>;
}>;
export type CoverageInput = Readonly<{
  current: Readonly<{ runId: string; sourceDigest: string; specDigest: string; idlDigest: string; fixtureDigest: string }>;
  scenarios: ReadonlyArray<Readonly<{ id: string; cases: ReadonlyArray<ScenarioCase>; blockedBy?: ReadonlyArray<string> }>>;
  contracts: ReadonlyArray<Readonly<{ id: string; cases: ReadonlyArray<string>; requiredIn: ReadonlyArray<string> }>>;
  flows: ReadonlyArray<Readonly<{ id: string; cases: ReadonlyArray<string>; requiredIn: ReadonlyArray<string>; requiredStages: ReadonlyArray<string> }>>;
  bindings: ReadonlyArray<CaseBinding>;
  reports: ReadonlyArray<ExecutionReport>;
  sourceIssues?: ReadonlyArray<string>;
  baselineIds?: ReadonlyArray<string>;
  reductionReasons?: Readonly<Record<string, Readonly<{
    reason: string;
    reviewId: string;
    sourceDigest: string;
    evidence: ReadonlyArray<string>;
  }>>>;
}>;

export type ScenarioPrecheckResult = Readonly<{
  issues: ReadonlyArray<string>;
  effective?: Awaited<ReturnType<typeof readEffectiveSpecs>>;
  inventory?: Awaited<ReturnType<typeof readSpecInventory>>;
}>;

/** 读取门禁根目录的测试项目；清单缺失或非法时记录 precheck 问题并降级为空集合。 */
async function loadPrecheckProjects(root: string, issues: string[]): Promise<ReadonlyArray<TestProject>> {
  try {
    return loadProjectManifest(root).testProjects;
  } catch (error) {
    issues.push(`precheck: ${errorMessage(error)}`);
    return [];
  }
}

/**
 * Run the repository and effective-Spec checks in their contractual order.
 * Report loading is deliberately outside this function so a failed precheck
 * cannot accidentally produce a coverage conclusion from stale reports.
 */
export async function runScenarioPrechecks(
  root: string,
  command: ScenarioCommand = defaultScenarioCommand,
): Promise<ScenarioPrecheckResult> {
  const issues: string[] = [];
  const specsDirectory = resolve(root, 'openspec/specs');
  const specsPresent = (() => {
    try { return statSync(specsDirectory).isDirectory(); } catch { return false; }
  })();
  if (!specsPresent) issues.push('precheck: openspec/specs directory is missing');

  let cliAvailable = false;
  try {
    const result = command('openspec', ['--version'], { cwd: root });
    cliAvailable = result.status === 0;
  } catch (error) {
    issues.push(`precheck: openspec CLI cannot be invoked: ${String(error)}`);
  }
  if (!cliAvailable && !issues.some(issue => issue.startsWith('precheck: openspec CLI cannot be invoked'))) {
    issues.push('precheck: openspec CLI cannot be invoked');
  }
  if (issues.length > 0) return { issues };

  const effective = await readEffectiveSpecs(root);
  let config;
  try {
    config = await loadScenarioConfig(root);
  } catch (error) {
    issues.push(`precheck: ${String(error)}`);
    return { issues };
  }
  const configIssues = validateScenarioConfig(config);
  if (configIssues.length > 0) issues.push(...configIssues.map(issue => `precheck: ${issue}`));
  const projects = await loadPrecheckProjects(root, issues);
  const inventory = await readSpecInventory(effective.documents, config, projects);

  // Keep diagnostics deterministic and aligned with the gate contract:
  // identity checks, FLOW placement/rows, then verification metadata.
  const idIssues: string[] = [];
  const flowIssues: string[] = [];
  const verificationIssues: string[] = [];
  const otherIssues: string[] = [];
  for (const issue of [...effective.issues, ...inventory.issues]) {
    if (/Scenario ID|Scenario heading|duplicate Scenario ID|duplicate FLOW ID|invalid FLOW ID/.test(issue)) idIssues.push(issue);
    else if (/FLOW (?:table|row)|invalid FLOW row/.test(issue)) flowIssues.push(issue);
    else if (/verification/.test(issue)) verificationIssues.push(issue);
    else otherIssues.push(issue);
  }
  issues.push(...idIssues, ...flowIssues, ...verificationIssues, ...otherIssues);
  return { issues, effective, inventory };
}

type ReporterOutput = Readonly<{
  runId: string;
  sourceDigest: string;
  specDigest: string;
  idlDigest: string;
  fixtureDigest: string;
  tests: ReadonlyArray<ExecutionReport & Readonly<{ binding?: CaseBinding }>>;
}>;

export function scenarioCoverageDefinition(scenario: Readonly<{
  id: string;
  verification?: Readonly<{ cases: ReadonlyArray<ScenarioCase>; blockedBy: ReadonlyArray<string> }>;
}>) {
  return {
    id: scenario.id,
    cases: scenario.verification ? scenario.verification.cases : [],
    blockedBy: scenario.verification ? scenario.verification.blockedBy : [],
  };
}

export async function loadReporterOutputs(paths: ReadonlyArray<string>) {
  const bindings: CaseBinding[] = [];
  const reports: ExecutionReport[] = [];
  const issues: string[] = [];
  for (const path of paths) {
    let output: ReporterOutput;
    try { output = JSON.parse(await readFile(path, 'utf8')) as ReporterOutput; }
    catch (error) { issues.push(`${path}: reporter output cannot be read: ${String(error)}`); continue; }
    if (!Array.isArray(output.tests)) { issues.push(`${path}: reporter output has no tests array`); continue; }
    for (const test of output.tests) {
      if (!test.binding) { issues.push(`${path}/${test.caseId}: missing paymentCase binding`); continue; }
      if (test.project !== test.binding.environment) issues.push(`${path}/${test.caseId}: report project does not match binding environment`);
      for (const key of ['runId', 'sourceDigest', 'specDigest', 'idlDigest'] as const) {
        if (test[key] !== output[key]) issues.push(`${path}/${test.caseId}: record ${key} differs from report envelope`);
      }
      if (test.fixtureDigest !== (test.binding.fixtureCase === null ? null : output.fixtureDigest)) {
        issues.push(`${path}/${test.caseId}: record fixtureDigest differs from report envelope`);
      }
      bindings.push(test.binding);
      const { binding: _binding, ...report } = test;
      void _binding;
      reports.push(report);
    }
  }
  return { bindings, reports, issues };
}

type State = Readonly<{ executed: boolean; passed: boolean }>;
type Summary = Readonly<{ required: number; executed: number; passed: number }>;

const summarize = (states: ReadonlyArray<State>): Summary => ({
  required: states.length,
  executed: states.filter(state => state.executed).length,
  passed: states.filter(state => state.passed).length,
});

function sameFingerprint(report: ExecutionReport, current: CoverageInput['current'], binding: CaseBinding): boolean {
  return report.runId === current.runId
    && report.sourceDigest === current.sourceDigest
    && report.specDigest === current.specDigest
    && report.idlDigest === current.idlDigest
    && report.fixtureDigest === (binding.fixtureCase === null ? null : current.fixtureDigest);
}

export function evaluateCoverage(input: CoverageInput) {
  const issues: string[] = [...(input.sourceIssues ?? [])];
  const specStates = new Map<string, State>();
  const contractStates: State[] = [];
  const flowStates: State[] = [];
  const bindingKeys = input.bindings.map(binding => `${binding.environment}/${binding.caseId}`);
  for (const key of new Set(bindingKeys)) {
    if (bindingKeys.filter(value => value === key).length > 1) issues.push(`duplicate binding key ${key}`);
  }

  const scenarioCases = new Map<string, ScenarioCase>();
  for (const scenario of input.scenarios) {
    for (const item of scenario.cases) scenarioCases.set(`${scenario.id}/${item.key}`, item);
  }
  const flowIds = new Set(input.flows.map(flow => flow.id));
  const contractCases = new Set(input.contracts.flatMap(contract => contract.cases.map(caseKey => `${contract.id}/${caseKey}`)));
  for (const binding of input.bindings) {
    for (const cover of binding.covers) {
      if (cover.checks.length === 0) issues.push(`${binding.environment}/${binding.caseId}: cover ${cover.id}/${cover.caseKey} has no checkpoints`);
      const item = scenarioCases.get(`${cover.id}/${cover.caseKey}`);
      if (!item && !contractCases.has(`${cover.id}/${cover.caseKey}`)) {
        issues.push(`${binding.environment}/${binding.caseId}: unknown cover ${cover.id}/${cover.caseKey}`);
        continue;
      }
      if (!item) continue;
      if (!item.requiredIn.includes(binding.environment)) {
        issues.push(`${cover.id}/${cover.caseKey}: ${item.kind} case cannot bind ${binding.environment}`);
      }
      if (item.kind === 'module' && binding.fixtureCase !== null) {
        issues.push(`${binding.environment}/${binding.caseId}: module binding fixtureCase must be null`);
      }
      if (item.kind !== 'module' && binding.fixtureCase === null) {
        issues.push(`${binding.environment}/${binding.caseId}: ${item.kind} binding requires a fixtureCase`);
      }
      for (const checkpoint of cover.checks) {
        if (!item.checks.includes(checkpoint)) issues.push(`${cover.id}/${cover.caseKey}: binding references unknown checkpoint ${checkpoint}`);
      }
    }
    if (binding.flowId && !flowIds.has(binding.flowId)) {
      issues.push(`${binding.environment}/${binding.caseId}: unknown FLOW reference ${binding.flowId}`);
    }
  }

  const check = (id: string, caseKey: string, environment: Project, requiredChecks: ReadonlyArray<string>): State => {
    const binding = input.bindings.find(candidate => candidate.environment === environment
      && candidate.covers.some(cover => cover.id === id && cover.caseKey === caseKey));
    if (!binding) {
      issues.push(`${id}/${caseKey}: missing binding for ${environment}`);
      return { executed: false, passed: false };
    }
    const report = input.reports.find(candidate => candidate.project === environment && candidate.caseId === binding.caseId);
    if (!report) {
      issues.push(`${id}/${caseKey}: missing ${environment} evidence`);
      return { executed: false, passed: false };
    }
    const fresh = sameFingerprint(report, input.current, binding);
    if (!fresh) issues.push(`${environment}/${binding.caseId} is stale`);
    if (report.assertions <= 0) issues.push(`${environment}/${binding.caseId} has no executed assertions`);
    if (!report.fullName.includes(binding.ownerId) || !report.fullName.includes(binding.caseId)) {
      issues.push(`${environment}/${binding.caseId}: report fullName does not carry ownerId/caseId`);
    }
    const cover = binding.covers.find(item => item.id === id && item.caseKey === caseKey)!;
    const missingCheckpoints = [...new Set([...requiredChecks, ...cover.checks])]
      .filter(checkpoint => !report.checkpoints.includes(checkpoint));
    for (const checkpoint of missingCheckpoints) {
      issues.push(`${environment}/${binding.caseId}: checkpoint ${checkpoint} did not execute`);
    }
    if (report.status !== 'passed') issues.push(`${environment}/${binding.caseId} ${report.status}`);
    const executed = fresh && report.assertions > 0 && report.status !== 'skipped' && missingCheckpoints.length === 0;
    return { executed, passed: executed && report.status === 'passed' };
  };

  for (const scenario of input.scenarios) {
    for (const item of scenario.cases) {
      for (const environment of item.requiredIn) {
        specStates.set(`${scenario.id}/${item.kind}/${item.key}/${environment}`, check(scenario.id, item.key, environment, item.checks));
      }
    }
    for (const dependency of scenario.blockedBy ?? []) issues.push(`${scenario.id}: blocked by ${dependency}`);
  }
  for (const contract of input.contracts) {
    for (const caseKey of contract.cases) {
      for (const environment of contract.requiredIn) contractStates.push(check(contract.id, caseKey, environment, []));
    }
  }
  for (const flow of input.flows) {
    for (const caseKey of flow.cases) {
      for (const environment of flow.requiredIn) {
        const binding = input.bindings.find(candidate => candidate.environment === environment
          && candidate.flowId === flow.id && candidate.flowCase === caseKey);
        if (!binding) {
          issues.push(`${flow.id}/${caseKey}: missing FLOW binding for ${environment}`);
          flowStates.push({ executed: false, passed: false });
          continue;
        }
        const reports = input.reports.filter(report => report.project === environment && report.caseId === binding.caseId
          && report.flow?.id === flow.id && report.flow.caseKey === caseKey);
        if (reports.length === 0) {
          issues.push(`${flow.id}/${caseKey}: missing ${environment} FLOW evidence`);
          flowStates.push({ executed: false, passed: false });
          continue;
        }
        const complete = reports.find(report => report.flow?.continuityId
          && flow.requiredStages.every(stage => report.flow?.stages.includes(stage)));
        if (!complete) issues.push(`${flow.id}/${caseKey}: missing continuous stages in one report`);
        const fresh = complete ? sameFingerprint(complete, input.current, binding) : false;
        if (complete && !fresh) issues.push(`${environment}/${binding.caseId} FLOW evidence is stale`);
        if (complete && complete.assertions <= 0) issues.push(`${environment}/${binding.caseId} FLOW has no executed assertions`);
        if (complete && complete.status !== 'passed') issues.push(`${environment}/${binding.caseId} FLOW ${complete.status}`);
        const executed = Boolean(complete && fresh && complete.assertions > 0 && complete.status !== 'skipped');
        flowStates.push({ executed, passed: executed && complete?.status === 'passed' });
      }
    }
  }

  const currentIds = new Set([...input.scenarios.map(item => item.id), ...input.contracts.map(item => item.id), ...input.flows.map(item => item.id)]);
  for (const id of input.baselineIds ?? []) {
    if (currentIds.has(id)) continue;
    const record = input.reductionReasons?.[id];
    if (!record) {
      issues.push(`inventory item ${id} was removed without an approved reason`);
      continue;
    }
    if (!record.reason || !record.reviewId || record.evidence.length === 0) issues.push(`inventory item ${id} has an incomplete review record`);
    if (record.sourceDigest !== input.current.sourceDigest) issues.push(`inventory item ${id} review record is stale`);
  }

  const scenarioSummary = (kind?: VerificationKind) => {
    const states = input.scenarios.flatMap(scenario => {
      const cases = kind ? scenario.cases.filter(item => item.kind === kind) : scenario.cases;
      if (cases.length === 0) return [];
      const caseStates = cases.flatMap(item => item.requiredIn.map(environment => specStates.get(`${scenario.id}/${item.kind}/${item.key}/${environment}`)!));
      return [{ executed: caseStates.every(state => state.executed), passed: caseStates.every(state => state.passed) }];
    });
    return summarize(states);
  };
  const byKind = Object.fromEntries((['behavior', 'module', 'engineering'] as const).map(kind => [
    kind,
    summarize([...specStates.entries()].filter(([key]) => key.includes(`/${kind}/`)).map(([, state]) => state)),
  ])) as Record<VerificationKind, Summary>;
  const summaries = {
    allSpec: scenarioSummary(),
    paymentBehavior: scenarioSummary('behavior'),
    byKind,
    protocol: summarize(contractStates),
    flows: summarize(flowStates),
  };
  const total = summarize([...specStates.values(), ...contractStates, ...flowStates]);
  return { ...total, summaries, issues };
}

export async function runScenariosCli(
  argv: ReadonlyArray<string>,
  root = process.cwd(),
  environment: Readonly<Record<string, string | undefined>> = process.env,
  command: ScenarioCommand = defaultScenarioCommand,
) {
  const inputIndex = argv.indexOf('--input');
  if (inputIndex >= 0 && argv[inputIndex + 1]) {
    const input = JSON.parse(await readFile(resolve(root, argv[inputIndex + 1]!), 'utf8')) as CoverageInput;
    const result = evaluateCoverage(input);
    return { output: result, exitCode: Math.min(1, result.issues.length) };
  }
  const precheck = await runScenarioPrechecks(root, command);
  if (precheck.issues.length > 0) {
    return {
      output: {
        mode: argv.includes('--inventory') ? 'inventory' : 'complete',
        issues: precheck.issues,
        /* c8 ignore next 3 -- a missing OpenSpec tree stops before inventory exists. */
        ...(precheck.inventory ? { scenarios: precheck.inventory.scenarios, flows: precheck.inventory.flows } : {}),
      },
      exitCode: 1,
    };
  }
  const effective = precheck.effective!;
  const specs = precheck.inventory!;
  const contracts = await buildContractInventory(root);
  const fingerprints = buildVerificationFingerprints(root);
  const reportArguments = argv.flatMap((value, index) => value === '--report' && argv[index + 1] ? [resolve(root, argv[index + 1]!)] : []);
  const defaultReports = ['unit.json', 'integration.json', 'weapp.json']
    .map(name => resolve(root, `artifacts/${environment.PAYMENT_RUN_ID ?? 'local'}/reports/${name}`))
    .filter(path => existsSync(path));
  const loaded = await loadReporterOutputs(reportArguments.length > 0 ? reportArguments : defaultReports);
  const coverage = evaluateCoverage({
    current: { runId: environment.PAYMENT_RUN_ID ?? 'local', ...fingerprints },
    scenarios: specs.scenarios.map(scenarioCoverageDefinition),
    contracts: contracts.obligations.map(obligation => ({ ...obligation, requiredIn: obligation.requiredIn })),
    flows: specs.flows.map(flow => ({
      id: flow.id,
      cases: flow.cases,
      requiredIn: flow.requiredIn,
      requiredStages: flow.stages.split('→').map(stage => stage.trim()).filter(Boolean),
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
    issues: [...effective.issues, ...specs.issues, ...contracts.issues, ...loaded.issues, ...coverage.issues],
    digests: fingerprints,
  };
  return { output, exitCode: Math.min(1, output.issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by SCN-SCENARIO-GATE-009. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) void runScenariosCli(process.argv).then(result => {
  console.log(JSON.stringify(result.output, null, 2));
  process.exitCode = result.exitCode;
});
/* v8 ignore stop */
