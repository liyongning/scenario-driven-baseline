import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReleaseInput } from '../../../../scripts/check-release';
import type { ReleaseSettings } from '../../../../scripts/lib/project-manifest.ts';
import type { CommandExecutor, RegistryInspector } from '../../../../scripts/sdk-release';

export const releaseRoots: string[] = [];
/** 释放本文件登记的临时根；每个用例文件各自在 afterEach 中调用。 */
export function cleanupReleaseRoots(): void {
  for (const root of releaseRoots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export const cleanSource = async () => ({
  headRevision: 'a'.repeat(40),
  tagRevision: 'a'.repeat(40),
  clean: true,
});

export const registryUrl = 'https://registry.test.invalid/api/v4/projects/9/packages/npm/';
export const releaseSettings: ReleaseSettings = {
  registry: registryUrl,
  tagPrefix: 'template-sdk-v',
};

export function releaseRecord(overrides: Partial<ReleaseInput> = {}): ReleaseInput {
  return {
    registry: registryUrl,
    execution: 'local',
    tag: 'template-sdk-v0.1.0-alpha.1',
    sourceRevision: 'a'.repeat(40),
    sdk: { name: '@daqian/template-sdk', version: '0.1.0-alpha.1', changed: true },
    protocol: { name: '@daqian/template-protocol', version: '0.1.0', changed: false },
    ...overrides,
  };
}

export function createReleaseFixture() {
  const root = mkdtempSync(join(tmpdir(), 'sdk-release-test-'));
  releaseRoots.push(root);
  mkdirSync(join(root, 'packages/sdk'), { recursive: true });
  mkdirSync(join(root, 'packages/protocol'), { recursive: true });
  writeFileSync(
    join(root, 'project.manifest.json'),
    JSON.stringify({
      packages: [
        {
          directory: 'sdk',
          name: '@daqian/template-sdk',
          role: 'product',
          private: false,
          allowedDirectories: ['src'],
        },
        {
          directory: 'protocol',
          name: '@daqian/template-protocol',
          role: 'protocol',
          private: false,
          allowedDirectories: ['src'],
        },
        {
          directory: 'e2e',
          name: '@daqian/template-e2e',
          role: 'test',
          private: true,
          allowedDirectories: ['src'],
        },
      ],
      requiredCommands: ['check:fast'],
      testProjects: [
        { name: 'sdk-unit', class: 'unit', config: 'packages/sdk/vitest.config.ts' },
        { name: 'integration', class: 'integration', config: 'packages/e2e/vitest.config.ts' },
      ],
      fingerprints: {
        sourceRoots: ['scripts'],
        buildInputs: [],
        protocolInputs: ['proto-gen.lock'],
      },
      release: releaseSettings,
    }),
  );
  writeFileSync(
    join(root, 'packages/sdk/package.json'),
    JSON.stringify({
      name: '@daqian/template-sdk',
      version: '0.1.0-alpha.1',
      dependencies: { '@daqian/template-protocol': 'workspace:*' },
    }),
  );
  writeFileSync(
    join(root, 'packages/protocol/package.json'),
    JSON.stringify({
      name: '@daqian/template-protocol',
      version: '0.1.0',
    }),
  );
  return {
    root,
    record: releaseRecord(),
    resultPath: join(root, 'artifacts/release/release-result.json'),
    checkpointPath: join(root, 'artifacts/release/release-checkpoint.json'),
  };
}

export function createRegistryStub(
  initial: Partial<
    Record<'@daqian/template-sdk' | '@daqian/template-protocol', 'missing' | 'existing'>
  > = {},
) {
  const states = new Map<string, 'missing' | 'existing'>([
    ['@daqian/template-protocol', initial['@daqian/template-protocol'] ?? 'missing'],
    ['@daqian/template-sdk', initial['@daqian/template-sdk'] ?? 'missing'],
  ]);
  const inspections: Array<{ name: string; config?: string }> = [];
  const inspector: RegistryInspector = async (request, env) => {
    inspections.push({
      name: request.name,
      ...(env.NPM_CONFIG_USERCONFIG ? { config: env.NPM_CONFIG_USERCONFIG } : {}),
    });
    return { state: states.get(request.name)! };
  };
  const executor: CommandExecutor = async (command) => {
    if (!command.args.includes('publish')) return;
    const name = command.args[1] as '@daqian/template-sdk' | '@daqian/template-protocol';
    states.set(name, 'existing');
  };
  return { states, inspections, inspector, executor };
}

export function createGitFixture() {
  const value = createReleaseFixture();
  execFileSync('git', ['init', '--quiet'], { cwd: value.root });
  execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: value.root });
  execFileSync('git', ['config', 'user.email', 'release@example.invalid'], { cwd: value.root });
  execFileSync('git', ['add', '.'], { cwd: value.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: value.root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: value.root,
    encoding: 'utf8',
  }).trim();
  execFileSync('git', ['tag', value.record.tag], { cwd: value.root });
  return { ...value, record: releaseRecord({ sourceRevision: revision }) };
}

export function releaseSnapshot(before: ReadonlySet<string>): string {
  const directory = readdirSync(tmpdir())
    .filter(
      (name) =>
        name.startsWith('template-sdk-release-') &&
        !name.startsWith('template-sdk-release-auth-') &&
        !before.has(name),
    )
    .map((name) => ({ name, mtime: statSync(join(tmpdir(), name)).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime)[0]?.name;
  if (!directory) throw new Error('release snapshot directory not found');
  return join(tmpdir(), directory, 'release-record.json');
}
