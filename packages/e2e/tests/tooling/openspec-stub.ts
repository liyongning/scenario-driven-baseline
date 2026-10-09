import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type OpenSpecStub = Readonly<{
  directory: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
}>;

/**
 * Create a controlled openspec executable for tooling tests. The real CLI is
 * intentionally not consulted, so fixtures remain deterministic on CI and on
 * developer machines with different global installations.
 */
export function createOpenSpecStub(
  options: Readonly<{ available?: boolean; version?: string }> = {},
): OpenSpecStub {
  const directory = mkdtempSync(join(tmpdir(), 'openspec-stub-'));
  const executable = join(directory, 'openspec');
  const version = options.version ?? '0.0.0-test';
  const status = options.available === false ? 1 : 0;
  writeFileSync(
    executable,
    `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log(${JSON.stringify(version)});
  process.exit(${status});
}
process.exit(${status});
`,
  );
  chmodSync(executable, 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${directory}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
  };
  // 受控根自带的 active Change 集合与调用方作用域无关：剔除外层 SCENARIO_GATE_CHANGES。
  delete env.SCENARIO_GATE_CHANGES;
  return {
    directory,
    env,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

export async function withOpenSpecStub<T>(
  callback: (stub: OpenSpecStub) => T | Promise<T>,
  options: Readonly<{ available?: boolean; version?: string }> = {},
): Promise<T> {
  const stub = createOpenSpecStub(options);
  try {
    return await callback(stub);
  } finally {
    stub.cleanup();
  }
}
