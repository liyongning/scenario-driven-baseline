import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProjectManifest, packageByRole } from './lib/project-manifest.ts';
import { writeProjectConfig } from './lib/weapp-project-config.ts';

/** 微信开发者工具 CLI 的默认位置；可用 `WECHAT_DEVTOOLS_CLI` 覆盖。 */
export const defaultDevtoolsCli = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

/** 测试包内的小程序宿主项目，见 packages/e2e/AGENTS.md。 */
export const hostProjectRelative = 'host/weapp';

export type PrepareCommand = Readonly<{ command: string; args: ReadonlyArray<string> }>;

/** 宿主小程序项目的绝对路径：由清单里的测试包目录派生，不写死包目录。 */
export function hostProject(root: string): string {
  const manifest = loadProjectManifest(root);
  return resolve(root, 'packages', packageByRole(manifest, 'test').directory, hostProjectRelative);
}

/**
 * 预热步骤：退出开发者工具主进程、清理残留进程、打开宿主项目触发冷启动。
 * 三条命令的退出码都不作为就绪判定（`cli open` 已观察到返回 255 但工具可用）。
 */
export function planWeappPrepare(root: string, cli = defaultDevtoolsCli): PrepareCommand[] {
  const host = hostProject(root);
  return [
    { command: cli, args: ['quit'] },
    { command: 'pkill', args: ['-f', 'wechatwebdevtools.app'] },
    { command: cli, args: ['open', '--project', host] },
  ];
}

/* v8 ignore start -- 真实执行（退出、清理、预热与就绪探测）由 pnpm verify 的逐文件运行承担。 */

/** 就绪探测预算：`cli open` 返回时项目常常还没载入完，固定 sleep 覆盖不了这个波动。 */
const readyProbe = { attemptTimeoutMs: 30_000, intervalMs: 5_000, attemptCount: 12 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 就绪判定：反复尝试连接开发者工具并读取版本号，直到成功一次。
 * `automator.launch` 内部会做版本校验，读到空版本号时抛错——这次抛错在演练里出现过两次
 * （`Tool.getInfo` 还没返回 SDKVersion），所以不依赖固定 sleep，而是轮询到真正可读为止。
 */
async function waitForDevtoolsReady(host: string, cli: string): Promise<void> {
  const { default: automator } = await import('miniprogram-automator');
  let lastError: unknown;
  for (let attempt = 0; attempt < readyProbe.attemptCount; attempt += 1) {
    let miniProgram: { disconnect(): void; checkVersion(): Promise<void> } | undefined;
    try {
      miniProgram = await automator.launch({
        projectPath: host,
        cliPath: cli,
        trustProject: true,
        timeout: readyProbe.attemptTimeoutMs,
      });
      await miniProgram.checkVersion();
      return;
    } catch (error) {
      lastError = error;
    } finally {
      miniProgram?.disconnect();
    }
    await sleep(readyProbe.intervalMs);
  }
  throw new Error(`微信开发者工具未就绪：${String(lastError)}`);
}

export async function prepareWeapp(root: string): Promise<number> {
  const cli = process.env.WECHAT_DEVTOOLS_CLI ?? defaultDevtoolsCli;
  const host = hostProject(root);
  // 先生成受 git 忽略的项目配置：开发者工具只认这个文件名，模板才是受跟踪的来源。
  writeProjectConfig(host);
  for (const step of planWeappPrepare(root, cli))
    spawnSync(step.command, [...step.args], { stdio: 'ignore' });
  await waitForDevtoolsReady(host, cli);
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  process.exitCode = await prepareWeapp(process.cwd());
/* v8 ignore stop */
