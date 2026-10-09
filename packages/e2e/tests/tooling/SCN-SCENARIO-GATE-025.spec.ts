import { cliEvidence } from './scenario-gate-helpers.ts';
import { baseCoverage, runScenarioCli, type MutableCoverageInput } from './helpers.ts';

const mutable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 变化文件明细：当前与报告两侧的文件摘要，键为文件路径。 */
function digestFiles(count: number, reportValue: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Array.from({ length: count }, (_unused, index) => [
      `f${String(index + 1).padStart(2, '0')}.ts`,
      reportValue,
    ]),
  );
}

function staleInput(
  options: Readonly<{
    reportRunId?: string;
    currentSourceDigest?: string;
    changedFiles?: number;
  }>,
): MutableCoverageInput {
  const input = mutable(baseCoverage()) as MutableCoverageInput;
  if (options.reportRunId) input.reports[0]!.runId = options.reportRunId;
  if (options.currentSourceDigest) input.current.sourceDigest = options.currentSourceDigest;
  if (options.changedFiles) {
    // 文件变化同样反映为摘要变化，报告因此判定过期并给出文件明细。
    input.current.sourceDigest = 'changed';
    input.current.files = digestFiles(options.changedFiles, 'now');
    input.reports[0]!.files = digestFiles(options.changedFiles, 'before');
  }
  return input;
}

cliEvidence(
  'SCN-SCENARIO-GATE-025',
  'stale-explanation-cli',
  ['run-id-mismatch-detail', 'digest-category-detail', 'changed-files-detail'],
  async (context, check) => {
    const runIdMismatch = runScenarioCli(staleInput({ reportRunId: 'report-run' }));
    const digestMismatch = runScenarioCli(staleInput({ currentSourceDigest: 'changed' }));
    const threeFiles = runScenarioCli(staleInput({ changedFiles: 3 }));
    const manyFiles = runScenarioCli(staleInput({ changedFiles: 25 }));

    await check('run-id-mismatch-detail', () => {
      context.expect(runIdMismatch.status).not.toBe(0);
      context.expect(runIdMismatch.stdout).toContain('tooling-run');
      context.expect(runIdMismatch.stdout).toContain('report-run');
    });

    await check('digest-category-detail', () => {
      context.expect(digestMismatch.status).not.toBe(0);
      context.expect(digestMismatch.stdout).toContain('source');
      context.expect(digestMismatch.stdout).toContain('摘要类别不同：source');
    });

    await check('changed-files-detail', () => {
      for (const name of ['f01.ts', 'f02.ts', 'f03.ts'])
        context.expect(threeFiles.stdout).toContain(name);
      context.expect(threeFiles.stdout).not.toContain('共 25');
      // 超过 20 个时只列前 20 个，并给出总数。
      context.expect(manyFiles.stdout).toContain('f20.ts');
      context.expect(manyFiles.stdout).not.toContain('f21.ts');
      context.expect(manyFiles.stdout).toMatch(/共\s*25\s*个/);
    });
  },
);
