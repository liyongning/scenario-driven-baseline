import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAffectedFixture } from '../packages/e2e/tests/tooling/affected-fixture.ts';
import { enableInventory } from '../packages/e2e/tests/tooling/scenario-gate-helpers.ts';
import { loadReporterOutputs, runScenariosCli } from './check-scenarios.ts';
import {
  affectedCommands,
  affectedReportIssues,
  analysisTsconfig,
  changedFilesSince,
  changedRequirements,
  reachedTestFiles,
  runAffectedCli,
  scanCaseBindings,
  spawnAffectedStep,
} from './test-affected.ts';
import { loadProjectManifest } from './lib/project-manifest.ts';

const specPath = 'openspec/specs/sample/spec.md';
const productSource = 'packages/sample-product/src/core.ts';
const integrationSpec = 'packages/e2e/tests/example/SCN-SAMPLE-A-001.spec.ts';
const platformSpec = 'packages/e2e/tests/weapp/SCN-SAMPLE-A-001.spec.ts';
const toolingSpec = 'packages/e2e/tests/tooling/SCN-SAMPLE-TOOL-009.spec.ts';
const flowSpec = 'packages/e2e/tests/flows/FLOW-SAMPLE-A-001.spec.ts';

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

  it('related 与被选中的 unit 文件各写一份报告，不互相覆盖', () => {
    const root = process.cwd();
    const manifest = loadProjectManifest(root);
    const runId = 'affected-20260101T000000Z';
    const commands = affectedCommands(root, manifest, {
      runId,
      files: [{ project: 'test-tools-unit', className: 'unit', file: 'scripts/sample.test.ts' }],
      related: ['scripts/lib/affected-sample.ts'],
      build: false,
    });
    const report = (name: string) => join(root, 'artifacts', runId, 'reports', `${name}.json`);
    const related = commands.find((step) => step.args[0] === 'related');
    const files = commands.find((step) => step.args[0] === 'run');
    // related 保持写 unit：affectedReportIssues 核对的就是这一步的真实结果，不会被逐文件运行覆盖。
    expect(related?.env?.VERIFY_REPORT_FILE).toBe(report('unit'));
    // 被选中的 unit 文件另写一份：写 0 个用例时也不会盖掉 related 的结论。
    expect(files?.env?.VERIFY_REPORT_FILE).toBe(report('unit-files'));
    expect(files?.args).toEqual(['run', '--project', 'test-tools-unit', 'scripts/sample.test.ts']);
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

it('scanCaseBindings 读取受控根里的全部绑定', { timeout: 30_000 }, () => {
  const fixture = createAffectedFixture();
  try {
    fixture.write(
      'packages/e2e/tests/sample-product-idl/directory.spec.ts',
      [
        "import { defineCase } from '../../src/cases/define-case.ts';",
        "defineCase({ ownerId: 'SCN-SAMPLE-DIR-001', caseId: 'normal', environment: 'integration', fixtureCase: 'normal', covers: [] }, () => {});",
        '',
      ].join('\n'),
    );
    fixture.write(
      'packages/e2e/tests/other/unbound.spec.ts',
      [
        "import { defineCase } from '../../src/cases/define-case.ts';",
        "defineCase({ ownerId: 'SCN-SAMPLE-OTHER-001', caseId: 'normal', environment: 'integration', fixtureCase: 'normal', covers: [] }, () => {});",
        '',
      ].join('\n'),
    );
    const bindings = scanCaseBindings(fixture.root, loadProjectManifest(fixture.root));
    expect(bindings.map((item) => item.file).sort()).toEqual(
      [
        integrationSpec,
        platformSpec,
        toolingSpec,
        flowSpec,
        'packages/e2e/tests/sample-product-idl/directory.spec.ts',
        'packages/e2e/tests/other/unbound.spec.ts',
      ].sort(),
    );
    expect(bindings.find((item) => item.file.endsWith('directory.spec.ts'))?.binding).toBe(
      'sample-product-idl',
    );
    expect(bindings.find((item) => item.file.endsWith('unbound.spec.ts'))?.binding).toBeUndefined();
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

it('平台项目未登记 prepare 时只按文件运行，不插入准备步骤', () => {
  const manifest = loadProjectManifest(process.cwd());
  // 去掉平台项目登记的 prepare：其余字段保持不变，只验证没有准备步骤时的命令组装。
  const projects = manifest.testProjects.map(({ prepare, ...project }) => {
    void prepare;
    return project;
  });
  const commands = affectedCommands(
    process.cwd(),
    { ...manifest, testProjects: projects },
    {
      runId: 'affected-20260101T000000Z',
      files: [
        { project: 'weapp', className: 'platform', file: 'packages/e2e/tests/weapp/a.spec.ts' },
      ],
      related: [],
      build: false,
    },
  );
  expect(commands).toHaveLength(1);
  expect(commands[0]?.command).toBe('vitest');
  expect(commands[0]?.args).toEqual([
    'run',
    '--project',
    'weapp',
    'packages/e2e/tests/weapp/a.spec.ts',
  ]);
});

it('unit related 报告零用例时按需入口非零退出', { timeout: 30_000 }, async () => {
  const fixture = createAffectedFixture();
  try {
    fixture.write(productSource, 'export const core = 2;\n');
    const run = (report: unknown) =>
      runAffectedCli([], fixture.root, (step) => {
        if (step.args[0] === 'related') {
          const file = step.env!.VERIFY_REPORT_FILE!;
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, JSON.stringify(report));
        }
        return 0;
      });
    // 缺 tests 字段与 tests 为空都算零用例：不能靠 passWithNoTests 放行。
    for (const report of [{}, { tests: [] }]) {
      const result = await run(report);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('实际执行 0 个用例');
    }
  } finally {
    fixture.cleanup();
  }
});

it('分析用 tsconfig 按清单派生，缺少仓库 tsconfig 或协议包时同样可用', () => {
  const root = mkdtempSync(join(tmpdir(), 'affected-analysis-'));
  try {
    const manifest = loadProjectManifest(process.cwd());
    const pathsOf = (value: ReturnType<typeof loadProjectManifest>) =>
      (
        JSON.parse(analysisTsconfig(root, value)) as {
          compilerOptions: { paths: Record<string, string[]> };
        }
      ).compilerOptions.paths;
    const paths = pathsOf(manifest);
    // 缺少 tsconfig.base.json/tsconfig.test.json 时只保留清单派生映射，不报错也不留测试别名。
    expect(Object.keys(paths)).not.toContain('@template-test/protocol');
    expect(
      Object.values(paths).some((values) => values.some((value) => value.startsWith('packages/'))),
    ).toBe(true);
    // 清单里没有协议包时不派生 generated 子路径。
    const withoutProtocol = {
      ...manifest,
      packages: manifest.packages.filter((item) => item.role !== 'protocol'),
    };
    expect(
      Object.keys(pathsOf(withoutProtocol)).some((name) => name.endsWith('/generated/*')),
    ).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
