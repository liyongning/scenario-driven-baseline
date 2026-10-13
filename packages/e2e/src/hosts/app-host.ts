import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { assertProductBundleFresh } from './freshness.ts';

export type PreviewPlan = Readonly<{ command: string; args: ReadonlyArray<string>; cwd: string }>;

export type ChildProcessLike = Readonly<{
  stdout: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
  kill(): boolean;
}>;

/** `vite preview` 的参数保持为 options，不额外插入 `--`。 */
export function appPreviewPlan(productRoot: string): PreviewPlan {
  return {
    command: 'pnpm',
    args: ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '0'],
    cwd: productRoot,
  };
}

export function parsePreviewUrl(output: string): string {
  const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
  if (!match) throw new Error(`vite preview did not print a 127.0.0.1 URL:\n${output}`);
  return match[0];
}

export type AppHost = Readonly<{
  url: string;
  output(): string;
  close(): Promise<void>;
}>;

/** 启动产品 dist 的应用宿主；任何提前退出或无 URL 输出都保留宿主日志。 */
export async function createAppHost(
  options: Readonly<{
    root: string;
    productDirectory: string;
    spawn?: (plan: PreviewPlan) => ChildProcessLike;
    verifyFreshness?: (root: string, productDirectory: string) => void;
  }>,
): Promise<AppHost> {
  (options.verifyFreshness ?? assertProductBundleFresh)(options.root, options.productDirectory);
  const plan = appPreviewPlan(join(options.root, 'packages', options.productDirectory));
  const child = (
    options.spawn ?? ((value) => spawn(value.command, [...value.args], { cwd: value.cwd }))
  )(plan) as ChildProcess | ChildProcessLike;
  let output = '';
  return new Promise<AppHost>((resolve, reject) => {
    const append = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (!match) return;
      resolve({
        url: match[0],
        output: () => output,
        async close() {
          child.kill();
        },
      });
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.once('exit', (code) => {
      try {
        parsePreviewUrl(output);
      } catch (error) {
        reject(
          new Error(
            `vite preview did not print a 127.0.0.1 URL and exited (code ${String(code)}):\n${output}\n${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });
  });
}
