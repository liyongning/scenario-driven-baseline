import { describe, expect, it } from 'vitest';
import {
  affectedRunId,
  expandSelections,
  extractCaseBindings,
  parseAffectedArguments,
} from './test-affected.ts';
import { loadProjectManifest } from './lib/project-manifest.ts';

describe('test:affected 参数与静态提取', () => {
  it('解析 --base、--scenario、--dry-run 与非法参数', () => {
    expect(parseAffectedArguments([])).toEqual({
      help: false,
      dryRun: false,
      base: 'HEAD',
      scenarios: [],
      issues: [],
    });
    expect(
      parseAffectedArguments([
        '--base',
        'HEAD~1',
        '--scenario',
        'SCN-A-001',
        'SCN-B-002',
        '--dry-run',
      ]),
    ).toEqual({
      help: false,
      dryRun: true,
      base: 'HEAD~1',
      scenarios: ['SCN-A-001', 'SCN-B-002'],
      issues: [],
    });
    expect(parseAffectedArguments(['--help']).help).toBe(true);
    expect(parseAffectedArguments(['--base']).issues).toHaveLength(1);
    expect(parseAffectedArguments(['--scenario', '--dry-run']).issues).toHaveLength(1);
    expect(parseAffectedArguments(['--nope']).issues).toEqual(['未知参数 --nope']);
  });

  it('run id 形如 affected-<UTC 时间戳>', () => {
    expect(affectedRunId(new Date('2026-01-02T03:04:05Z'))).toBe('affected-20260102T030405Z');
  });

  it('静态提取 defineCase 绑定，忽略无关调用与缺字段的调用', () => {
    const source = [
      "import { defineCase } from './define-case.ts';",
      "helper({ ownerId: 'SCN-X-001' });",
      'defineCase({ ownerId: 42, caseId: "a", environment: "integration" }, () => {});',
      'defineCase({ ownerId: "SCN-Y-001", caseId: "b", environment: "integration" }, () => {});',
      'defineCase(',
      '  {',
      '    ownerId: "SCN-Y-002",',
      '    caseId: "c",',
      '    fixtureCase: "c",',
      '    environment: "weapp",',
      '    flowId: "FLOW-Y-001",',
      '    covers: [{ id: "SCN-Y-002", caseKey: "c", checks: ["result"] }, { id: 7 }],',
      '  },',
      '  () => {},',
      ');',
      'const key = "computed";',
      'defineCase({ [key]: 1, "ownerId": "SCN-Z-001", caseId: "d", environment: "integration", covers: ["SCN-Z-009"] }, () => {});',
      'defineCase({ ownerId, caseId: "e", environment: "integration" }, () => {});',
      'defineCase("not-an-object", () => {});',
      '',
    ].join('\n');
    expect(extractCaseBindings('sample.spec.ts', source)).toEqual([
      {
        file: 'sample.spec.ts',
        ownerId: 'SCN-Y-001',
        caseId: 'b',
        environment: 'integration',
        covers: [],
      },
      {
        file: 'sample.spec.ts',
        ownerId: 'SCN-Y-002',
        caseId: 'c',
        environment: 'weapp',
        covers: ['SCN-Y-002'],
        flowId: 'FLOW-Y-001',
      },
      {
        file: 'sample.spec.ts',
        ownerId: 'SCN-Z-001',
        caseId: 'd',
        environment: 'integration',
        covers: [],
      },
    ]);
  });

  it('展开选择时跳过未登记环境与无关绑定', () => {
    const manifest = loadProjectManifest(process.cwd());
    expect(
      expandSelections(
        manifest,
        [
          {
            file: 'packages/e2e/tests/x.spec.ts',
            ownerId: 'SCN-SCENARIO-GATE-020',
            caseId: 'a',
            environment: 'not-registered',
            covers: [],
          },
          {
            file: 'packages/e2e/tests/y.spec.ts',
            ownerId: 'SCN-SCENARIO-GATE-020',
            caseId: 'b',
            environment: 'integration',
            covers: [],
          },
        ],
        ['SCN-SCENARIO-GATE-020'],
      ),
    ).toEqual([
      {
        project: 'integration',
        className: 'integration',
        file: 'packages/e2e/tests/y.spec.ts',
      },
    ]);
    expect(expandSelections(manifest, [], ['SCN-SCENARIO-GATE-020'])).toEqual([]);
  });
});
