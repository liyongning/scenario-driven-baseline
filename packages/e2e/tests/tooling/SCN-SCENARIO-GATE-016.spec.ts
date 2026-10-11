import { cliEvidence } from './scenario-gate-helpers.ts';
import { baseCoverage, runScenarioCli, type MutableCoverageInput } from './helpers.ts';

type CoverageOutput = Readonly<{ issues: ReadonlyArray<string>; executed: number }>;

const clone = (): MutableCoverageInput =>
  JSON.parse(JSON.stringify(baseCoverage())) as MutableCoverageInput;

const undeclared = (issues: ReadonlyArray<string>) =>
  issues.filter((issue) => issue.includes('未登记的 checkpoint'));

function run(
  input: MutableCoverageInput,
): Readonly<{ status: number | null; output: CoverageOutput }> {
  const result = runScenarioCli(input);
  return { status: result.status, output: JSON.parse(result.stdout) as CoverageOutput };
}

/** 多 cover 绑定：两个 Scenario 与一条协议义务共享一次执行，模拟现仓库的协议矩阵用例。 */
function multiCoverInput(): MutableCoverageInput {
  const input = clone();
  input.scenarios.push({
    id: 'SCN-SAMPLE-TEST-002',
    cases: [{ key: 'normal', kind: 'behavior', requiredIn: ['integration'], checks: ['second'] }],
  });
  input.contracts.push({
    id: 'method#request#second',
    cases: ['normal'],
    requiredIn: ['integration'],
  });
  input.bindings[0]!.covers = [
    { id: 'SCN-SAMPLE-TEST-001', caseKey: 'normal', checks: ['result'] },
    { id: 'SCN-SAMPLE-TEST-002', caseKey: 'normal', checks: ['second'] },
    { id: 'method#request#second', caseKey: 'normal', checks: ['method#request#second/normal'] },
  ];
  input.reports[0]!.checkpoints = ['result', 'second', 'method#request#second/normal'];
  return input;
}

/** module 类手写注解证据：绑定与报告都在 test-tools-unit。 */
function moduleInput(): MutableCoverageInput {
  const input = clone();
  input.scenarios = [
    {
      id: 'SCN-SAMPLE-TEST-003',
      cases: [
        { key: 'internal', kind: 'module', requiredIn: ['test-tools-unit'], checks: ['internal'] },
      ],
    },
  ];
  input.contracts = [];
  input.flows = [];
  input.bindings = [
    {
      ownerId: 'SCN-SAMPLE-TEST-003',
      caseId: 'module-internal',
      fixtureCase: null,
      environment: 'test-tools-unit',
      covers: [{ id: 'SCN-SAMPLE-TEST-003', caseKey: 'internal', checks: ['internal'] }],
    },
  ];
  input.reports = [
    {
      ...input.current,
      fixtureDigest: null,
      project: 'test-tools-unit',
      file: 'module.test.ts',
      fullName: 'SCN-SAMPLE-TEST-003 module-internal',
      caseId: 'module-internal',
      status: 'passed',
      assertions: 2,
      checkpoints: ['internal', 'ghost-module'],
    },
  ];
  return input;
}

cliEvidence(
  'SCN-SCENARIO-GATE-016',
  'undeclared-checkpoint-cli',
  ['undeclared-checkpoint-rejected', 'full-pass-not-exempt', 'registered-passes'],
  async (context, check) => {
    const broken = clone();
    broken.reports[0]!.checkpoints = [...broken.reports[0]!.checkpoints, 'ghost'];
    const brokenRun = run(broken);

    await check('undeclared-checkpoint-rejected', () => {
      const { status, output } = brokenRun;
      context.expect(status).toBe(1);
      context.expect(output.issues.join('\n')).toContain('未登记的 checkpoint');
      context.expect(output.issues.join('\n')).toContain('ghost');
      context.expect(output.issues.join('\n')).toContain('normal.spec.ts');
      context.expect(output.issues.join('\n')).toContain('integration/normal');
    });

    await check('full-pass-not-exempt', () => {
      const { status, output } = brokenRun;
      context.expect(output.issues.join('\n')).toContain('未登记的 checkpoint');
      context.expect(undeclared(output.issues).length).toBeGreaterThan(0);
      context.expect(status).toBe(1);
    });

    await check('registered-passes', () => {
      const { status, output } = run(clone());
      context.expect(undeclared(output.issues)).toEqual([]);
      context.expect(status).toBe(0);
    });
  },
);

cliEvidence(
  'SCN-SCENARIO-GATE-016',
  'multi-cover-binding-cli',
  [
    'binding-union-ledger',
    'multi-cover-no-false-positive',
    'unknown-obligation-checkpoint-rejected',
  ],
  async (context, check) => {
    const unionRun = run(multiCoverInput());

    await check('binding-union-ledger', () => {
      const { output } = unionRun;
      context.expect(output.executed).toBeGreaterThan(0);
      context.expect(undeclared(output.issues)).toEqual([]);
    });

    await check('multi-cover-no-false-positive', () => {
      const { status, output } = unionRun;
      context.expect(undeclared(output.issues)).toEqual([]);
      context.expect(status).toBe(0);
    });

    await check('unknown-obligation-checkpoint-rejected', () => {
      const input = multiCoverInput();
      input.reports[0]!.checkpoints = [
        ...input.reports[0]!.checkpoints,
        'infra.trade.v1.unknown#request#field/normal',
      ];
      const { status, output } = run(input);
      context.expect(status).toBe(1);
      context.expect(output.issues.join('\n')).toContain('未登记的 checkpoint');
      context
        .expect(output.issues.join('\n'))
        .toContain('infra.trade.v1.unknown#request#field/normal');
    });
  },
);

cliEvidence(
  'SCN-SCENARIO-GATE-016',
  'module-annotation-cli',
  ['module-annotation-covered', 'undeclared-checkpoint-rejected'],
  async (context, check) => {
    await check('module-annotation-covered', () => {
      const { status, output } = run(moduleInput());
      context.expect(status).toBe(1);
      context.expect(output.issues.join('\n')).toContain('未登记的 checkpoint');
      context.expect(output.issues.join('\n')).toContain('module.test.ts');
      context.expect(output.issues.join('\n')).toContain('ghost-module');
    });

    await check('undeclared-checkpoint-rejected', () => {
      const input = moduleInput();
      input.reports[0]!.checkpoints = ['internal'];
      const { status, output } = run(input);
      context.expect(undeclared(output.issues)).toEqual([]);
      context.expect(status).toBe(0);
    });
  },
);
