import { readFile } from 'node:fs/promises';
import type { CaseBinding, ExecutionReport } from '../check-scenarios.ts';
import type { ScenarioCase } from './scenario-coverage.ts';

type ReporterOutput = Readonly<{
  runId: string;
  /** 按需运行写出的报告带此标记，门禁拒收（GATE-13）。 */
  partial?: boolean;
  sourceDigest: string;
  specDigest: string;
  protocolDigest: string;
  fixtureDigest: string;
  files?: Readonly<Record<string, string>>;
  tests: ReadonlyArray<ExecutionReport & Readonly<{ binding?: CaseBinding }>>;
}>;

export function scenarioCoverageDefinition(
  scenario: Readonly<{
    id: string;
    verification?: Readonly<{
      cases: ReadonlyArray<ScenarioCase>;
      blockedBy: ReadonlyArray<string>;
    }>;
  }>,
) {
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
  const partial: string[] = [];
  for (const path of paths) {
    let output: ReporterOutput;
    try {
      output = JSON.parse(await readFile(path, 'utf8')) as ReporterOutput;
    } catch (error) {
      issues.push(`${path}: reporter output cannot be read: ${String(error)}`);
      continue;
    }
    if (output.partial === true) {
      partial.push(path);
      issues.push(`${path}: partial 报告来自按需运行，并非零退出，不能作为验收证据`);
    }
    if (!Array.isArray(output.tests)) {
      issues.push(`${path}: reporter output has no tests array`);
      continue;
    }
    for (const test of output.tests) {
      if (!test.binding) {
        issues.push(`${path}/${test.caseId}: missing scenarioCase binding`);
        continue;
      }
      if (test.project !== test.binding.environment)
        issues.push(`${path}/${test.caseId}: report project does not match binding environment`);
      for (const key of ['runId', 'sourceDigest', 'specDigest', 'protocolDigest'] as const) {
        if (test[key] !== output[key])
          issues.push(`${path}/${test.caseId}: record ${key} differs from report envelope`);
      }
      if (
        test.fixtureDigest !== (test.binding.fixtureCase === null ? null : output.fixtureDigest)
      ) {
        issues.push(`${path}/${test.caseId}: record fixtureDigest differs from report envelope`);
      }
      bindings.push(test.binding);
      const { binding: _binding, ...report } = test;
      void _binding;
      reports.push(output.files ? { ...report, files: output.files } : report);
    }
  }
  return { bindings, reports, issues, partial };
}
