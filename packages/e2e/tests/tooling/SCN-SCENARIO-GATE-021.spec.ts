import { cliEvidence } from './scenario-gate-helpers.ts';
import { createAffectedFixture } from './affected-fixture.ts';

const specPath = 'openspec/specs/sample/spec.md';
const fixtureFile = 'packages/e2e/tests/fixtures/SCN-SAMPLE-A-001/base.json';
const productSource = 'packages/sample-product/src/core.ts';
const scriptsSource = 'scripts/lib/affected-sample.ts';
const integrationSpec = 'packages/e2e/tests/example/SCN-SAMPLE-A-001.spec.ts';
const platformSpec = 'packages/e2e/tests/weapp/SCN-SAMPLE-A-001.spec.ts';
const toolingSpec = 'packages/e2e/tests/tooling/SCN-SAMPLE-TOOL-009.spec.ts';

/** 021 工程证据：Spec 与 Fixture 改动、直接指定 ID、计划打印。 */
cliEvidence(
  'SCN-SCENARIO-GATE-021',
  'affected-spec-fixture-cli',
  ['spec-digest-selection', 'fixture-owner-selection', 'explicit-scenario', 'plan-printed'],
  async (context, check) => {
    const fixture = createAffectedFixture();
    try {
      const original = fixture.read(specPath);
      fixture.write(
        specPath,
        original
          .replace(
            '夹具 SHALL 覆盖按需选择的检查点。',
            '夹具 SHALL 覆盖按需选择的检查点，并保持正文变化可见。',
          )
          .replace('不动 SHOULD 保持稳定。', '不动 SHOULD 保持稳定。\n'),
      );
      fixture.write(fixtureFile, '{"v":2}\n');
      const changed = fixture.run(['--dry-run']);
      const explicit = fixture.run(['--scenario', 'SCN-SAMPLE-B-002', '--dry-run']);
      await check('spec-digest-selection', () => {
        context.expect(changed.status).toBe(0);
        context.expect(changed.output).toContain('SCN-SAMPLE-A-001');
        context.expect(changed.output).toContain('FLOW-SAMPLE-A-001');
        context.expect(changed.output).toContain('Requirement SAMPLE-A 摘要变化');
        context.expect(changed.output).not.toContain('SCN-SAMPLE-B-002');
      });
      await check('fixture-owner-selection', () => {
        context.expect(changed.output).toContain('Fixture SCN-SAMPLE-A-001 目录下的文件变化');
      });
      await check('explicit-scenario', () => {
        context.expect(explicit.status).toBe(0);
        context.expect(explicit.output).toContain('SCN-SAMPLE-B-002  原因：--scenario 直接指定');
      });
      await check('plan-printed', () => {
        context.expect(changed.output).toContain('选中 ID（');
        context.expect(changed.output).toContain('测试文件（');
        context.expect(changed.output).toContain('步骤（');
        context.expect(changed.output).toContain(integrationSpec);
      });
    } finally {
      fixture.cleanup();
    }
  },
);

/** 021 工程证据：代码改动经 `--reaches` 选择、先构建、unit related、环境扩展与 scripts 选择。 */
cliEvidence(
  'SCN-SCENARIO-GATE-021',
  'affected-code-cli',
  [
    'code-import-selection',
    'build-before-run',
    'unit-related-selection',
    'all-environments-expanded',
    'tooling-selection',
    'plan-printed',
  ],
  async (context, check) => {
    const fixture = createAffectedFixture();
    try {
      fixture.write(productSource, 'export const core = 2;\n');
      fixture.write(scriptsSource, 'export const sampled = 2;\n');
      const result = fixture.run(['--dry-run']);
      await check('code-import-selection', () => {
        context.expect(result.status).toBe(0);
        context.expect(result.output).toContain('代码改动经依赖分析到达');
        context.expect(result.output).toContain(integrationSpec);
      });
      await check('build-before-run', () => {
        context.expect(result.output).toContain('1. pnpm build');
      });
      await check('unit-related-selection', () => {
        const related = result.output
          .split('\n')
          .find((line) => line.includes('vitest related') && line.includes(productSource));
        context.expect(related).toBeDefined();
        context.expect(related).toContain('test-tools-unit');
        context.expect(result.output).not.toContain('--coverage');
      });
      await check('all-environments-expanded', () => {
        context.expect(result.output).toContain(platformSpec);
        context.expect(result.output).toContain('sample-platform[platform]');
      });
      await check('tooling-selection', () => {
        context.expect(result.output).toContain(toolingSpec);
        context
          .expect(
            result.output
              .split('\n')
              .some((line) => line.includes('vitest related') && line.includes(scriptsSource)),
          )
          .toBe(true);
      });
      await check('plan-printed', () => {
        context.expect(result.output).toContain('步骤（');
        context.expect(result.output).toContain('原因：');
      });
    } finally {
      fixture.cleanup();
    }
  },
);
