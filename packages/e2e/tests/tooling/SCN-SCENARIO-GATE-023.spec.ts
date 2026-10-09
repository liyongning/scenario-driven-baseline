import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  createVerifyFixture,
  repositoryRoot,
  type VerifyInvocation,
} from './verify-gate-helpers.ts';

const orderedLabels = [
  'check:fast',
  'test:e2e:sample-platform',
  'weapp:prepare',
  'vitest',
  'weapp:prepare',
  'vitest',
  'check:scenarios',
];

const labels = (invocations: ReadonlyArray<VerifyInvocation>) =>
  invocations.map((invocation) => invocation.label);

cliEvidence(
  'SCN-SCENARIO-GATE-023',
  'verify-run-cli',
  [
    'default-run-id',
    'shared-run-id',
    'ordered-steps',
    'platform-from-manifest',
    'per-file-run',
    'change-env-propagated',
    'default-report-set',
    'summary-printed',
    'check-calls-verify',
  ],
  async (context, check) => {
    const fixture = createVerifyFixture();
    try {
      fixture.clearInvocations();
      const scoped = fixture.run(['--change', 'A']);
      const scopedInvocations = fixture.invocations();
      fixture.clearInvocations();
      const pinned = fixture.run(['--run-id', 'x']);
      const pinnedInvocations = fixture.invocations();
      const runId = scopedInvocations[0]?.runId ?? '';

      await check('default-run-id', () => {
        // 夹具分支为 feat/scope：分支名中的 `/` 替换为 -，时间戳为 UTC 的 YYYYMMDDTHHmmssZ。
        context.expect(runId).toMatch(/^feat-scope-\d{8}T\d{6}Z$/);
        context.expect(pinnedInvocations[0]?.runId).toBe('x');
      });

      await check('shared-run-id', () => {
        context
          .expect(scopedInvocations.every((invocation) => invocation.runId === runId))
          .toBe(true);
        context
          .expect(pinnedInvocations.every((invocation) => invocation.runId === 'x'))
          .toBe(true);
        context.expect(runId).not.toBe('x');
      });

      await check('ordered-steps', () => {
        context.expect(labels(scopedInvocations)).toEqual(orderedLabels);
      });

      await check('platform-from-manifest', () => {
        // 第 2 步按清单为两个 platform 类项目执行：整体项目一次，perFile 项目逐文件。
        const perFile = scopedInvocations.filter((invocation) => invocation.label === 'vitest');
        context.expect(perFile).toHaveLength(2);
        context
          .expect(perFile.map((invocation) => invocation.project))
          .toEqual(['device-platform', 'device-platform']);
        context.expect(labels(scopedInvocations)).not.toContain('unexpected');
        context.expect(labels(scopedInvocations)).not.toContain('test:e2e:device-platform');
      });

      await check('per-file-run', () => {
        const reports = join(fixture.root, 'artifacts', runId, 'reports', 'device-platform');
        context.expect(existsSync(join(reports, 'first.json'))).toBe(true);
        context.expect(existsSync(join(reports, 'second.json'))).toBe(true);
        // 每个文件运行前都执行一次 prepare：prepare/first、prepare/second。
        context
          .expect(labels(scopedInvocations).slice(2, 6))
          .toEqual(['weapp:prepare', 'vitest', 'weapp:prepare', 'vitest']);
      });

      await check('change-env-propagated', () => {
        context
          .expect(scopedInvocations.every((invocation) => invocation.changeScope === 'A'))
          .toBe(true);
        context
          .expect(pinnedInvocations.every((invocation) => invocation.changeScope === undefined))
          .toBe(true);
        // 真实门禁按作用域合并：A 运行时看不到 B 的增量场景，不带作用域时两者都在。
        context.expect(scoped.output).toContain('SCN-SAMPLE-VERIFY-002');
        context.expect(scoped.output).not.toContain('SCN-SAMPLE-VERIFY-003');
        context.expect(pinned.output).toContain('SCN-SAMPLE-VERIFY-003');
      });

      await check('default-report-set', () => {
        // 门禁不带报告参数：读取的默认集合含 unit.json、非 perFile 项目报告与 perFile 目录下全部文件。
        for (const relative of [
          'reports/unit.json',
          'reports/integration.json',
          'reports/sample-platform.json',
          'reports/device-platform/first.json',
          'reports/device-platform/second.json',
        ])
          context.expect(pinned.output).toContain(`artifacts/x/${relative}`);
      });

      await check('summary-printed', () => {
        context.expect(scoped.output).toContain('check:fast');
        context.expect(scoped.output).toContain('通过');
        context.expect(scoped.output).toMatch(/\d+ms/);
      });

      await check('check-calls-verify', () => {
        const scripts =
          (
            JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
              scripts?: Record<string, string>;
            }
          ).scripts ?? {};
        context.expect(scripts.check).toContain('verify');
      });
    } finally {
      fixture.cleanup();
    }
  },
);
