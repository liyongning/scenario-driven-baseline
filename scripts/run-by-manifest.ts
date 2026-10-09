import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadProjectManifest,
  packageByRole,
  reportNameFor,
  testProjectsByClass,
  type PackageRole,
} from './lib/project-manifest.ts';

/** 一条待执行的命令：可执行文件、参数与环境变量覆盖。 */
export type PlannedCommand = Readonly<{
  command: string;
  args: ReadonlyArray<string>;
  env?: Readonly<Record<string, string>>;
}>;

/** 构建顺序：协议角色先于产品角色（产品包编译依赖协议包产物）。 */
const buildOrder: ReadonlyArray<PackageRole> = ['protocol', 'product'];

function reportFile(root: string, name: string): string {
  return resolve(root, `artifacts/${process.env.VERIFY_RUN_ID ?? 'local'}/reports/${name}.json`);
}

/** 组装一条 vitest 命令；报告文件经环境变量传给根 reporter。 */
function vitestStep(
  root: string,
  projects: ReadonlyArray<string>,
  options: Readonly<{ coverage?: boolean; report: string }>,
): PlannedCommand {
  const args = ['run'];
  for (const name of projects) args.push('--project', name);
  if (options.coverage) args.push('--coverage');
  return {
    command: 'vitest',
    args,
    env: { VERIFY_REPORT_FILE: reportFile(root, options.report) },
  };
}

/** 按清单把命令名组装为待执行命令序列；命令名未登记或引用了未登记项目时抛错。 */
export function planCommand(root: string, commandName: string): PlannedCommand[] {
  const manifest = loadProjectManifest(root);
  if (commandName === 'build')
    return buildOrder.map((role) => ({
      command: 'pnpm',
      args: ['--filter', packageByRole(manifest, role).name, 'build'],
    }));
  if (commandName === 'typecheck')
    return [
      ...buildOrder.map((role) => ({
        command: 'tsc',
        args: [
          '-p',
          `packages/${packageByRole(manifest, role).directory}/tsconfig.build.json`,
          '--noEmit',
        ],
      })),
      { command: 'tsc', args: ['-p', 'tsconfig.test.json'] },
      { command: 'tsc', args: ['-p', 'tsconfig.tools.json'] },
    ];
  if (commandName === 'test:unit')
    return [
      vitestStep(root, testProjectsByClass(manifest, ['unit']), { coverage: true, report: 'unit' }),
    ];
  if (commandName === 'test:integration')
    return testProjectsByClass(manifest, ['integration']).map((name) =>
      vitestStep(root, [name], { report: name }),
    );
  const platformPrefix = 'test:e2e:';
  if (commandName.startsWith(platformPrefix)) {
    const name = commandName.slice(platformPrefix.length);
    const project = manifest.testProjects.find((item) => item.name === name);
    if (!project) throw new Error(`${commandName}: ${name} is not a registered test project`);
    return [vitestStep(root, [name], { report: reportNameFor(project) })];
  }
  throw new Error(`unknown command ${commandName}`);
}

/** 真实子进程执行：继承标准输出，进程被信号中断时按失败处理。 */
export function spawnStep(step: PlannedCommand): number {
  const result = spawnSync(step.command, [...step.args], {
    stdio: 'inherit',
    env: { ...process.env, ...step.env },
  });
  return result.status ?? 1;
}

/** 顺序执行命令序列，遇到非零退出即停止并返回该退出码。 */
export function runByManifest(
  root: string,
  commandName: string,
  execute: (step: PlannedCommand) => number,
): number {
  for (const step of planCommand(root, commandName)) {
    const code = execute(step);
    if (code !== 0) return code;
  }
  return 0;
}

/* v8 ignore start -- 真实 CLI 分支由工程门禁（check:fast/verify）执行。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const command = process.argv[2];
  if (!command) throw new Error('usage: tsx scripts/run-by-manifest.ts <command>');
  process.exitCode = runByManifest(process.cwd(), command, spawnStep);
}
/* v8 ignore stop */
