import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll } from 'vitest';
import { releaseRegistry, type ReleaseInput } from '../../../../scripts/check-release.ts';
import { createSdkReleasePlan } from '../../../../scripts/sdk-release.ts';
import { defineCase } from '../../src/cases/define-case.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const root = mkdtempSync(join(tmpdir(), 'payment-release-cli-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const workspaceVersion = (path: string) => (JSON.parse(readFileSync(resolve(path), 'utf8')) as { version: string }).version;
const sdkVersion = workspaceVersion('packages/payment-sdk/package.json');
const protocolVersion = workspaceVersion('packages/payment-protocol/package.json');

function base(overrides: Partial<ReleaseInput> = {}): ReleaseInput {
  return {
    targetProject: 245,
    registry: releaseRegistry,
    execution: 'local',
    tag: `payment-sdk-v${sdkVersion}`,
    sourceRevision: 'a'.repeat(40),
    sdk: { name: '@daqian/payment-sdk', version: sdkVersion, changed: true },
    protocol: { name: '@daqian/payment-protocol', version: protocolVersion, changed: false },
    ...overrides,
  };
}

function cli(record: unknown) {
  const input = join(root, `record-${Math.random()}.json`);
  writeFileSync(input, JSON.stringify(record));
  const result = spawnSync(resolve('node_modules/.bin/tsx'), ['scripts/check-release.ts', '--input', input], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

defineCase({
  ownerId: 'SCN-TEMPLATE-ENGINEERING-004', caseId: 'preflight-valid-plan', fixtureCase: 'preflight-valid-plan', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-004', caseKey: 'preflight-valid-plan', checks: ['plan-validated'] }],
}, async ({ checkpoint, expect }) => {
  await checkpoint('plan-validated', () => {
    expect(cli(base())).toMatchObject({ status: 0 });
    expect(cli(base({ execution: 'ci' }))).toMatchObject({ status: 0 });
    expect(cli({ ...base(), sdk: { ...base().sdk, tarball: 'sdk.tgz', digest: `sha256:${'a'.repeat(64)}` } }).output).toMatch(/unexpected field/);
    expect(cli({ ...base(), steps: [] }).output).toMatch(/unexpected field steps/);
  });
}, { fixtureRoot });

defineCase({
  ownerId: 'SCN-TEMPLATE-ENGINEERING-004', caseId: 'preflight-rejects-drift', fixtureCase: 'preflight-rejects-drift', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-004', caseKey: 'preflight-rejects-drift', checks: ['drift-rejected'] }],
}, async ({ checkpoint, expect }) => {
  await checkpoint('drift-rejected', () => {
    expect(cli(base({ sdk: { ...base().sdk, changed: false } })).output).toContain('formal SDK release requires an SDK version change');
    const drifted = base({ sdk: { ...base().sdk, version: '9.9.9' }, tag: 'payment-sdk-v9.9.9' });
    expect(cli(drifted).output).toContain('SDK package identity does not match the current workspace');
  });
}, { fixtureRoot });

defineCase({
  ownerId: 'SCN-TEMPLATE-ENGINEERING-004', caseId: 'publish-order', fixtureCase: 'publish-order', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-004', caseKey: 'publish-order', checks: ['dependency-order-publish'] }],
}, async ({ checkpoint, expect }) => {
  await checkpoint('dependency-order-publish', () => {
    const plan = createSdkReleasePlan({ record: base(), protocolState: 'missing', sdkState: 'missing' });
    expect(plan.map(step => step.name)).toEqual(['build-protocol', 'publish-protocol', 'build-sdk', 'publish-sdk']);
    expect(plan[0]?.command).toEqual({
      file: 'pnpm',
      args: ['--filter', '@daqian/payment-protocol', 'run', 'build'],
    });
    expect(plan[1]?.command).toEqual({
      file: 'pnpm',
      args: ['--filter', '@daqian/payment-protocol', 'publish', '--no-git-checks', '--registry', releaseRegistry, `--@daqian:registry=${releaseRegistry}`],
    });
    expect(plan[2]?.command).toEqual({
      file: 'pnpm',
      args: ['--filter', '@daqian/payment-sdk', 'run', 'build'],
    });
    expect(plan[3]?.command).toEqual({
      file: 'pnpm',
      args: ['--filter', '@daqian/payment-sdk', 'publish', '--no-git-checks', '--registry', releaseRegistry, `--@daqian:registry=${releaseRegistry}`],
    });
    expect(plan.flatMap(step => step.command.args)).not.toEqual(expect.arrayContaining(['pack', 'check:package']));
    expect(existsSync(resolve('.gitlab-ci.yml'))).toBe(false);
    expect((JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts['sdk-release']).toBe('tsx scripts/sdk-release.ts');
  });
}, { fixtureRoot });
