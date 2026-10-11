import { join } from 'node:path';
import { expect, test, type TestContext } from 'vitest';
import { ScenarioReporter } from '../packages/e2e/src/reporters/scenario-reporter.ts';
import {
  createAffectedFixture,
  type AffectedFixture,
} from '../packages/e2e/tests/tooling/affected-fixture.ts';
import { enableInventory } from '../packages/e2e/tests/tooling/scenario-gate-helpers.ts';
import { loadReporterOutputs, runScenariosCli } from './check-scenarios.ts';
import {
  affectedRunId,
  analysisTsconfig,
  changedFilesSince,
  fixtureSelections,
  formatAffectedPlan,
  fullTriggers,
  planAffected,
} from './test-affected.ts';
import { loadProjectManifest } from './lib/project-manifest.ts';

// 按需入口的 module 证据从 `test-affected.test.ts` 拆出：证据用例与依赖路径用例各自成文件，
// 保持在行数上限内；场景绑定按 case 的 meta 登记，不依赖具体文件。

const specPath = 'openspec/specs/sample/spec.md';
const fixtureFile = 'packages/e2e/tests/fixtures/SCN-SAMPLE-A-001/base.json';
const productSource = 'packages/sample-product/src/core.ts';
const integrationSpec = 'packages/e2e/tests/example/SCN-SAMPLE-A-001.spec.ts';
const platformSpec = 'packages/e2e/tests/weapp/SCN-SAMPLE-A-001.spec.ts';
const toolingSpec = 'packages/e2e/tests/tooling/SCN-SAMPLE-TOOL-009.spec.ts';
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

/** 020 module case：全量触发的 8 类条件与触发原因打印。 */
evidence(
  'SCN-SCENARIO-GATE-020',
  'full-trigger-rules',
  ['full-run-triggers', 'trigger-reason-printed'],
  async (context, check) => {
    const fixture = createAffectedFixture();
    try {
      // 受控根自带清单：全量触发规则不读仓库根，示例删除后仍成立（concrete-assertions 扫描范围见 SCN-026）。
      const manifest = loadProjectManifest(fixture.root);
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
          fullTriggers(manifest, ['packages/sample-product/src/core.ts'], testDirectory),
        ).toEqual([]);
      });
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
