import type { CaseBinding, CoverageInput, ExecutionReport } from '../check-scenarios.ts';

export type State = Readonly<{ executed: boolean; passed: boolean }>;
export type Summary = Readonly<{ required: number; executed: number; passed: number }>;

export const summarize = (states: ReadonlyArray<State>): Summary => ({
  required: states.length,
  executed: states.filter((state) => state.executed).length,
  passed: states.filter((state) => state.passed).length,
});

export function sameFingerprint(
  report: ExecutionReport,
  current: CoverageInput['current'],
  binding: CaseBinding,
): boolean {
  return (
    report.runId === current.runId &&
    report.sourceDigest === current.sourceDigest &&
    report.specDigest === current.specDigest &&
    report.protocolDigest === current.protocolDigest &&
    report.fixtureDigest === (binding.fixtureCase === null ? null : current.fixtureDigest)
  );
}

/** 过期说明最多列出的变化文件数。 */
const maxListedChangedFiles = 20;

/** 摘要类别与过期说明使用的标签，顺序固定为 source、spec、protocol、fixture。 */
const digestCategories = [
  { key: 'sourceDigest', label: 'source' },
  { key: 'specDigest', label: 'spec' },
  { key: 'protocolDigest', label: 'protocol' },
  { key: 'fixtureDigest', label: 'fixture' },
] as const;

/**
 * 过期报告的三类信息（GATE-14）：期望/实际 run id、不同的摘要类别，
 * 以及依据报告文件明细算出的变化文件（最多 20 个，超出时给出总数）。
 */
export function staleDetail(
  report: ExecutionReport,
  current: CoverageInput['current'],
  fixtureCase: string | null,
): string {
  const categories = digestCategories
    .filter(({ key }) => {
      const expected = key === 'fixtureDigest' && fixtureCase === null ? null : current[key];
      return report[key] !== expected;
    })
    .map(({ label }) => label);
  const parts = [
    `run id 期望 ${current.runId}，实际 ${report.runId}`,
    `摘要类别不同：${categories.length > 0 ? categories.join('、') : '无'}`,
  ];
  if (report.files && current.files) {
    const paths = [...new Set([...Object.keys(report.files), ...Object.keys(current.files)])]
      .filter((path) => report.files?.[path] !== current.files?.[path])
      .sort();
    const listed = paths.slice(0, maxListedChangedFiles);
    parts.push(
      `变化文件（共 ${paths.length} 个）：${listed.join('、')}${
        paths.length > listed.length ? ' 等' : ''
      }`,
    );
  } else {
    parts.push('变化文件：报告未记录摘要明细');
  }
  return parts.join('；');
}
