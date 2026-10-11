import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  registryArguments,
  type ReleaseCommand,
  type ReleaseSource,
  type RegistryState,
} from './release-plan.ts';

const execFileAsync = promisify(execFile);

export type CommandExecutor = (command: ReleaseCommand, env: NodeJS.ProcessEnv) => Promise<void>;
export type RegistryInspection = Readonly<{ state: RegistryState }>;
export type RegistryInspectionRequest = Readonly<{
  name: string;
  version: string;
  registry: string;
}>;
export type RegistryInspector = (
  request: RegistryInspectionRequest,
  env: NodeJS.ProcessEnv,
) => Promise<RegistryInspection>;
export type SdkReleaseOptions = Readonly<{
  root: string;
  sourceInspector?: (root: string, tag: string) => Promise<ReleaseSource>;
  env?: NodeJS.ProcessEnv;
  tokenEnv?: string;
  registryInspector?: RegistryInspector;
}>;

/* v8 ignore start -- 外部进程边界由受控 executor 注入测试，真实调用只做参数转发。 */
export const execute: CommandExecutor = async (command, env) => {
  await execFileAsync(command.file, [...command.args], { cwd: command.cwd, env });
};
/* v8 ignore stop */

/* v8 ignore start -- 真实 registry 边界由注入 inspector 测试，默认实现只做版本可读性检查。 */
export const inspectRegistry: RegistryInspector = async (request, env) => {
  try {
    const { stdout } = await execFileAsync(
      'npm',
      [
        'view',
        `${request.name}@${request.version}`,
        'version',
        '--json',
        ...registryArguments(request.registry, request.name),
      ],
      { env, encoding: 'utf8' },
    );
    const version = JSON.parse(stdout) as unknown;
    if (version !== request.version)
      throw new Error(`registry returned unexpected version ${String(version)}`);
    return { state: 'existing' };
  } catch (error) {
    const text = String(error);
    if (/E404|404 Not Found|is not in this registry/i.test(text)) return { state: 'missing' };
    const issue = new Error(
      `registry lookup failed for ${request.name}@${request.version}: ${text}`,
    ) as Error & { cause: unknown };
    issue.cause = error;
    throw issue;
  }
};
/* v8 ignore stop */
