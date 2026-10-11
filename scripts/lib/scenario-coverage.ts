import type { CoverageInput, Project, VerificationKind } from '../check-scenarios.ts';
import {
  sameFingerprint,
  staleDetail,
  summarize,
  type State,
  type Summary,
} from './scenario-staleness.ts';

export type ScenarioCase = Readonly<{
  key: string;
  kind: VerificationKind;
  requiredIn: ReadonlyArray<Project>;
  checks: ReadonlyArray<string>;
}>;

export function evaluateCoverage(input: CoverageInput) {
  const issues: string[] = [...(input.sourceIssues ?? [])];
  const specStates = new Map<string, State>();
  const contractStates: State[] = [];
  const flowStates: State[] = [];
  const bindingKeys = input.bindings.map((binding) => `${binding.environment}/${binding.caseId}`);
  for (const key of new Set(bindingKeys)) {
    if (bindingKeys.filter((value) => value === key).length > 1)
      issues.push(`duplicate binding key ${key}`);
  }

  const scenarioCases = new Map<string, ScenarioCase>();
  for (const scenario of input.scenarios) {
    for (const item of scenario.cases) scenarioCases.set(`${scenario.id}/${item.key}`, item);
  }
  const flowIds = new Set(input.flows.map((flow) => flow.id));
  const contractCases = new Set(
    input.contracts.flatMap((contract) =>
      contract.cases.map((caseKey) => `${contract.id}/${caseKey}`),
    ),
  );
  for (const binding of input.bindings) {
    for (const cover of binding.covers) {
      if (cover.checks.length === 0)
        issues.push(
          `${binding.environment}/${binding.caseId}: cover ${cover.id}/${cover.caseKey} has no checkpoints`,
        );
      const item = scenarioCases.get(`${cover.id}/${cover.caseKey}`);
      if (!item && !contractCases.has(`${cover.id}/${cover.caseKey}`)) {
        issues.push(
          `${binding.environment}/${binding.caseId}: unknown cover ${cover.id}/${cover.caseKey}`,
        );
        continue;
      }
      if (!item) continue;
      if (!item.requiredIn.includes(binding.environment)) {
        issues.push(
          `${cover.id}/${cover.caseKey}: ${item.kind} case cannot bind ${binding.environment}`,
        );
      }
      if (item.kind === 'module' && binding.fixtureCase !== null) {
        issues.push(
          `${binding.environment}/${binding.caseId}: module binding fixtureCase must be null`,
        );
      }
      if (item.kind !== 'module' && binding.fixtureCase === null) {
        issues.push(
          `${binding.environment}/${binding.caseId}: ${item.kind} binding requires a fixtureCase`,
        );
      }
      for (const checkpoint of cover.checks) {
        if (!item.checks.includes(checkpoint))
          issues.push(
            `${cover.id}/${cover.caseKey}: binding references unknown checkpoint ${checkpoint}`,
          );
      }
    }
    if (binding.flowId && !flowIds.has(binding.flowId)) {
      issues.push(
        `${binding.environment}/${binding.caseId}: unknown FLOW reference ${binding.flowId}`,
      );
    }
  }

  const check = (
    id: string,
    caseKey: string,
    environment: Project,
    requiredChecks: ReadonlyArray<string>,
  ): State => {
    const binding = input.bindings.find(
      (candidate) =>
        candidate.environment === environment &&
        candidate.covers.some((cover) => cover.id === id && cover.caseKey === caseKey),
    );
    if (!binding) {
      issues.push(`${id}/${caseKey}: missing binding for ${environment}`);
      return { executed: false, passed: false };
    }
    const report = input.reports.find(
      (candidate) => candidate.project === environment && candidate.caseId === binding.caseId,
    );
    if (!report) {
      issues.push(`${id}/${caseKey}: missing ${environment} evidence`);
      return { executed: false, passed: false };
    }
    const fresh = sameFingerprint(report, input.current, binding);
    if (!fresh)
      issues.push(
        `${environment}/${binding.caseId} is stale：${staleDetail(report, input.current, binding.fixtureCase)}`,
      );
    if (report.assertions <= 0)
      issues.push(`${environment}/${binding.caseId} has no executed assertions`);
    if (!report.fullName.includes(binding.ownerId) || !report.fullName.includes(binding.caseId)) {
      issues.push(
        `${environment}/${binding.caseId}: report fullName does not carry ownerId/caseId`,
      );
    }
    const cover = binding.covers.find((item) => item.id === id && item.caseKey === caseKey)!;
    const missingCheckpoints = [...new Set([...requiredChecks, ...cover.checks])].filter(
      (checkpoint) => !report.checkpoints.includes(checkpoint),
    );
    for (const checkpoint of missingCheckpoints) {
      issues.push(`${environment}/${binding.caseId}: checkpoint ${checkpoint} did not execute`);
    }
    if (report.status !== 'passed')
      issues.push(`${environment}/${binding.caseId} ${report.status}`);
    const executed =
      fresh &&
      report.assertions > 0 &&
      report.status !== 'skipped' &&
      missingCheckpoints.length === 0;
    return { executed, passed: executed && report.status === 'passed' };
  };

  for (const scenario of input.scenarios) {
    for (const item of scenario.cases) {
      for (const environment of item.requiredIn) {
        specStates.set(
          `${scenario.id}/${item.kind}/${item.key}/${environment}`,
          check(scenario.id, item.key, environment, item.checks),
        );
      }
    }
    for (const dependency of scenario.blockedBy ?? [])
      issues.push(`${scenario.id}: blocked by ${dependency}`);
  }
  for (const contract of input.contracts) {
    for (const caseKey of contract.cases) {
      for (const environment of contract.requiredIn)
        contractStates.push(check(contract.id, caseKey, environment, []));
    }
  }
  for (const flow of input.flows) {
    for (const caseKey of flow.cases) {
      for (const environment of flow.requiredIn) {
        const binding = input.bindings.find(
          (candidate) =>
            candidate.environment === environment &&
            candidate.flowId === flow.id &&
            candidate.flowCase === caseKey,
        );
        if (!binding) {
          issues.push(`${flow.id}/${caseKey}: missing FLOW binding for ${environment}`);
          flowStates.push({ executed: false, passed: false });
          continue;
        }
        const reports = input.reports.filter(
          (report) =>
            report.project === environment &&
            report.caseId === binding.caseId &&
            report.flow?.id === flow.id &&
            report.flow.caseKey === caseKey,
        );
        if (reports.length === 0) {
          issues.push(`${flow.id}/${caseKey}: missing ${environment} FLOW evidence`);
          flowStates.push({ executed: false, passed: false });
          continue;
        }
        const complete = reports.find(
          (report) =>
            report.flow?.continuityId &&
            flow.requiredStages.every((stage) => report.flow?.stages.includes(stage)),
        );
        if (!complete)
          issues.push(`${flow.id}/${caseKey}: missing continuous stages in one report`);
        const fresh = complete ? sameFingerprint(complete, input.current, binding) : false;
        if (complete && !fresh)
          issues.push(
            `${environment}/${binding.caseId} FLOW evidence is stale：${staleDetail(complete, input.current, binding.fixtureCase)}`,
          );
        if (complete && complete.assertions <= 0)
          issues.push(`${environment}/${binding.caseId} FLOW has no executed assertions`);
        if (complete && complete.status !== 'passed')
          issues.push(`${environment}/${binding.caseId} FLOW ${complete.status}`);
        const executed = Boolean(
          complete && fresh && complete.assertions > 0 && complete.status !== 'skipped',
        );
        flowStates.push({ executed, passed: executed && complete?.status === 'passed' });
      }
    }
  }

  // GATE-11 反向检查：以绑定为对账单位，实际执行的 checkpoint 必须落在
  // 该绑定全部 cover 的登记集合内（Scenario/FLOW 取有效 Spec 声明的 checks，
  // 协议义务取 `<义务 ID>/<case>` 形式）。
  const bindingLedger = new Map<string, Set<string>>();
  for (const binding of input.bindings) {
    const key = `${binding.environment}/${binding.caseId}`;
    const registered = bindingLedger.get(key) ?? new Set<string>();
    for (const cover of binding.covers) {
      const item = scenarioCases.get(`${cover.id}/${cover.caseKey}`);
      if (item) for (const checkpoint of item.checks) registered.add(checkpoint);
      else if (contractCases.has(`${cover.id}/${cover.caseKey}`))
        registered.add(`${cover.id}/${cover.caseKey}`);
    }
    bindingLedger.set(key, registered);
  }
  for (const report of input.reports) {
    const registered = bindingLedger.get(`${report.project}/${report.caseId}`);
    if (!registered) continue;
    for (const checkpoint of report.checkpoints)
      if (!registered.has(checkpoint))
        issues.push(
          `未登记的 checkpoint：${report.file} 的绑定 ${report.project}/${report.caseId} 执行了 ${checkpoint}`,
        );
  }

  const currentIds = new Set([
    ...input.scenarios.map((item) => item.id),
    ...input.contracts.map((item) => item.id),
    ...input.flows.map((item) => item.id),
  ]);
  for (const id of input.baselineIds ?? []) {
    if (currentIds.has(id)) continue;
    const record = input.reductionReasons?.[id];
    if (!record) {
      issues.push(`inventory item ${id} was removed without an approved reason`);
      continue;
    }
    if (!record.reason || !record.reviewId || record.evidence.length === 0)
      issues.push(`inventory item ${id} has an incomplete review record`);
    if (record.sourceDigest !== input.current.sourceDigest)
      issues.push(`inventory item ${id} review record is stale`);
  }

  const scenarioSummary = (kind?: VerificationKind) => {
    const states = input.scenarios.flatMap((scenario) => {
      const cases = kind ? scenario.cases.filter((item) => item.kind === kind) : scenario.cases;
      if (cases.length === 0) return [];
      const caseStates = cases.flatMap((item) =>
        item.requiredIn.map((environment) =>
          specStates.get(`${scenario.id}/${item.kind}/${item.key}/${environment}`)!,
        ),
      );
      return [
        {
          executed: caseStates.every((state) => state.executed),
          passed: caseStates.every((state) => state.passed),
        },
      ];
    });
    return summarize(states);
  };
  const byKind = Object.fromEntries(
    (['behavior', 'module', 'engineering'] as const).map((kind) => [
      kind,
      summarize(
        [...specStates.entries()]
          .filter(([key]) => key.includes(`/${kind}/`))
          .map(([, state]) => state),
      ),
    ]),
  ) as Record<VerificationKind, Summary>;
  const summaries = {
    allSpec: scenarioSummary(),
    publicBehavior: scenarioSummary('behavior'),
    byKind,
    protocol: summarize(contractStates),
    flows: summarize(flowStates),
  };
  const total = summarize([...specStates.values(), ...contractStates, ...flowStates]);
  return { ...total, summaries, issues };
}
