import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Reporter, TestCase } from 'vitest/node';
import type { Project } from '../../../../scripts/check-scenarios.ts';

type ReporterOptions = Readonly<{
  outputFile: string;
  runId: string;
  project?: Project;
  fingerprints: Readonly<{
    sourceDigest: string;
    specDigest: string;
    idlDigest: string;
    fixtureDigest: string;
  }>;
}>;

type ScenarioRecord = Readonly<{
  runId: string;
  file: string;
  fullName: string;
  caseId: string;
  project: Project;
  sourceDigest: string;
  specDigest: string;
  idlDigest: string;
  fixtureDigest: string | null;
  status: 'passed' | 'failed' | 'skipped';
  assertions: number;
  checkpoints: string[];
  flow?: Readonly<{ id: string; caseKey: string; continuityId: string; stages: string[] }>;
  binding: unknown;
}>;

export class ScenarioReporter implements Reporter {
  readonly #records: ScenarioRecord[] = [];
  constructor(readonly options: ReporterOptions) {}

  onTestCaseResult(testCase: TestCase): void {
    const metadata = (
      typeof testCase.meta === 'function'
        ? testCase.meta()
        : (testCase.options as unknown as { meta?: { scenarioCase?: unknown } }).meta
    ) as { scenarioCase?: unknown } | undefined;
    const binding = metadata?.scenarioCase as
      { caseId?: string; fixtureCase?: string | null } | undefined;
    if (!binding?.caseId) return;
    const annotations = testCase.annotations();
    const annotation = annotations.find((item) => item.type === 'scenario-evidence');
    let evidence: { assertions: number; checkpoints: string[] } = {
      assertions: 0,
      checkpoints: [],
    };
    if (annotation) {
      try {
        evidence = JSON.parse(annotation.message) as typeof evidence;
      } catch {
        /* 解析失败保留零断言，完整门禁会阻断。 */
      }
    }
    const flowAnnotation = annotations.find((item) => item.type === 'scenario-flow');
    let flow: ScenarioRecord['flow'];
    if (flowAnnotation) {
      try {
        flow = JSON.parse(flowAnnotation.message) as ScenarioRecord['flow'];
      } catch {
        /* 无效连续性证据不写入报告，FLOW 门禁会阻断。 */
      }
    }
    const state = testCase.result().state;
    this.#records.push({
      runId: this.options.runId,
      file: testCase.module.moduleId,
      fullName: testCase.fullName,
      caseId: binding.caseId,
      project: this.options.project ?? (testCase.project.name as Project),
      sourceDigest: this.options.fingerprints.sourceDigest,
      specDigest: this.options.fingerprints.specDigest,
      idlDigest: this.options.fingerprints.idlDigest,
      fixtureDigest: binding.fixtureCase === null ? null : this.options.fingerprints.fixtureDigest,
      status: state === 'passed' || state === 'failed' ? state : 'skipped',
      assertions: evidence.assertions,
      checkpoints: evidence.checkpoints,
      ...(flow ? { flow } : {}),
      binding: metadata?.scenarioCase,
    });
  }

  async onTestRunEnd(): Promise<void> {
    await mkdir(dirname(this.options.outputFile), { recursive: true });
    await writeFile(
      this.options.outputFile,
      `${JSON.stringify(
        {
          runId: this.options.runId,
          ...this.options.fingerprints,
          tests: this.#records,
        },
        null,
        2,
      )}\n`,
    );
  }

  records(): ScenarioRecord[] {
    return this.#records.map((record) => ({ ...record, checkpoints: [...record.checkpoints] }));
  }
}
