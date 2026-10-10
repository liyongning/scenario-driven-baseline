import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, test, type TestContext } from 'vitest';
import { ScenarioReporter } from '../packages/e2e/src/reporters/scenario-reporter.ts';
import {
  createAffectedFixture,
  type AffectedFixture,
} from '../packages/e2e/tests/tooling/affected-fixture.ts';
import { enableInventory } from '../packages/e2e/tests/tooling/scenario-gate-helpers.ts';
import { loadReporterOutputs, runScenariosCli } from './check-scenarios.ts';
import {
  affectedCommands,
  affectedReportIssues,
  affectedRunId,
  analysisTsconfig,
  changedFilesSince,
  changedRequirements,
  fixtureSelections,
  formatAffectedPlan,
  fullTriggers,
  planAffected,
  reachedTestFiles,
  runAffectedCli,
  scanCaseBindings,
  spawnAffectedStep,
} from './test-affected.ts';
import { loadProjectManifest } from './lib/project-manifest.ts';

const specPath = 'openspec/specs/sample/spec.md';
const fixtureFile = 'packages/e2e/tests/fixtures/SCN-SAMPLE-A-001/base.json';
const productSource = 'packages/sample-product/src/core.ts';
const integrationSpec = 'packages/e2e/tests/example/SCN-SAMPLE-A-001.spec.ts';
const platformSpec = 'packages/e2e/tests/weapp/SCN-SAMPLE-A-001.spec.ts';
const toolingSpec = 'packages/e2e/tests/tooling/SCN-SAMPLE-TOOL-009.spec.ts';
const flowSpec = 'packages/e2e/tests/flows/FLOW-SAMPLE-A-001.spec.ts';
const scriptsSource = 'scripts/lib/affected-sample.ts';

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
      // 与 cliEvidence 一致：用例会建受控根、跑 git 与 dependency-cruiser，在副本/负载下默认 5s 易误判超时。
      timeout: 30_000,
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

const reasonOf = (selections: ReadonlyArray<{ id: string; reason: string }>, id: string): string =>
  selections.find((item) => item.id === id)?.reason ?? '';

const planFor = (fixture: AffectedFixture, scenarios: string[] = []) =>
  planAffected(fixture.root, {
    base: 'HEAD',
    scenarios,
    runId: 'affected-20260101T000000Z',
  });

describe('test:affected 依赖分析与执行路径', () => {
  it('分析失败、无模块与无输入时给出确定结果', { timeout: 30_000 }, () => {
    const manifest = loadProjectManifest(process.cwd());
    expect(reachedTestFiles(process.cwd(), manifest, [])).toEqual([]);
    expect(
      reachedTestFiles(
        process.cwd(),
        { ...manifest, fingerprints: { ...manifest.fingerprints, sourceRoots: [] } },
        ['scripts/lib/spec-sources.ts'],
      ),
    ).toEqual([]);
    expect(() =>
      reachedTestFiles(process.cwd(), manifest, ['scripts/lib/spec-sources.ts'], () => ({
        status: 2,
        stdout: '',
        stderr: 'boom',
      })),
    ).toThrowError(/退出码 2：boom/);
    expect(() =>
      reachedTestFiles(process.cwd(), manifest, ['scripts/lib/spec-sources.ts'], () => ({
        status: 3,
        stdout: null,
        stderr: null,
      })),
    ).toThrowError(/退出码 3/);
    expect(
      reachedTestFiles(process.cwd(), manifest, ['scripts/lib/spec-sources.ts'], () => ({
        status: 0,
        stdout: JSON.stringify({ modules: [{ source: 'scripts/lib/project-manifest.ts' }] }),
        stderr: '',
      })),
    ).toEqual([]);
    expect(
      reachedTestFiles(process.cwd(), manifest, ['scripts/lib/spec-sources.ts'], () => ({
        status: 0,
        stdout: null,
        stderr: null,
      })),
    ).toEqual([]);
    expect(
      reachedTestFiles(process.cwd(), manifest, ['scripts/lib/spec-sources.ts'], () => ({
        status: 0,
        stdout: JSON.stringify({ modules: [{ source: 'scripts/lib/spec-sources.test.ts' }] }),
        stderr: '',
      })),
    ).toEqual(['scripts/lib/spec-sources.test.ts']);
  });

  it('CLI 打印计划、执行步骤并透传失败退出码', { timeout: 30_000 }, async () => {
    const fixture = createAffectedFixture();
    try {
      expect((await runAffectedCli(['--help'], fixture.root)).exitCode).toBe(0);
      expect((await runAffectedCli(['--nope'], fixture.root)).exitCode).toBe(1);
      fixture.write('tsconfig.test.json', '{ "fixture": true }\n');
      const dry = await runAffectedCli(['--dry-run'], fixture.root);
      expect(dry.exitCode).toBe(0);
      expect(dry.output).toContain('全量触发：pnpm check:fast');
      const seen: string[] = [];
      const success = await runAffectedCli([], fixture.root, (step) => {
        seen.push([step.command, ...step.args].join(' '));
        return 0;
      });
      expect(success.exitCode).toBe(0);
      expect(seen).toEqual(['pnpm check:fast']);
      const failure = await runAffectedCli([], fixture.root, () => 3);
      expect(failure.exitCode).toBe(3);
      const broken = await runAffectedCli([], join(fixture.root, 'missing'));
      expect(broken.exitCode).toBe(1);
      expect(broken.output).toContain('无法计算计划');
    } finally {
      fixture.cleanup();
    }
  });

  it('unit 类项目的报告名合并为 unit', () => {
    const manifest = loadProjectManifest(process.cwd());
    const commands = affectedCommands(process.cwd(), manifest, {
      runId: 'affected-20260101T000000Z',
      files: [{ project: 'test-tools-unit', className: 'unit', file: 'scripts/sample.test.ts' }],
      related: [],
      build: false,
    });
    expect(commands).toEqual([
      {
        command: 'vitest',
        args: ['run', '--project', 'test-tools-unit', 'scripts/sample.test.ts'],
        env: {
          VERIFY_RUN_ID: 'affected-20260101T000000Z',
          TEST_AFFECTED_PARTIAL: '1',
          VERIFY_REPORT_FILE: join(
            process.cwd(),
            'artifacts/affected-20260101T000000Z/reports/unit.json',
          ),
        },
      },
    ]);
  });

  it('平台文件按清单登记先执行 prepare，同一项目的文件合成一份报告', () => {
    const manifest = loadProjectManifest(process.cwd());
    const runId = 'affected-20260101T000000Z';
    const commands = affectedCommands(process.cwd(), manifest, {
      runId,
      files: [
        { project: 'weapp', className: 'platform', file: 'packages/e2e/tests/weapp/a.spec.ts' },
        {
          project: 'integration',
          className: 'integration',
          file: 'packages/e2e/tests/protocol/b.spec.ts',
        },
        {
          project: 'integration',
          className: 'integration',
          file: 'packages/e2e/tests/protocol/c.spec.ts',
        },
      ],
      related: [],
      build: false,
    });
    // prepare 由清单 `testProjects[].prepare` 派生，不写死命令名；它排在平台文件步骤之前。
    expect(commands[0]).toEqual({ command: 'pnpm', args: ['run', 'weapp:prepare'] });
    expect(commands[1]?.args).toEqual([
      'run',
      '--project',
      'weapp',
      'packages/e2e/tests/weapp/a.spec.ts',
    ]);
    // 非 perFile 项目一次跑完该项目选中的全部文件，只写一份报告，不互相覆盖。
    expect(commands[2]?.args).toEqual([
      'run',
      '--project',
      'integration',
      'packages/e2e/tests/protocol/b.spec.ts',
      'packages/e2e/tests/protocol/c.spec.ts',
    ]);
    const reports = commands
      .filter((step) => step.command === 'vitest')
      .map((step) => step.env?.VERIFY_REPORT_FILE);
    expect(reports).toEqual([
      join(process.cwd(), 'artifacts', runId, 'reports', 'weapp', 'a.json'),
      join(process.cwd(), 'artifacts', runId, 'reports', 'integration.json'),
    ]);
    expect(new Set(reports).size).toBe(reports.length);
  });

  it('unit related 命中却零用例时判失败，报告缺失或没有 related 时不误报', () => {
    const root = mkdtempSync(join(tmpdir(), 'affected-report-'));
    const runId = 'affected-20260101T000000Z';
    const related = ['scripts/lib/sample.ts'];
    const plan = {
      runId,
      base: 'HEAD',
      changed: [...related],
      selections: [],
      files: [],
      related,
      commands: [
        {
          command: 'vitest',
          args: ['related', ...related, '--project', 'test-tools-unit', '--run'],
        },
      ],
    };
    const report = join(root, 'artifacts', runId, 'reports', 'unit.json');
    const writeReport = (tests: ReadonlyArray<unknown>): void => {
      mkdirSync(dirname(report), { recursive: true });
      writeFileSync(report, JSON.stringify({ tests }));
    };
    try {
      // 报告缺失：按需运行没有产出证据，判失败。
      expect(affectedReportIssues(root, plan).join('\n')).toContain('unit 报告缺失或不可读');
      // 选中了改动文件却一个用例都没跑：判失败，不依赖 passWithNoTests。
      writeReport([]);
      expect(affectedReportIssues(root, plan).join('\n')).toContain('实际执行 0 个用例');
      // 有真实用例：通过。
      writeReport([{ file: 'scripts/lib/sample.test.ts', status: 'passed' }]);
      expect(affectedReportIssues(root, plan)).toEqual([]);
      // 没有 related 选择（或没有 related 步骤）时不做这项核对，避免误报。
      expect(affectedReportIssues(root, { ...plan, related: [] })).toEqual([]);
      expect(
        affectedReportIssues(root, {
          ...plan,
          commands: [{ command: 'vitest', args: ['run', '--project', 'integration', 'a.spec.ts'] }],
        }),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('spawnAffectedStep 按子进程退出码返回', () => {
    expect(spawnAffectedStep({ command: 'node', args: ['-e', 'process.exit(0)'] })).toBe(0);
    expect(spawnAffectedStep({ command: 'node', args: ['-e', 'process.exit(4)'] })).toBe(4);
    expect(spawnAffectedStep({ command: 'template-fixture-missing-command', args: [] })).toBe(1);
  });

  it('changedFilesSince 同时给出改动与未跟踪文件', { timeout: 30_000 }, () => {
    const fixture = createAffectedFixture();
    try {
      fixture.write(productSource, 'export const core = 2;\n');
      fixture.write('openspec/specs/extra/spec.md', '# extra\n');
      expect(changedFilesSince(fixture.root, 'HEAD')).toEqual([
        'openspec/specs/extra/spec.md',
        productSource,
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it('新增与删除 Spec 都计入变化的 Requirement', { timeout: 30_000 }, () => {
    const fixture = createAffectedFixture();
    try {
      fixture.write(
        'openspec/specs/extra/spec.md',
        '### Requirement: SAMPLE-C 新增需求\n\n正文。\n',
      );
      const created = changedFilesSince(fixture.root, 'HEAD');
      expect(changedRequirements(fixture.root, 'HEAD', created)).toEqual(['SAMPLE-C']);
      rmSync(join(fixture.root, specPath));
      expect(changedRequirements(fixture.root, 'HEAD', [specPath])).toEqual([
        'SAMPLE-A',
        'SAMPLE-B',
      ]);
      fixture.write(
        'openspec/specs/edge/spec.md',
        [
          '### Requirement: SAMPLE-D 段落边界需求',
          '',
          '正文。',
          '',
          '## 附录',
          '',
          '附录正文。',
          '',
        ].join('\n'),
      );
      expect(changedRequirements(fixture.root, 'HEAD', ['openspec/specs/edge/spec.md'])).toEqual([
        'SAMPLE-D',
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it('写入 partial 报告后门禁拒收，全量报告被接受', { timeout: 30_000 }, async () => {
    const fixture = createAffectedFixture();
    try {
      enableInventory(fixture.root);
      const runId = 'affected-20260101T000000Z';
      const report = join(fixture.root, 'artifacts', runId, 'reports', 'integration.json');
      fixture.write(
        'artifacts/' + runId + '/reports/integration.json',
        JSON.stringify({
          runId,
          sourceDigest: 'stub',
          specDigest: 'stub',
          protocolDigest: 'stub',
          fixtureDigest: 'stub',
          partial: true,
          tests: [],
        }),
      );
      const rejected = await runScenariosCli(
        ['--report', report],
        fixture.root,
        { VERIFY_RUN_ID: runId },
        () => ({ status: 0, stdout: '', stderr: '' }),
      );
      expect(rejected.exitCode).toBe(1);
      expect(rejected.output.issues.join('\n')).toContain('partial 报告');
      expect('summaries' in rejected.output).toBe(false);
      expect((await loadReporterOutputs([report])).partial).toEqual([report]);
      fixture.writeFullReport(report, runId);
      const accepted = await runScenariosCli(
        ['--report', report],
        fixture.root,
        { VERIFY_RUN_ID: runId },
        () => ({ status: 0, stdout: '', stderr: '' }),
      );
      expect(accepted.output.issues.join('\n')).not.toContain('partial 报告');
      expect('summaries' in accepted.output).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});

/** 020 module case：全量触发的 8 类条件与触发原因打印。 */
evidence(
  'SCN-SCENARIO-GATE-020',
  'full-trigger-rules',
  ['full-run-triggers', 'trigger-reason-printed'],
  async (context, check) => {
    const manifest = loadProjectManifest(process.cwd());
    const testDirectory = 'packages/e2e';
    await check('full-run-triggers', () => {
      const cases: ReadonlyArray<readonly [string, string]> = [
        ['project.manifest.json', '清单文件'],
        ['tsconfig.test.json', '构建输入'],
        ['proto-gen.lock', '协议来源输入'],
        ['packages/e2e/vitest.config.unit.ts', '工具配置'],
        ['package.json', '构建输入'],
        ['packages/protocol/src/adapters/network/wechat.ts', '平台适配目录'],
        ['packages/e2e/host/weapp/app.js', '宿主目录'],
        ['packages/e2e/src/drivers/weapp.ts', '驱动目录'],
      ];
      for (const [path, label] of cases) {
        const reasons = fullTriggers(manifest, [path], testDirectory);
        expect(reasons, path).toHaveLength(1);
        expect(reasons[0], path).toContain(path);
        expect(reasons[0], path).toContain(label);
      }
      expect(
        fullTriggers(manifest, ['packages/sdk/src/runtime/default.ts'], testDirectory),
      ).toEqual([]);
    });
    const fixture = createAffectedFixture();
    try {
      fixture.write('packages/e2e/src/drivers/platform.ts', 'export const driver = 2;\n');
      const plan = await planFor(fixture);
      await check('trigger-reason-printed', () => {
        expect(plan.full?.command).toBe('check:fast');
        expect(plan.commands).toEqual([{ command: 'pnpm', args: ['check:fast'] }]);
        const printed = formatAffectedPlan(plan);
        expect(printed).toContain('全量触发：pnpm check:fast');
        expect(printed).toContain('packages/e2e/src/drivers/platform.ts');
        expect(printed).toContain('驱动目录（全量触发）');
      });
      void context;
    } finally {
      fixture.cleanup();
    }
  },
);

/** 021 module case：Spec、Fixture、代码、scripts、环境扩展与计划打印。 */
evidence(
  'SCN-SCENARIO-GATE-021',
  'affected-selection-rules',
  [
    'spec-digest-selection',
    'fixture-owner-selection',
    'code-import-selection',
    'build-before-run',
    'unit-related-selection',
    'all-environments-expanded',
    'tooling-selection',
    'explicit-scenario',
    'plan-printed',
  ],
  async (context, check) => {
    const codeFixture = createAffectedFixture();
    const specFixture = createAffectedFixture();
    const toolingFixture = createAffectedFixture();
    const fixtureManifest = loadProjectManifest(codeFixture.root);
    try {
      // 代码改动：产品包 src 中只被 integration 用例经包名间接导入的源文件。
      codeFixture.write(productSource, 'export const core = 2;\n');
      const codePlan = await planFor(codeFixture);
      await check('code-import-selection', () => {
        expect(changedFilesSince(codeFixture.root, 'HEAD')).toContain(productSource);
        expect(reasonOf(codePlan.selections, 'SCN-SAMPLE-A-001')).toContain(
          '代码改动经依赖分析到达',
        );
        expect(codePlan.files).toContainEqual({
          project: 'integration',
          className: 'integration',
          file: integrationSpec,
        });
        const analysis = JSON.parse(analysisTsconfig(codeFixture.root, fixtureManifest)) as {
          compilerOptions: { paths: Record<string, string[]> };
        };
        expect(analysis.compilerOptions.paths['@sample/product']).toEqual([
          'packages/sample-product/src/index.ts',
        ]);
      });
      await check('build-before-run', () => {
        expect(codePlan.commands[0]).toEqual({ command: 'pnpm', args: ['build'] });
      });
      await check('unit-related-selection', () => {
        expect(codePlan.related).toContain(productSource);
        const related = codePlan.commands.find((step) => step.args[0] === 'related');
        expect(related?.args).toContain(productSource);
        expect(related?.args).toContain('--project');
        expect(related?.args).toContain('product-unit');
        expect(related?.args).toContain('test-tools-unit');
        // 每个 unit 项目必须单独跟在 `--project` 之后：空格分隔的其余项目名会被 Vitest 当成路径过滤器。
        for (const project of ['product-unit', 'test-tools-unit']) {
          const index = related?.args.indexOf(project) ?? -1;
          expect(index).toBeGreaterThan(0);
          expect(related?.args[index - 1]).toBe('--project');
        }
        expect(related?.args).not.toContain('--coverage');
        expect(related?.env?.TEST_AFFECTED_PARTIAL).toBe('1');
      });
      await check('all-environments-expanded', () => {
        expect(codePlan.files).toContainEqual({
          project: 'sample-platform',
          className: 'platform',
          file: platformSpec,
        });
      });

      // Spec 与 Fixture 改动：正文变化选中，纯空白变化不选中，Fixture 目录名即 owner。
      const original = specFixture.read(specPath);
      const bodyChanged = original
        .replace(
          '夹具 SHALL 覆盖按需选择的检查点。',
          '夹具 SHALL 覆盖按需选择的检查点，并保持正文变化可见。',
        )
        .replace('不动 SHOULD 保持稳定。', '不动 SHOULD 保持稳定。\n');
      if (bodyChanged === original) throw new Error('fixture spec text not found');
      specFixture.write(specPath, bodyChanged);
      specFixture.write(fixtureFile, '{"v":2}\n');
      const specPlan = await planFor(specFixture);
      await check('spec-digest-selection', () => {
        expect(reasonOf(specPlan.selections, 'SCN-SAMPLE-A-001')).toContain(
          'Requirement SAMPLE-A 摘要变化',
        );
        expect(reasonOf(specPlan.selections, 'FLOW-SAMPLE-A-001')).toContain(
          'Requirement SAMPLE-A 摘要变化',
        );
        expect(specPlan.selections.map((item) => item.id)).not.toContain('SCN-SAMPLE-B-002');
      });
      await check('fixture-owner-selection', () => {
        expect(
          fixtureSelections([fixtureFile, 'packages/e2e/tests/fixtures/base.json'], 'packages/e2e'),
        ).toEqual([
          { id: 'SCN-SAMPLE-A-001', reason: 'Fixture SCN-SAMPLE-A-001 目录下的文件变化' },
        ]);
        expect(reasonOf(specPlan.selections, 'SCN-SAMPLE-A-001')).toContain(
          'Fixture SCN-SAMPLE-A-001 目录下的文件变化',
        );
      });
      await check('explicit-scenario', async () => {
        const explicit = await planFor(specFixture, ['SCN-SAMPLE-B-002']);
        expect(reasonOf(explicit.selections, 'SCN-SAMPLE-B-002')).toBe('--scenario 直接指定');
      });
      await check('plan-printed', () => {
        const printed = formatAffectedPlan(specPlan);
        expect(printed).toContain('选中 ID（');
        expect(printed).toContain('SCN-SAMPLE-A-001  原因：');
        expect(printed).toContain('测试文件（');
        expect(printed).toContain(integrationSpec);
        expect(printed).toContain('步骤（');
        expect(formatAffectedPlan(codePlan)).toContain(`vitest related 改动文件（1）：`);
        expect(formatAffectedPlan(codePlan)).toContain(`  ${productSource}`);
      });

      // scripts 改动：选中相关单测与引用该模块的 tooling 用例，且不加入构建步骤。
      toolingFixture.write(scriptsSource, 'export const sampled = 2;\n');
      const toolingPlan = await planFor(toolingFixture);
      await check('tooling-selection', () => {
        expect(reasonOf(toolingPlan.selections, 'SCN-SAMPLE-TOOL-009')).toContain(
          '代码改动经依赖分析到达',
        );
        expect(toolingPlan.files).toContainEqual({
          project: 'integration',
          className: 'integration',
          file: toolingSpec,
        });
        const related = toolingPlan.commands.find((step) => step.args[0] === 'related');
        expect(related?.args).toContain(scriptsSource);
        expect(related?.args).toContain('test-tools-unit');
        expect(toolingPlan.commands.some((step) => step.args[0] === 'build')).toBe(false);
      });
      void context;
    } finally {
      codeFixture.cleanup();
      specFixture.cleanup();
      toolingFixture.cleanup();
    }
  },
);

/** 022 module case：partial 标记、门禁拒收与全量重跑接受。 */
evidence(
  'SCN-SCENARIO-GATE-022',
  'partial-report-rules',
  ['partial-marked', 'partial-rejected', 'full-rerun-accepted'],
  async (context, check) => {
    const fixture = createAffectedFixture();
    try {
      enableInventory(fixture.root);
      const runId = affectedRunId();
      const report = join(fixture.root, 'artifacts', runId, 'reports', 'integration.json');
      await check('partial-marked', async () => {
        expect(runId).toMatch(/^affected-\d{8}T\d{6}Z$/);
        const options = {
          runId,
          fingerprints: {
            sourceDigest: 'a',
            specDigest: 'b',
            protocolDigest: 'c',
            fixtureDigest: 'd',
            files: {},
          },
          outputFile: report,
        };
        const partialReporter = new ScenarioReporter({ ...options, partial: true });
        const fullReporter = new ScenarioReporter(options);
        await partialReporter.onTestRunEnd();
        expect(
          JSON.parse(fixture.read(`artifacts/${runId}/reports/integration.json`)),
        ).toMatchObject({ partial: true });
        await fullReporter.onTestRunEnd();
        expect(
          'partial' in
            (JSON.parse(fixture.read(`artifacts/${runId}/reports/integration.json`)) as object),
        ).toBe(false);
      });
      fixture.write(
        `artifacts/${runId}/reports/integration.json`,
        JSON.stringify({
          runId,
          sourceDigest: 'stub',
          specDigest: 'stub',
          protocolDigest: 'stub',
          fixtureDigest: 'stub',
          partial: true,
          tests: [],
        }),
      );
      await check('partial-rejected', async () => {
        const loaded = await loadReporterOutputs([report]);
        expect(loaded.partial).toEqual([report]);
        expect(loaded.issues.join('\n')).toContain('partial 报告');
        const result = await runScenariosCli(
          ['--report', report],
          fixture.root,
          { VERIFY_RUN_ID: runId },
          () => ({ status: 0, stdout: '', stderr: '' }),
        );
        expect(result.exitCode).toBe(1);
        expect('summaries' in result.output).toBe(false);
        const inventory = await runScenariosCli(
          ['--report', report, '--inventory'],
          fixture.root,
          { VERIFY_RUN_ID: runId },
          () => ({ status: 0, stdout: '', stderr: '' }),
        );
        expect(inventory.exitCode).toBe(1);
        expect('mode' in inventory.output && inventory.output.mode).toBe('inventory');
      });
      await check('full-rerun-accepted', async () => {
        fixture.writeFullReport(report, runId);
        const result = await runScenariosCli(
          ['--report', report],
          fixture.root,
          { VERIFY_RUN_ID: runId },
          () => ({ status: 0, stdout: '', stderr: '' }),
        );
        expect(result.output.issues.join('\n')).not.toContain('partial 报告');
        expect('summaries' in result.output).toBe(true);
      });
      void context;
    } finally {
      fixture.cleanup();
    }
  },
);

it('scanCaseBindings 读取受控根里的全部绑定', { timeout: 30_000 }, () => {
  const fixture = createAffectedFixture();
  try {
    const bindings = scanCaseBindings(fixture.root, loadProjectManifest(fixture.root));
    expect(bindings.map((item) => item.file).sort()).toEqual(
      [integrationSpec, platformSpec, toolingSpec, flowSpec].sort(),
    );
  } finally {
    fixture.cleanup();
  }
});

it('未跟踪文件的目录被忽略时不进入改动集合', { timeout: 30_000 }, () => {
  const fixture = createAffectedFixture();
  try {
    const directory = mkdtempSync(join(tmpdir(), 'affected-extra-'));
    writeFileSync(join(directory, 'note.md'), 'x\n');
    expect(changedFilesSince(fixture.root, 'HEAD')).toEqual([]);
    rmSync(directory, { recursive: true, force: true });
  } finally {
    fixture.cleanup();
  }
});
