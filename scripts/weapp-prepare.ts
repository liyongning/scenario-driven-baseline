import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProjectManifest, packageByRole } from './lib/project-manifest.ts';

/** 微信开发者工具 CLI 的默认位置；可用 `WECHAT_DEVTOOLS_CLI` 覆盖。 */
export const defaultDevtoolsCli = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

/** 测试包内的小程序宿主项目，见 packages/e2e/AGENTS.md。 */
export const hostProjectRelative = 'host/weapp';

export type PrepareCommand = Readonly<{ command: string; args: ReadonlyArray<string> }>;

/**
 * 预热步骤：退出开发者工具主进程、清理残留进程、打开宿主项目触发冷启动。
 * 三条命令的退出码都不作为就绪判定（`cli open` 已观察到返回 255 但工具可用）。
 */
export function planWeappPrepare(root: string, cli = defaultDevtoolsCli): PrepareCommand[] {
  const manifest = loadProjectManifest(root);
  const host = resolve(
    root,
    'packages',
    packageByRole(manifest, 'test').directory,
    hostProjectRelative,
  );
  return [
    { command: cli, args: ['quit'] },
    { command: 'pkill', args: ['-f', 'wechatwebdevtools.app'] },
    { command: cli, args: ['open', '--project', host] },
  ];
}

/* v8 ignore start -- 真实执行（退出、清理与预热）由 pnpm verify 的逐文件运行承担。 */
export function prepareWeapp(root: string): number {
  const cli = process.env.WECHAT_DEVTOOLS_CLI ?? defaultDevtoolsCli;
  for (const step of planWeappPrepare(root, cli))
    spawnSync(step.command, [...step.args], { stdio: 'ignore' });
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  process.exitCode = prepareWeapp(process.cwd());
/* v8 ignore stop */
