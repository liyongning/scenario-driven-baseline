import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { errorMessage, testProjectsByClass, type ProjectManifest } from './project-manifest.ts';
import { reportNameForFile } from './report-names.ts';
import type { PlannedCommand } from '../run-by-manifest.ts';
import type { AffectedTestFile } from './affected-types.ts';

/** unit 类项目的默认报告名（清单与场景门禁共用）。 */
const unitReportName = 'unit';
/**
 * 按需运行里「被选中的 unit 文件」用的独立报告名。
 * `vitest related` 与逐文件运行都会写报告：共用 `unit` 时后写的会覆盖先写的，
 * related 选中了改动文件却一个用例都没跑时，被覆盖的报告会让 `affectedReportIssues` 读不到 0 而漏报。
 * related 保持写 `unit`，核对只针对这一步的真实结果。
 */
const unitFileReportName = 'unit-files';

/** 组装按需运行的命令：先构建（改动落在产品/协议包 src）、再 unit related、再逐文件用例。 */
export function affectedCommands(
  root: string,
  manifest: ProjectManifest,
  plan: Readonly<{
    runId: string;
    files: ReadonlyArray<AffectedTestFile>;
    related: ReadonlyArray<string>;
    build: boolean;
  }>,
): PlannedCommand[] {
  const commands: PlannedCommand[] = [];
  if (plan.build) commands.push({ command: 'pnpm', args: ['build'] });
  const unitProjects = testProjectsByClass(manifest, ['unit']);
  if (plan.related.length > 0 && unitProjects.length > 0)
    commands.push({
      command: 'vitest',
      // 每个项目各带一个 `--project`：Vitest 的该选项只接受一个值，空格分隔的其余项目名会被当成路径过滤器。
      args: [
        'related',
        ...plan.related,
        ...unitProjects.flatMap((name) => ['--project', name]),
        '--run',
      ],
      env: {
        VERIFY_RUN_ID: plan.runId,
        TEST_AFFECTED_PARTIAL: '1',
        VERIFY_REPORT_FILE: reportPath(root, plan.runId, unitReportName),
      },
    });
  // 同一份报告的文件合成一次运行：同一项目的多个文件写进同一份报告，不互相覆盖。
  // perFile 项目（例如平台项目）必须逐文件运行，每个文件前执行清单登记的 prepare
  // （例如退出并预热微信开发者工具），每个文件写一份带文件名的报告。
  const runs = new Map<string, { projects: string[]; files: string[] }>();
  for (const file of plan.files) {
    const project = manifest.testProjects.find((item) => item.name === file.project);
    if (project?.perFile === true) {
      if (project.prepare !== undefined)
        commands.push({ command: 'pnpm', args: ['run', project.prepare] });
      commands.push({
        command: 'vitest',
        args: ['run', '--project', file.project, file.file],
        env: {
          VERIFY_RUN_ID: plan.runId,
          TEST_AFFECTED_PARTIAL: '1',
          VERIFY_REPORT_FILE: reportPath(
            root,
            plan.runId,
            `${file.project}/${reportNameForFile(file.file)}`,
          ),
        },
      });
      continue;
    }
    const selectedProjects =
      project?.class === 'integration'
        ? testProjectsByClass(manifest, ['integration'])
        : [file.project];
    const name = reportFor(file);
    const run = runs.get(name) ?? { projects: [], files: [] };
    for (const selectedProject of selectedProjects)
      if (!run.projects.includes(selectedProject)) run.projects.push(selectedProject);
    run.files.push(file.file);
    runs.set(name, run);
  }
  for (const [name, run] of runs)
    commands.push({
      command: 'vitest',
      args: ['run', ...run.projects.flatMap((project) => ['--project', project]), ...run.files],
      env: {
        VERIFY_RUN_ID: plan.runId,
        TEST_AFFECTED_PARTIAL: '1',
        VERIFY_REPORT_FILE: reportPath(root, plan.runId, name),
      },
    });
  return commands;
}

/**
 * 报告名：按需运行选中的 unit 类文件写 `unit-files`（与 related 的 `unit` 分开，见上）；
 * 非 perFile 项目每个项目一份 `<项目名>`（同一项目的文件合成一次运行）；
 * perFile 项目的报告名在调用处带上文件名。
 */
function reportFor(file: AffectedTestFile): string {
  return file.className === 'unit' ? unitFileReportName : file.project;
}

function reportPath(root: string, runId: string, name: string): string {
  return resolve(root, 'artifacts', runId, 'reports', `${name}.json`);
}

/**
 * 按需运行的报告核对：`vitest related` 选中了改动文件、该步的报告里实际执行的用例却为 0
 * （例如项目名被当成路径过滤器过滤光了），说明选择失效——必须判失败，不能靠 `passWithNoTests`。
 * 读的是 related 这一步写的 `unit` 报告：被选中的 unit 文件另写 `unit-files`，不覆盖它。
 */
export function affectedReportIssues(
  root: string,
  plan: Readonly<{
    runId: string;
    related: ReadonlyArray<string>;
    commands: ReadonlyArray<PlannedCommand>;
  }>,
): string[] {
  const ranRelated = plan.commands.some(
    (step) => step.command === 'vitest' && step.args[0] === 'related',
  );
  if (!ranRelated || plan.related.length === 0) return [];
  const report = reportPath(root, plan.runId, unitReportName);
  const shown = relative(root, report);
  let tests: ReadonlyArray<unknown>;
  try {
    const parsed = JSON.parse(readFileSync(report, 'utf8')) as {
      tests?: ReadonlyArray<unknown>;
    };
    tests = parsed.tests ?? [];
  } catch (error) {
    return [`unit 报告缺失或不可读：${shown}（${errorMessage(error)}）`];
  }
  return tests.length === 0
    ? [
        `unit 报告没有任何用例：${shown}（vitest related 选中 ${plan.related.length} 个改动文件，实际执行 0 个用例）`,
      ]
    : [];
}
