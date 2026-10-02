import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll } from 'vitest';
import { type ReleaseInput } from '../../../../scripts/check-release.ts';
import { createSdkReleasePlan } from '../../../../scripts/sdk-release.ts';
import { defineCase } from '../../src/cases/define-case.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const releaseScript = resolve('scripts/check-release.ts');
const tsx = resolve('node_modules/.bin/tsx');
const roots: string[] = [];
afterAll(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const concreteRegistry = 'https://registry.example.invalid/api/v4/projects/9/packages/npm/';
const placeholderRegistry = 'https://gitlab.example.invalid/api/v4/projects/<PROJECT_ID>/packages/npm/';
const tagPrefix = 'template-sdk-v';

/** 预检读取门禁根目录的清单与 workspace 事实；临时根只写清单与两个包的 package.json。 */
function releaseFixture(registry: string) {
  const root = mkdtempSync(join(tmpdir(), 'template-release-cli-'));
  roots.push(root);
  mkdirSync(join(root, 'packages/sdk'), { recursive: true });
  mkdirSync(join(root, 'packages/protocol'), { recursive: true });
  writeFileSync(join(root, 'packages/sdk/package.json'), JSON.stringify({
    name: '@daqian/template-sdk',
    version: '0.1.0',
    dependencies: { '@daqian/template-protocol': 'workspace:*' },
  }));
  writeFileSync(join(root, 'packages/protocol/package.json'), JSON.stringify({
    name: '@daqian/template-protocol',
    version: '0.1.0',
  }));
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify({
    packages: [
      { directory: 'sdk', name: '@daqian/template-sdk', role: 'product', private: false, allowedDirectories: ['src'] },
      { directory: 'protocol', name: '@daqian/template-protocol', role: 'protocol', private: false, allowedDirectories: ['src'] },
      { directory: 'e2e', name: '@daqian/template-e2e', role: 'test', private: true, allowedDirectories: ['src'] },
    ],
    requiredCommands: ['check:fast'],
    testProjects: [{ name: 'sdk-unit', class: 'unit' }, { name: 'integration', class: 'integration' }],
    fingerprints: { sourceRoots: ['scripts'], hostRoots: [] },
    release: { registry, tagPrefix },
  }, null, 2));
  return root;
}

function base(overrides: Partial<ReleaseInput> = {}): ReleaseInput {
  return {
    registry: concreteRegistry,
    execution: 'local',
    tag: `${tagPrefix}0.1.0`,
    sourceRevision: 'a'.repeat(40),
    sdk: { name: '@daqian/template-sdk', version: '0.1.0', changed: true },
    protocol: { name: '@daqian/template-protocol', version: '0.1.0', changed: false },
    ...overrides,
  };
}

function cli(root: string, record: unknown) {
  const input = join(root, 'release-record.json');
  writeFileSync(input, JSON.stringify(record));
  const result = spawnSync(tsx, [releaseScript, '--input', input], { cwd: root, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}

defineCase({
  ownerId: 'SCN-TEMPLATE-ENGINEERING-004', caseId: 'preflight-valid-plan', fixtureCase: 'preflight-valid-plan', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-004', caseKey: 'preflight-valid-plan', checks: ['plan-validated'] }],
}, async ({ checkpoint, expect }) => {
  await checkpoint('plan-validated', () => {
    const root = releaseFixture(concreteRegistry);
    expect(cli(root, base())).toMatchObject({ status: 0 });
    expect(cli(root, base({ execution: 'ci' }))).toMatchObject({ status: 0 });
    expect(cli(root, { ...base(), sdk: { ...base().sdk, tarball: 'sdk.tgz', digest: `sha256:${'a'.repeat(64)}` } }).output).toMatch(/unexpected field/);
    expect(cli(root, { ...base(), steps: [] }).output).toMatch(/unexpected field steps/);
  });
}, { fixtureRoot });

defineCase({
  ownerId: 'SCN-TEMPLATE-ENGINEERING-004', caseId: 'preflight-rejects-drift', fixtureCase: 'preflight-rejects-drift', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-004', caseKey: 'preflight-rejects-drift', checks: ['drift-rejected'] }],
}, async ({ checkpoint, expect }) => {
  await checkpoint('drift-rejected', () => {
    const root = releaseFixture(concreteRegistry);
    expect(cli(root, base({ sdk: { ...base().sdk, changed: false } })).output).toContain('formal SDK release requires an SDK version change');
    const drifted = base({ sdk: { ...base().sdk, version: '9.9.9' }, tag: `${tagPrefix}9.9.9` });
    expect(cli(root, drifted).output).toContain('SDK package identity does not match the current workspace');
    expect(cli(root, base({ registry: 'https://other.invalid/' })).output).toContain('release registry does not match the project manifest');
  });
}, { fixtureRoot });

defineCase({
  ownerId: 'SCN-TEMPLATE-ENGINEERING-004', caseId: 'preflight-rejects-placeholder', fixtureCase: 'preflight-rejects-placeholder', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-004', caseKey: 'preflight-rejects-placeholder', checks: ['placeholder-registry-rejected'] }],
}, async ({ checkpoint, expect }) => {
  await checkpoint('placeholder-registry-rejected', () => {
    const root = releaseFixture(placeholderRegistry);
    const result = cli(root, base({ registry: placeholderRegistry }));
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('release registry is a template placeholder; set release.registry in project.manifest.json');
  });
}, { fixtureRoot });

defineCase({
  ownerId: 'SCN-TEMPLATE-ENGINEERING-004', caseId: 'publish-order', fixtureCase: 'publish-order', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-004', caseKey: 'publish-order', checks: ['dependency-order-publish'] }],
}, async ({ checkpoint, expect }) => {
  await checkpoint('dependency-order-publish', () => {
    const release = { registry: concreteRegistry, tagPrefix };
    const plan = createSdkReleasePlan({ record: base(), protocolState: 'missing', sdkState: 'missing', release });
    expect(plan.map(step => step.name)).toEqual(['build-protocol', 'publish-protocol', 'build-sdk', 'publish-sdk']);
    expect(plan[0]?.command).toEqual({
      file: 'pnpm',
      args: ['--filter', '@daqian/template-protocol', 'run', 'build'],
    });
    expect(plan[1]?.command).toEqual({
      file: 'pnpm',
      args: ['--filter', '@daqian/template-protocol', 'publish', '--no-git-checks', '--registry', concreteRegistry, `--@daqian:registry=${concreteRegistry}`],
    });
    expect(plan[2]?.command).toEqual({
      file: 'pnpm',
      args: ['--filter', '@daqian/template-sdk', 'run', 'build'],
    });
    expect(plan[3]?.command).toEqual({
      file: 'pnpm',
      args: ['--filter', '@daqian/template-sdk', 'publish', '--no-git-checks', '--registry', concreteRegistry, `--@daqian:registry=${concreteRegistry}`],
    });
    expect(plan.flatMap(step => step.command.args)).not.toEqual(expect.arrayContaining(['pack', 'check:package']));
    expect(() => createSdkReleasePlan({ record: base({ registry: placeholderRegistry }), release: { registry: placeholderRegistry, tagPrefix } }))
      .toThrow(/template placeholder/);
    expect(existsSync(resolve('.gitlab-ci.yml'))).toBe(false);
    expect((JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts['sdk-release']).toBe('tsx scripts/sdk-release.ts');
  });
}, { fixtureRoot });
