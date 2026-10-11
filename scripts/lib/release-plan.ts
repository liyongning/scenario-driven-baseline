import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ReleaseInput } from '../check-release';
import type { ReleaseSettings } from './project-manifest.ts';

const execFileAsync = promisify(execFile);

export type ReleaseCommand = Readonly<{ file: string; args: readonly string[]; cwd?: string }>;
export type SdkReleaseStep = Readonly<{
  name: 'build-protocol' | 'publish-protocol' | 'build-sdk' | 'publish-sdk';
  command: ReleaseCommand;
}>;
export type RegistryState = 'missing' | 'existing';
export type ReleasePlanInput = Readonly<{
  record: ReleaseInput;
  resultPath: string;
  checkpointPath: string;
}>;
export type ReleasePlanDescriptionInput = Readonly<{
  record: ReleaseInput;
  protocolState?: RegistryState;
  sdkState?: RegistryState;
  release: ReleaseSettings;
}>;
export type ReleaseSource = Readonly<{ headRevision: string; tagRevision: string; clean: boolean }>;

/** 从真实 checkout 独立读取发布来源，避免发布记录用自身字段完成自证。 */
export async function inspectReleaseSource(root: string, tag: string): Promise<ReleaseSource> {
  const git = async (args: readonly string[]) =>
    (await execFileAsync('git', [...args], { cwd: root, encoding: 'utf8' })).stdout.trim();
  const [headRevision, tagRevision, status] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['rev-parse', `${tag}^{commit}`]),
    git(['status', '--porcelain', '--untracked-files=all']),
  ]);
  return { headRevision, tagRevision, clean: status.length === 0 };
}

export const scopeOf = (packageName: string) => packageName.slice(0, packageName.indexOf('/'));
export const registryArguments = (registry: string, packageName: string) =>
  ['--registry', registry, `--${scopeOf(packageName)}:registry=${registry}`] as const;

/** 正式发布构建后调用两个产品 workspace 的正常 publish；本地 pack/check:package 不属于该计划。 */
export function createSdkReleasePlan(input: ReleasePlanDescriptionInput): SdkReleaseStep[] {
  if (input.release.registry.includes('<PROJECT_ID>')) {
    throw new Error(
      'release registry is a template placeholder; set release.registry in project.manifest.json',
    );
  }
  const registry = input.release.registry;
  return [
    ...(input.protocolState === 'existing'
      ? []
      : [
          {
            name: 'build-protocol' as const,
            command: {
              file: 'pnpm',
              args: ['--filter', input.record.protocol.name, 'run', 'build'],
            },
          },
          {
            name: 'publish-protocol' as const,
            command: {
              file: 'pnpm',
              args: [
                '--filter',
                input.record.protocol.name,
                'publish',
                '--no-git-checks',
                ...registryArguments(registry, input.record.protocol.name),
              ],
            },
          },
        ]),
    ...(input.sdkState === 'existing'
      ? []
      : [
          {
            name: 'build-sdk' as const,
            command: { file: 'pnpm', args: ['--filter', input.record.sdk.name, 'run', 'build'] },
          },
          {
            name: 'publish-sdk' as const,
            command: {
              file: 'pnpm',
              args: [
                '--filter',
                input.record.sdk.name,
                'publish',
                '--no-git-checks',
                ...registryArguments(registry, input.record.sdk.name),
              ],
            },
          },
        ]),
  ];
}
