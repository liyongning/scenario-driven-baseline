import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cliEvidence, enableInventory } from './scenario-gate-helpers.ts';
import { createAffectedFixture, repositoryRoot } from './affected-fixture.ts';

/** 022 工程证据：按需运行写 partial 报告、门禁拒收、同一 run id 全量重跑后恢复对账。 */
cliEvidence(
  'SCN-SCENARIO-GATE-022',
  'partial-report-cli',
  ['partial-marked', 'partial-rejected', 'full-rerun-accepted'],
  async (context, check) => {
    const fixture = createAffectedFixture();
    try {
      const run = fixture.run(['--scenario', 'SCN-SAMPLE-A-001']);
      const match = /run id (affected-\d{8}T\d{6}Z)/.exec(run.output);
      const runId = match?.[1] ?? '';
      // 非 perFile 项目一次跑完选中的全部文件、只写一份报告；平台项目逐文件各写一份。
      const reports = {
        integration: join(fixture.root, 'artifacts', runId, 'reports', 'integration.json'),
        platform: join(
          fixture.root,
          'artifacts',
          runId,
          'reports',
          'sample-platform',
          'SCN-SAMPLE-A-001.json',
        ),
      };
      await check('partial-marked', () => {
        context.expect(run.status).toBe(0);
        context.expect(runId).toMatch(/^affected-\d{8}T\d{6}Z$/);
        for (const report of Object.values(reports))
          context.expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({
            partial: true,
            runId,
          });
        // 同一次按需运行里，平台文件运行前必须执行清单登记的 prepare（替身 pnpm 记录了这次调用）。
        context.expect(fixture.pnpmCalls()).toContain('run weapp:prepare');
      });
      enableInventory(fixture.root);
      const rejected = fixture.gate([], { VERIFY_RUN_ID: runId });
      await check('partial-rejected', () => {
        context.expect(rejected.status).not.toBe(0);
        context.expect(rejected.stdout).toContain('partial 报告');
        context.expect(rejected.stdout).toContain('integration.json');
        context.expect('summaries' in JSON.parse(rejected.stdout)).toBe(false);
      });
      await check('full-rerun-accepted', () => {
        context
          .expect(readFileSync(resolve(repositoryRoot, 'scripts/verify.ts'), 'utf8'))
          .not.toContain('TEST_AFFECTED_PARTIAL');
        fixture.writeFullReport(reports.integration, runId);
        fixture.writeFullReport(reports.platform, runId);
        const accepted = fixture.gate([], { VERIFY_RUN_ID: runId });
        context.expect(accepted.stdout).not.toContain('partial 报告');
        context.expect('summaries' in JSON.parse(accepted.stdout)).toBe(true);
      });
    } finally {
      fixture.cleanup();
    }
  },
);
