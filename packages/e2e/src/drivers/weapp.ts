type MiniProgram = {
  evaluate(callback: ((...args: unknown[]) => unknown) | string, ...args: unknown[]): Promise<unknown>;
  disconnect(): void;
};
type Automator = { launch(options: Readonly<{ projectPath: string; cliPath?: string; trustProject: true }>): Promise<MiniProgram> };

/** 只桥接 automator 的启动、宿主函数执行和断开。 */
export async function runWeappFunction(options: Readonly<{
  automator: Automator;
  projectPath: string;
  cliPath?: string;
  functionName: string;
  args: unknown;
}>): Promise<unknown> {
  const miniProgram = await options.automator.launch({
    projectPath: options.projectPath, ...(options.cliPath ? { cliPath: options.cliPath } : {}), trustProject: true,
  });
  try {
    return await miniProgram.evaluate(
      (...values: unknown[]) => {
        const [functionName, args] = values as [string, unknown];
        const app = (globalThis as { getApp?: () => Record<string, (value: unknown) => unknown> }).getApp?.();
        return app?.[functionName]?.(args);
      },
      options.functionName, options.args,
    );
  } finally {
    miniProgram.disconnect();
  }
}
