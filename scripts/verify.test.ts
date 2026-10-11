import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, test, type TestContext } from 'vitest';
import {
  createControlledRoot,
  minimalManifest,
  type ControlledRoot,
} from '../packages/e2e/tests/tooling/controlled-root.ts';
import { defaultReportPaths, loadProjectManifest } from './lib/project-manifest.ts';
import {
  defaultRunId,
  formatUtcTimestamp,
  gitBranch,
  planVerify,
  reportNameForFile,
  runVerify,
  runVerifyCli,
  type VerifyExecute,
  type VerifyPlan,
} from './verify.ts';

const roots: ControlledRoot[] = [];
const verifyContext = { branch: 'feat/scope', now: new Date('2026-01-02T03:04:05Z') };

/** 与 check-scenarios.test.ts 相同的 module 证据登记方式：每个 case 一段可核对断言。 */
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
      // 用例读取 Vitest 项目配置并按清单组装命令；与 cliEvidence 一致给 30s。
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

/** 受控根：清单登记一个整体运行与一个逐文件运行的 platform 项目，逐文件项目含 2 个文件。 */
function fixture(
  options: Readonly<{ perFilePrepare?: boolean; configInclude?: string }> = {},
): ControlledRoot {
  const manifest = minimalManifest();
  (manifest.testProjects as unknown[]).push(
    {
      name: 'sample-platform',
      class: 'platform',
      config: 'packages/sample-test/vitest.config.sample.ts',
    },
    {
      name: 'device-platform',
      class: 'platform',
      config: 'verify-fixture/vitest.config.device.mjs',
      perFile: true,
      ...(options.perFilePrepare === false ? {} : { prepare: 'weapp:prepare' }),
    },
  );
  const controlled = createControlledRoot({
    manifest,
    files: {
      'verify-fixture/vitest.config.device.mjs':
        options.configInclude ??
        'export default { test: { include: ["verify-fixture/device/*.spec.ts"] } };',
      'verify-fixture/device/one.spec.ts': '// 占位\n',
      'verify-fixture/device/two.spec.ts': '// 占位\n',
    },
    prefix: 'verify-unit-',
  });
  roots.push(controlled);
  return controlled;
}

type Call = Readonly<{ argv: ReadonlyArray<string>; env: Readonly<Record<string, string>> }>;

/** 记录调用的替身执行器；回调按调用序号给出退出码。 */
function recorder(script: (call: Call, index: number) => number = () => 0) {
  const calls: Call[] = [];
  const execute: VerifyExecute = (argv, env) => {
    const call = { argv: [...argv], env };
    const code = script(call, calls.length);
    calls.push(call);
    return code;
  };
  return { calls, execute };
}

/** 步骤命令名：`pnpm run <name>` 与 `pnpm exec vitest ...` 的第三项。 */
const stepName = (call: Call) => call.argv[2] ?? '';

function perFileStep(plan: VerifyPlan, name: string) {
  const step = plan.steps.find((item) => item.name === name);
  if (!step || step.kind !== 'per-file') throw new Error(`${name} is not a per-file step`);
  return step;
}

function writeReport(root: string, runId: string, name: string, content: string) {
  const directory = join(root, 'artifacts', runId, 'reports', 'device-platform');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), content);
}

afterEach(() => {
  for (const root of roots.splice(0)) root.cleanup();
});

evidence(
  'SCN-SCENARIO-GATE-023',
  'verify-plan-rules',
  [
    'default-run-id',
    'shared-run-id',
    'ordered-steps',
    'platform-from-manifest',
    'per-file-run',
    'change-env-propagated',
    'default-report-set',
    'summary-printed',
  ],
  async (context, check) => {
    const controlled = fixture();

    await check('default-run-id', () => {
      context.expect(formatUtcTimestamp(verifyContext.now)).toBe('20260102T030405Z');
      context
        .expect(defaultRunId('feat/scope', verifyContext.now))
        .toBe('feat-scope-20260102T030405Z');
      context.expect(defaultRunId(null, verifyContext.now)).toBe('detached-20260102T030405Z');
      context.expect(defaultRunId('', verifyContext.now)).toBe('detached-20260102T030405Z');
      context.expect(defaultRunId('HEAD', verifyContext.now)).toBe('detached-20260102T030405Z');
    });

    await check('shared-run-id', async () => {
      const pinned = recorder();
      const result = await runVerify(
        controlled.root,
        { runId: 'x' },
        pinned.execute,
        verifyContext,
      );
      context.expect(result.runId).toBe('x');
      context.expect(pinned.calls.every((call) => call.env.VERIFY_RUN_ID === 'x')).toBe(true);
      const generated = await planVerify(controlled.root, {}, verifyContext);
      context.expect(generated.runId).toBe('feat-scope-20260102T030405Z');
    });

    await check('ordered-steps', async () => {
      const pinned = recorder();
      await runVerify(controlled.root, { runId: 'x' }, pinned.execute, verifyContext);
      context.expect(pinned.calls.map((call) => call.argv)).toEqual([
        ['pnpm', 'run', 'check:fast'],
        ['pnpm', 'run', 'test:e2e:sample-platform'],
        ['pnpm', 'run', 'weapp:prepare'],
        [
          'pnpm',
          'exec',
          'vitest',
          'run',
          '--project',
          'device-platform',
          'verify-fixture/device/one.spec.ts',
        ],
        ['pnpm', 'run', 'weapp:prepare'],
        [
          'pnpm',
          'exec',
          'vitest',
          'run',
          '--project',
          'device-platform',
          'verify-fixture/device/two.spec.ts',
        ],
        ['pnpm', 'run', 'check:scenarios'],
      ]);
    });

    await check('platform-from-manifest', async () => {
      const plan = await planVerify(controlled.root, { runId: 'x' }, verifyContext);
      context
        .expect(plan.steps.map((step) => step.name))
        .toEqual([
          'check:fast',
          'test:e2e:sample-platform',
          'test:e2e:device-platform',
          'check:scenarios',
        ]);
      const device = perFileStep(plan, 'test:e2e:device-platform');
      context
        .expect(device.runner)
        .toEqual(['pnpm', 'exec', 'vitest', 'run', '--project', 'device-platform']);
      context
        .expect(device.reportDirectory)
        .toBe(join(controlled.root, 'artifacts', 'x', 'reports', 'device-platform'));
    });

    await check('per-file-run', async () => {
      const plan = await planVerify(controlled.root, { runId: 'x' }, verifyContext);
      const device = perFileStep(plan, 'test:e2e:device-platform');
      context
        .expect(device.files)
        .toEqual(['verify-fixture/device/one.spec.ts', 'verify-fixture/device/two.spec.ts']);
      context.expect(device.prepare).toBe('weapp:prepare');
      const pinned = recorder();
      await runVerify(controlled.root, { runId: 'x' }, pinned.execute, verifyContext);
      context
        .expect(pinned.calls[3]!.env.VERIFY_REPORT_FILE)
        .toBe(join(controlled.root, 'artifacts', 'x', 'reports', 'device-platform', 'one.json'));
      context.expect(reportNameForFile('a/b.spec.ts')).toBe('b');
      context.expect(reportNameForFile('a/b.test.mts')).toBe('b');
      context.expect(reportNameForFile('a/notes.md')).toBe('notes.md');
      // 未登记 prepare 的 perFile 项目不执行准备命令。
      const bare = fixture({ perFilePrepare: false });
      const bareRun = recorder();
      await runVerify(bare.root, { runId: 'x' }, bareRun.execute, verifyContext);
      context.expect(bareRun.calls.some((call) => stepName(call) === 'weapp:prepare')).toBe(false);
    });

    await check('change-env-propagated', async () => {
      const scoped = recorder();
      await runVerify(
        controlled.root,
        { runId: 'x', changes: ['A', 'B'] },
        scoped.execute,
        verifyContext,
      );
      context
        .expect(scoped.calls.every((call) => call.env.SCENARIO_GATE_CHANGES === 'A,B'))
        .toBe(true);
      const plain = recorder();
      await runVerify(controlled.root, { runId: 'y' }, plain.execute, verifyContext);
      context
        .expect(plain.calls.every((call) => call.env.SCENARIO_GATE_CHANGES === undefined))
        .toBe(true);
      const plan = await planVerify(controlled.root, { runId: 'x' }, verifyContext);
      context.expect(plan.changeScope).toBeUndefined();
      const scopedPlan = await planVerify(
        controlled.root,
        { runId: 'x', changes: ['A'] },
        verifyContext,
      );
      context.expect(scopedPlan.changeScope).toBe('A');
      const start = await planVerify(controlled.root, { from: 'check:scenarios' }, verifyContext);
      context.expect(start.startIndex).toBe(3);
    });

    await check('default-report-set', async () => {
      // 逐文件运行写入的报告位置与场景门禁的默认报告集合一致（perFile 项目按目录读取）。
      const plan = await planVerify(controlled.root, { runId: 'x' }, verifyContext);
      const device = perFileStep(plan, 'test:e2e:device-platform');
      writeReport(controlled.root, 'x', 'one.json', JSON.stringify({ tests: [] }));
      const reports = defaultReportPaths(
        controlled.root,
        'x',
        loadProjectManifest(controlled.root),
      );
      context
        .expect(reports)
        .toEqual([
          join(controlled.root, 'artifacts', 'x', 'reports', 'device-platform', 'one.json'),
        ]);
      context.expect(dirname(reports[0]!)).toBe(device.reportDirectory);
    });

    await check('summary-printed', async () => {
      const pinned = recorder();
      const result = await runVerify(
        controlled.root,
        { runId: 'x' },
        pinned.execute,
        verifyContext,
      );
      context.expect(result.exitCode).toBe(0);
      context.expect(result.lines.join('\n')).toContain('check:fast：通过');
      context.expect(result.lines.join('\n')).toContain('check:scenarios：通过');
      context.expect(result.resumeHint).toBeUndefined();
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-024',
  'verify-resume-rules',
  ['stop-on-failure', 'per-file-retry', 'resume-hint', 'resume-from-step', 'per-file-resume'],
  async (context, check) => {
    const controlled = fixture();

    await check('stop-on-failure', async () => {
      const pinned = recorder((call) => (stepName(call) === 'test:e2e:sample-platform' ? 2 : 0));
      const result = await runVerify(
        controlled.root,
        { runId: 'x' },
        pinned.execute,
        verifyContext,
      );
      context.expect(result.exitCode).toBe(1);
      context
        .expect(result.outcomes.map((outcome) => outcome.status))
        .toEqual(['passed', 'failed', 'skipped', 'skipped']);
      context.expect(result.lines.join('\n')).toContain('test:e2e:sample-platform：失败');
      context.expect(result.lines.join('\n')).toContain('check:scenarios：跳过');
      context.expect(pinned.calls.map((call) => call.argv)).toEqual([
        ['pnpm', 'run', 'check:fast'],
        ['pnpm', 'run', 'test:e2e:sample-platform'],
      ]);
    });

    await check('per-file-retry', async () => {
      // 第 2 个文件首次失败：重跑前再执行一次 prepare，重跑通过后继续。
      let attempts = 0;
      const pinned = recorder((call) => {
        if (stepName(call) !== 'vitest') return 0;
        if (!call.argv[call.argv.length - 1]!.endsWith('two.spec.ts')) return 0;
        attempts += 1;
        return attempts === 1 ? 3 : 0;
      });
      const result = await runVerify(
        controlled.root,
        { runId: 'x' },
        pinned.execute,
        verifyContext,
      );
      context.expect(result.exitCode).toBe(0);
      context
        .expect(pinned.calls.map(stepName))
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
      // 重跑仍失败时停止：返回该次退出码，后续步骤不再执行。
      const always = recorder((call) =>
        stepName(call) === 'vitest' && call.argv[call.argv.length - 1]!.endsWith('two.spec.ts')
          ? 4
          : 0,
      );
      const stopped = await runVerify(
        controlled.root,
        { runId: 'z' },
        always.execute,
        verifyContext,
      );
      context.expect(stopped.exitCode).toBe(1);
      context.expect(stopped.lines.join('\n')).toContain('test:e2e:device-platform：失败');
      context.expect(always.calls.filter((call) => stepName(call) === 'vitest')).toHaveLength(3);

      // 重跑前的 prepare 失败同样按该步失败处理：不再执行该文件。
      let prepares = 0;
      const brokenRetry = recorder((call) => {
        if (stepName(call) === 'weapp:prepare') {
          prepares += 1;
          return prepares === 1 ? 0 : 1;
        }
        return stepName(call) === 'vitest' ? 5 : 0;
      });
      const broken = await runVerify(
        controlled.root,
        { runId: 'y' },
        brokenRetry.execute,
        verifyContext,
      );
      context.expect(broken.exitCode).toBe(1);
      context
        .expect(brokenRetry.calls.filter((call) => stepName(call) === 'vitest'))
        .toHaveLength(1);
    });

    await check('resume-hint', async () => {
      const pinned = recorder((call) => (stepName(call) === 'test:e2e:sample-platform' ? 1 : 0));
      const result = await runVerify(
        controlled.root,
        { runId: 'x', changes: ['A'] },
        pinned.execute,
        verifyContext,
      );
      context
        .expect(result.resumeHint)
        .toContain('--from test:e2e:sample-platform --run-id x --change A');
      // prepare 失败也算该步失败：不再运行该文件。
      const brokenPrepare = recorder((call) => (stepName(call) === 'weapp:prepare' ? 1 : 0));
      const prepareFailure = await runVerify(
        controlled.root,
        { runId: 'p' },
        brokenPrepare.execute,
        verifyContext,
      );
      context.expect(prepareFailure.exitCode).toBe(1);
      context
        .expect(brokenPrepare.calls.map(stepName))
        .toEqual(['check:fast', 'test:e2e:sample-platform', 'weapp:prepare']);
    });

    await check('resume-from-step', async () => {
      const pinned = recorder();
      const result = await runVerify(
        controlled.root,
        { runId: 'x', from: 'test:e2e:sample-platform' },
        pinned.execute,
        verifyContext,
      );
      context.expect(result.outcomes[0]).toMatchObject({
        name: 'check:fast',
        status: 'skipped',
      });
      context.expect(result.lines.join('\n')).toContain('check:fast：跳过');
      context
        .expect(pinned.calls.map((call) => call.argv))
        .not.toContainEqual(['pnpm', 'run', 'check:fast']);
      await context
        .expect(planVerify(controlled.root, { from: 'unknown-step' }, verifyContext))
        .rejects.toThrow(/不是本次验收的步骤/);
    });

    await check('per-file-resume', async () => {
      writeReport(
        controlled.root,
        'resume-a',
        'one.json',
        JSON.stringify({ tests: [{ status: 'passed' }] }),
      );
      const skipped = recorder();
      await runVerify(
        controlled.root,
        { runId: 'resume-a', from: 'test:e2e:device-platform' },
        skipped.execute,
        verifyContext,
      );
      context
        .expect(
          skipped.calls
            .filter((call) => stepName(call) === 'vitest')
            .map((call) => call.argv[call.argv.length - 1]),
        )
        .toEqual(['verify-fixture/device/two.spec.ts']);
      // 报告不可读、解析失败、空 tests 或存在失败用例时都不算通过。
      writeReport(controlled.root, 'resume-b', 'one.json', '{ not json');
      writeReport(controlled.root, 'resume-b', 'two.json', JSON.stringify({}));
      const unreadable = recorder();
      await runVerify(
        controlled.root,
        { runId: 'resume-b', from: 'test:e2e:device-platform' },
        unreadable.execute,
        verifyContext,
      );
      context
        .expect(unreadable.calls.filter((call) => stepName(call) === 'vitest'))
        .toHaveLength(2);
      writeReport(controlled.root, 'resume-c', 'one.json', JSON.stringify({ tests: [] }));
      writeReport(
        controlled.root,
        'resume-c',
        'two.json',
        JSON.stringify({ tests: [{ status: 'failed' }] }),
      );
      const failed = recorder();
      await runVerify(
        controlled.root,
        { runId: 'resume-c', from: 'test:e2e:device-platform' },
        failed.execute,
        verifyContext,
      );
      context.expect(failed.calls.filter((call) => stepName(call) === 'vitest')).toHaveLength(2);
    });
  },
);

test('planWeappPrepare 派生出退出、清理与预热三条命令', async () => {
  const { planWeappPrepare } = await import('./weapp-prepare.ts');
  const controlled = fixture();
  expect(planWeappPrepare(controlled.root).map((step) => step.command)).toEqual([
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    'pkill',
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  ]);
  const prepare = planWeappPrepare(controlled.root, 'custom-cli');
  expect(prepare[0]).toEqual({ command: 'custom-cli', args: ['quit'] });
  expect(prepare[2]!.args[2]).toBe(join(controlled.root, 'packages/sample-test/host/weapp'));
});

test('perFile 项目的配置缺少可用 include 时拒绝逐文件运行', async () => {
  const noInclude = fixture({ configInclude: 'export default { test: {} };' });
  await expect(planVerify(noInclude.root, { runId: 'x' }, verifyContext)).rejects.toThrow(
    /没有可用的 include/,
  );
  const scalarInclude = fixture({ configInclude: 'export default { test: { include: "one" } };' });
  await expect(planVerify(scalarInclude.root, { runId: 'x' }, verifyContext)).rejects.toThrow(
    /没有可用的 include/,
  );
  const negated = fixture({
    configInclude: 'export default { test: { include: ["!**/*.spec.ts"] } };',
  });
  await expect(planVerify(negated.root, { runId: 'x' }, verifyContext)).rejects.toThrow(
    /没有可用的 include/,
  );
  const noPrepare = fixture({ perFilePrepare: false });
  const plan = await planVerify(noPrepare.root, { runId: 'x' }, verifyContext);
  expect(perFileStep(plan, 'test:e2e:device-platform').prepare).toBeUndefined();
});

test('runVerifyCli 解析参数、打印结论并给出失败后的续跑提示', async () => {
  const controlled = fixture();
  const help = await runVerifyCli(['--help'], controlled.root, () => 0);
  expect(help.exitCode).toBe(0);
  expect(help.lines.join('\n')).toContain('用法：pnpm verify');
  const unknown = await runVerifyCli(['--nope'], controlled.root, () => 0);
  expect(unknown.exitCode).toBe(1);
  expect(unknown.issues.join('\n')).toContain('未知参数 --nope');
  const missingRunId = await runVerifyCli(['--run-id'], controlled.root, () => 0);
  expect(missingRunId.issues.join('\n')).toContain('--run-id 需要取值');
  const missingFrom = await runVerifyCli(['--from'], controlled.root, () => 0);
  expect(missingFrom.issues.join('\n')).toContain('--from 需要取值');
  const missingChange = await runVerifyCli(['--change'], controlled.root, () => 0);
  expect(missingChange.issues.join('\n')).toContain('--change 需要 Change 名');
  const badStep = await runVerifyCli(['--from', 'nope', '--run-id', 'x'], controlled.root, () => 0);
  expect(badStep.exitCode).toBe(1);
  expect(badStep.issues.join('\n')).toContain('不是本次验收的步骤');
  const pinned = recorder();
  const ok = await runVerifyCli(
    ['--run-id', 'cli-run', '--change', 'A'],
    controlled.root,
    pinned.execute,
    verifyContext.now,
  );
  expect(ok.exitCode).toBe(0);
  expect(ok.result?.runId).toBe('cli-run');
  expect(ok.lines.join('\n')).toContain('check:scenarios：通过');
  expect(pinned.calls.every((call) => call.env.SCENARIO_GATE_CHANGES === 'A')).toBe(true);
  const failed = await runVerifyCli(
    ['--run-id', 'cli-fail'],
    controlled.root,
    recorder((call) => (stepName(call) === 'test:e2e:sample-platform' ? 5 : 0)).execute,
    verifyContext.now,
  );
  expect(failed.exitCode).toBe(1);
  expect(failed.lines.join('\n')).toContain('--from test:e2e:sample-platform --run-id cli-fail');
  // 默认 run id 取自当前分支与时间戳。
  const generated = await runVerifyCli([], controlled.root, () => 0, verifyContext.now);
  expect(generated.result?.runId).toBe(defaultRunId(gitBranch(controlled.root), verifyContext.now));
});

test('gitBranch 在非 git 目录返回 null', () => {
  const directory = mkdtempSync(join(tmpdir(), 'verify-nongit-'));
  try {
    expect(gitBranch(directory)).toBeNull();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
