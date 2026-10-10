import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, type TestContext } from 'vitest';
import {
  createControlledRoot,
  minimalManifest,
} from '../packages/e2e/tests/tooling/controlled-root.ts';
import { base, type MutableCoverageInput } from '../packages/e2e/tests/tooling/helpers.ts';
import { evaluateCoverage, runScenarioPrechecks, type CoverageInput } from './check-scenarios.ts';

type CoverageOutput = Readonly<{ issues: ReadonlyArray<string>; executed: number }>;

/** 与 check-fixtures.test.ts 相同的 module 证据登记方式：每个 case 一段可核对断言。 */
async function evidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `${id} ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: id,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id, caseKey: caseId, checks }],
        },
      },
    },
    async (context: TestContext) => {
      const before = context.expect.getState().assertionCalls;
      const executed: string[] = [];
      await body(context, async (name, assertion) => {
        await assertion();
        executed.push(name);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

const mutable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function runCoverage(input: CoverageInput): CoverageOutput {
  // module 类证据直接调用纯函数：CLI 路径由 SCN-SCENARIO-GATE-016.spec.ts 的 cli case 覆盖。
  return evaluateCoverage(input);
}

/** 多 cover 绑定：两个 Scenario 与一条协议义务共享一次执行。 */
function multiCoverInput() {
  const input = mutable(base()) as MutableCoverageInput;
  input.scenarios.push({
    id: 'SCN-SAMPLE-CORE-002',
    cases: [{ key: 'normal', kind: 'behavior', requiredIn: ['integration'], checks: ['second'] }],
  });
  input.contracts.push({
    id: 'method#request#second',
    cases: ['normal'],
    requiredIn: ['integration'],
  });
  input.bindings[0]!.covers = [
    { id: 'SCN-SAMPLE-CORE-001', caseKey: 'normal', checks: ['phase', 'result'] },
    { id: 'SCN-SAMPLE-CORE-002', caseKey: 'normal', checks: ['second'] },
    {
      id: 'method#request#second',
      caseKey: 'normal',
      checks: ['method#request#second/normal'],
    },
  ];
  input.reports[0]!.checkpoints = ['phase', 'result', 'second', 'method#request#second/normal'];
  return input;
}

const undeclared = (output: CoverageOutput) =>
  output.issues.filter((issue) => issue.includes('未登记的 checkpoint'));

evidence(
  'SCN-SCENARIO-GATE-016',
  'reverse-checkpoint-rules',
  [
    'undeclared-checkpoint-rejected',
    'binding-union-ledger',
    'multi-cover-no-false-positive',
    'unknown-obligation-checkpoint-rejected',
    'full-pass-not-exempt',
    'module-annotation-covered',
    'registered-passes',
  ],
  async (context, check) => {
    await check('undeclared-checkpoint-rejected', () => {
      const input = mutable(base()) as MutableCoverageInput;
      input.reports[0]!.checkpoints = [...input.reports[0]!.checkpoints, 'ghost'];
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('未登记的 checkpoint');
      context.expect(issues).toContain('ghost');
      context.expect(issues).toContain('flow.spec.ts');
      context.expect(issues).toContain('integration/flow-normal');
    });

    await check('binding-union-ledger', () => {
      const input = multiCoverInput();
      const output = runCoverage(input);
      context.expect(output.executed).toBeGreaterThan(0);
      context.expect(undeclared(output)).toEqual([]);
    });

    await check('multi-cover-no-false-positive', () => {
      const output = runCoverage(multiCoverInput());
      context.expect(output.issues.join('\n')).not.toContain('未登记的 checkpoint');
    });

    await check('unknown-obligation-checkpoint-rejected', () => {
      const input = multiCoverInput();
      input.reports[0]!.checkpoints = [
        ...input.reports[0]!.checkpoints,
        'infra.trade.v1.unknown#request#field/normal',
      ];
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('未登记的 checkpoint');
      context.expect(issues).toContain('infra.trade.v1.unknown#request#field/normal');
    });

    await check('full-pass-not-exempt', () => {
      const input = mutable(base()) as MutableCoverageInput;
      input.reports[0]!.checkpoints = [...input.reports[0]!.checkpoints, 'ghost'];
      const output = runCoverage(input);
      context.expect(output.issues.join('\n')).toContain('未登记的 checkpoint');
      context.expect(undeclared(output).length).toBeGreaterThan(0);
    });

    await check('module-annotation-covered', () => {
      const input = mutable(base()) as MutableCoverageInput;
      input.scenarios = [
        {
          id: 'SCN-SAMPLE-CORE-003',
          cases: [
            {
              key: 'internal',
              kind: 'module',
              requiredIn: ['test-tools-unit'],
              checks: ['internal'],
            },
          ],
        },
      ];
      input.contracts = [];
      input.flows = [];
      input.bindings = [
        {
          ownerId: 'SCN-SAMPLE-CORE-003',
          caseId: 'module-internal',
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id: 'SCN-SAMPLE-CORE-003', caseKey: 'internal', checks: ['internal'] }],
        },
      ];
      input.reports = [
        {
          ...input.current,
          project: 'test-tools-unit',
          file: 'module.test.ts',
          fullName: 'SCN-SAMPLE-CORE-003 module-internal',
          caseId: 'module-internal',
          status: 'passed',
          assertions: 2,
          checkpoints: ['internal', 'ghost-module'],
        },
      ];
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('未登记的 checkpoint');
      context.expect(issues).toContain('module.test.ts');
      context.expect(issues).toContain('ghost-module');
    });

    await check('registered-passes', () => {
      context.expect(undeclared(runCoverage(mutable(base())))).toEqual([]);
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-019',
  'unscoped-format-rules',
  ['format-checks-unscoped', 'coverage-scoped-after-fix'],
  async (context, check) => {
    const controlled = createControlledRoot({
      manifest: minimalManifest(),
      files: {
        'scenario-gate.config.json': JSON.stringify({
          scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
          flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
          ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
        }),
        'openspec/specs/sample/spec.md': [
          '### Requirement: BASE-01 交易示例',
          '',
          '系统 SHALL 提供交易示例。',
          '',
          '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
          '',
          '```json verification',
          '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
          '```',
          '',
        ].join('\n'),
        'openspec/changes/alpha/specs/sample/spec.md': [
          '## ADDED Requirements',
          '',
          '### Requirement: BASE-05 A 新增',
          '',
          '系统 SHALL 提供 A 场景。',
          '',
          '#### Scenario: SCN-SAMPLE-CONTRACT-005 A 场景',
          '',
          '```json verification',
          '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
          '```',
          '',
        ].join('\n'),
        'openspec/changes/beta/specs/sample/spec.md': [
          '## ADDED Requirements',
          '',
          '### Requirement: BASE-06 B 新增',
          '',
          '系统 SHALL 提供 B 场景。',
          '',
          '#### Scenario: SCN-SAMPLE-CONTRACT-006 B 场景（缺 verification）',
          '',
          '- **WHEN** B',
          '- **THEN** B',
          '',
        ].join('\n'),
      },
      prefix: 'scenario-unscoped-',
    });
    const scope = { changes: ['alpha'] };
    try {
      const stub = () => ({ status: 0 });
      await check('format-checks-unscoped', async () => {
        const broken = await runScenarioPrechecks(controlled.root, stub, scope);
        context.expect(broken.issues.join('\n')).toContain('verification');
        context.expect(broken.issues.join('\n')).toContain('SCN-SAMPLE-CONTRACT-006');
        const ids = (broken.inventory?.scenarios ?? []).map((item) => item.id);
        context.expect(ids).toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-005']);
      });

      await check('coverage-scoped-after-fix', async () => {
        await writeFile(
          join(controlled.root, 'openspec/changes/beta/specs/sample/spec.md'),
          [
            '## ADDED Requirements',
            '',
            '### Requirement: BASE-06 B 新增',
            '',
            '系统 SHALL 提供 B 场景。',
            '',
            '#### Scenario: SCN-SAMPLE-CONTRACT-006 B 场景',
            '',
            '```json verification',
            '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
            '```',
            '',
          ].join('\n'),
        );
        const fixed = await runScenarioPrechecks(controlled.root, stub, scope);
        context.expect(fixed.issues).toEqual([]);
        context
          .expect((fixed.inventory?.scenarios ?? []).map((item) => item.id))
          .toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-005']);
      });
    } finally {
      controlled.cleanup();
    }
  },
);

evidence(
  'SCN-SCENARIO-GATE-025',
  'stale-explanation-rules',
  ['run-id-mismatch-detail', 'digest-category-detail', 'changed-files-detail'],
  async (context, check) => {
    /** 过期报告：run id 与 source 摘要都与当前不同，其余摘要保持一致。 */
    const stale = (): MutableCoverageInput => {
      const input = mutable(base()) as MutableCoverageInput;
      input.reports[0] = { ...input.reports[0]!, runId: 'actual-run', sourceDigest: 'old-source' };
      return input;
    };

    await check('run-id-mismatch-detail', () => {
      const issues = runCoverage(stale()).issues.join('\n');
      context.expect(issues).toContain('is stale');
      context.expect(issues).toContain('run id 期望 run-1，实际 actual-run');
    });

    await check('digest-category-detail', () => {
      const input = stale();
      input.reports[0]!.specDigest = input.current.specDigest;
      input.reports[0]!.protocolDigest = input.current.protocolDigest;
      input.current.fixtureDigest = 'new-fixture';
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('摘要类别不同：source、fixture');
    });

    await check('changed-files-detail', () => {
      const input = stale();
      input.reports[0]!.files = { 'a.ts': '1', 'b.ts': '2' };
      input.current.files = { 'b.ts': '2', 'c.ts': '3' };
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('变化文件（共 2 个）：a.ts、c.ts');

      const many = stale();
      many.reports[0]!.files = {};
      many.current.files = Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => [
          `file-${String(index).padStart(2, '0')}.ts`,
          'x',
        ]),
      );
      const manyIssues = runCoverage(many).issues.join('\n');
      context.expect(manyIssues).toContain('变化文件（共 25 个）：');
      context.expect(manyIssues).toContain(' 等');
      const listed = manyIssues.split('变化文件（共 25 个）：')[1]!.split(' 等')[0]!.split('、');
      context.expect(listed).toHaveLength(20);
      context.expect(listed[0]).toBe('file-00.ts');

      const noDetail = mutable(base()) as MutableCoverageInput;
      noDetail.reports[0] = { ...noDetail.reports[0]!, runId: 'actual-run' };
      context
        .expect(runCoverage(noDetail).issues.join('\n'))
        .toContain('变化文件：报告未记录摘要明细');
    });
  },
);
