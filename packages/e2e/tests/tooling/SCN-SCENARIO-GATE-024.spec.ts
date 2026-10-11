import { cliEvidence } from './scenario-gate-helpers.ts';
import { createVerifyFixture, type VerifyInvocation } from './verify-gate-helpers.ts';

const labels = (invocations: ReadonlyArray<VerifyInvocation>) =>
  invocations.map((invocation) => invocation.label);
const files = (invocations: ReadonlyArray<VerifyInvocation>) =>
  invocations
    .filter((invocation) => invocation.label === 'vitest')
    .map((invocation) => invocation.file);

cliEvidence(
  'SCN-SCENARIO-GATE-024',
  'verify-resume-cli',
  ['stop-on-failure', 'per-file-retry', 'resume-hint', 'resume-from-step', 'per-file-resume'],
  async (context, check) => {
    const fixture = createVerifyFixture();
    try {
      // 非 perFile 平台项目失败：停止后续步骤并非零退出，打印 --from 续跑提示。
      fixture.setFailures({ 'sample-platform': 1 });
      fixture.clearInvocations();
      const blocked = fixture.run(['--run-id', 'stopped']);
      const blockedInvocations = fixture.invocations();

      // 续跑该步：跳过 check:fast，从平台项目起继续，直到门禁步骤。
      fixture.setFailures({});
      fixture.clearInvocations();
      fixture.run(['--from', 'test:e2e:sample-platform', '--run-id', 'stopped']);
      const resumedInvocations = fixture.invocations();

      // perFile 项目第 2 个文件首次失败：重跑前再执行一次 prepare，重跑通过后继续。
      fixture.setFailures({ 'second.spec.ts': 1 });
      fixture.clearInvocations();
      fixture.run(['--run-id', 'retry']);
      const retriedInvocations = fixture.invocations();

      // perFile 项目第 2 个文件首次与重跑都失败：停止并给出该步的续跑提示。
      fixture.setFailures({ 'second.spec.ts': 9 });
      fixture.clearInvocations();
      const exhausted = fixture.run(['--run-id', 'resume']);
      const exhaustedInvocations = fixture.invocations();

      // perFile 项目续跑：跳过已有通过报告的文件，只运行失败文件及其后的文件。
      fixture.setFailures({});
      fixture.clearInvocations();
      fixture.run(['--from', 'test:e2e:device-platform', '--run-id', 'resume']);
      const resumedFileInvocations = fixture.invocations();

      await check('stop-on-failure', () => {
        context.expect(blocked.status).not.toBe(0);
        context
          .expect(labels(blockedInvocations), blocked.output)
          .toEqual(['check:fast', 'test:e2e:sample-platform']);
      });

      await check('per-file-retry', () => {
        context
          .expect(labels(retriedInvocations))
          .toEqual([
            'check:fast',
            'test:e2e:sample-platform',
            'weapp:prepare',
            'vitest',
            'weapp:prepare',
            'vitest',
            'weapp:prepare',
            'vitest',
            'check:scenarios',
          ]);
        context
          .expect(files(retriedInvocations))
          .toEqual(['first.spec.ts', 'second.spec.ts', 'second.spec.ts']);
      });

      await check('resume-hint', () => {
        context
          .expect(blocked.output)
          .toContain('--from test:e2e:sample-platform --run-id stopped');
        context
          .expect(exhausted.output)
          .toContain('--from test:e2e:device-platform --run-id resume');
      });

      await check('resume-from-step', () => {
        context.expect(labels(resumedInvocations)).not.toContain('check:fast');
        context.expect(labels(resumedInvocations)).toContain('test:e2e:sample-platform');
        // 平台步骤成功才会继续到门禁步骤。
        context.expect(labels(resumedInvocations)).toContain('check:scenarios');
      });

      await check('per-file-resume', () => {
        // 首次运行：第 2 个文件两次失败后停止，不再运行第 3 个文件与门禁步骤。
        context.expect(exhausted.status).not.toBe(0);
        context
          .expect(files(exhaustedInvocations))
          .toEqual(['first.spec.ts', 'second.spec.ts', 'second.spec.ts']);
        context.expect(labels(exhaustedInvocations)).not.toContain('check:scenarios');
        // 续跑：已有通过报告的 first.spec.ts 被跳过，只运行失败的 second.spec.ts 及其后文件。
        context.expect(files(resumedFileInvocations)).toEqual(['second.spec.ts']);
        context.expect(labels(resumedFileInvocations)).toContain('weapp:prepare');
        context.expect(labels(resumedFileInvocations)).toContain('check:scenarios');
      });
    } finally {
      fixture.cleanup();
    }
  },
  // 演练全量并发下实测 28.66s，逼近默认 30s；这一条要跑多次 verify（首次、失败重跑、续跑），
  // 按已授权的副本/重负载超时规则提到 60s，避免与用例语义无关的计时抖动。
  { timeoutMs: 60_000 },
);
