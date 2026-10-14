import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { planCommand, runByManifest, spawnStep, type PlannedCommand } from './run-by-manifest.ts';

const roots: string[] = [];
const originalUnitMaxWorkers = process.env.TEMPLATE_UNIT_MAX_WORKERS;
afterEach(() => {
  delete process.env.VERIFY_RUN_ID;
  if (originalUnitMaxWorkers === undefined) delete process.env.TEMPLATE_UNIT_MAX_WORKERS;
  else process.env.TEMPLATE_UNIT_MAX_WORKERS = originalUnitMaxWorkers;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** 受控临时根：包名与测试项目名都与仓库不同，用来证明命令确实由清单组装。 */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'template-run-by-manifest-'));
  roots.push(root);
  writeFileSync(
    join(root, 'project.manifest.json'),
    JSON.stringify(
      {
        packages: [
          {
            directory: 'sample-product',
            name: '@sample/product',
            role: 'product',
            form: 'sdk',
            private: false,
            allowedDirectories: ['src'],
            moduleRoots: ['src'],
          },
          {
            directory: 'sample-protocol',
            name: '@sample/protocol',
            role: 'protocol',
            protocolKind: 'idl',
            private: false,
            allowedDirectories: ['src', 'testing'],
            moduleRoots: ['src', 'testing'],
          },
          {
            directory: 'e2e',
            name: '@sample/e2e',
            role: 'test',
            private: true,
            allowedDirectories: ['src', 'tests'],
            moduleRoots: ['src', 'tests'],
          },
        ],
        bindings: [
          {
            name: 'sample-product-idl',
            product: 'sample-product',
            protocol: 'sample-protocol',
            platforms: ['mini'],
          },
        ],
        requiredCommands: ['build'],
        testProjects: [
          {
            name: 'sample-unit',
            class: 'unit',
            config: 'packages/sample-product/vitest.config.ts',
          },
          { name: 'integration', class: 'integration', config: 'packages/e2e/vitest.config.ts' },
          { name: 'mini', class: 'platform', config: 'packages/e2e/vitest.config.weapp.ts' },
        ],
        fingerprints: {
          sourceRoots: ['scripts'],
          buildInputs: [],
          protocolInputs: ['proto-gen.lock'],
        },
        quality: { coverageExclusions: [], maxLinesExemptions: [] },
      },
      null,
      2,
    ),
  );
  for (const [directory, name, dependencies] of [
    ['sample-product', '@sample/product', { '@sample/protocol': 'workspace:*' }],
    ['sample-protocol', '@sample/protocol', undefined],
    ['e2e', '@sample/e2e', undefined],
  ] as const) {
    mkdirSync(join(root, 'packages', directory), { recursive: true });
    writeFileSync(
      join(root, 'packages', directory, 'package.json'),
      JSON.stringify({ name, ...(dependencies ? { dependencies } : {}) }),
    );
  }
  return root;
}

test('assembles build with the protocol package before the product package', () => {
  const root = fixtureRoot();
  expect(planCommand(root, 'build')).toEqual([
    {
      command: 'pnpm',
      args: ['--filter', '@sample/protocol', 'build'],
      env: { NODE_ENV: 'production' },
    },
    {
      command: 'pnpm',
      args: ['--filter', '@sample/product', 'build'],
      env: { NODE_ENV: 'production' },
    },
  ]);
});

test('assembles typecheck from each package tsconfig.build.json plus the root tool configs', () => {
  const root = fixtureRoot();
  expect(planCommand(root, 'typecheck')).toEqual([
    { command: 'tsc', args: ['-p', 'packages/sample-protocol/tsconfig.build.json', '--noEmit'] },
    { command: 'tsc', args: ['-p', 'packages/sample-product/tsconfig.build.json', '--noEmit'] },
    { command: 'tsc', args: ['-p', 'tsconfig.test.json'] },
    { command: 'tsc', args: ['-p', 'tsconfig.tools.json'] },
  ]);
});

test('runs every unit project together with coverage and a single unit report', () => {
  const root = fixtureRoot();
  delete process.env.TEMPLATE_UNIT_MAX_WORKERS;
  process.env.VERIFY_RUN_ID = 'run-42';
  expect(planCommand(root, 'test:unit')).toEqual([
    {
      command: 'vitest',
      args: ['run', '--project', 'sample-unit', '--coverage'],
      env: { VERIFY_REPORT_FILE: join(root, 'artifacts/run-42/reports/unit.json') },
    },
  ]);
});

test('respects an explicit unit worker limit', () => {
  const root = fixtureRoot();
  process.env.TEMPLATE_UNIT_MAX_WORKERS = '1';
  process.env.VERIFY_RUN_ID = 'run-copy';
  expect(planCommand(root, 'test:unit')).toEqual([
    {
      command: 'vitest',
      args: ['run', '--project', 'sample-unit', '--coverage', '--maxWorkers=1'],
      env: { VERIFY_REPORT_FILE: join(root, 'artifacts/run-copy/reports/unit.json') },
    },
  ]);
});

test('runs integration and platform projects with their own report names', () => {
  const root = fixtureRoot();
  expect(planCommand(root, 'test:integration')).toEqual([
    {
      command: 'vitest',
      args: ['run', '--project', 'integration'],
      env: { VERIFY_REPORT_FILE: join(root, 'artifacts/local/reports/integration.json') },
    },
  ]);
  expect(planCommand(root, 'test:e2e:mini')).toEqual([
    {
      command: 'vitest',
      args: ['run', '--project', 'mini'],
      env: { VERIFY_REPORT_FILE: join(root, 'artifacts/local/reports/mini.json') },
    },
  ]);
});

test('passes no-tests through only for an explicit integration project flag', () => {
  const root = fixtureRoot();
  const manifestPath = join(root, 'project.manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    testProjects: Array<Record<string, unknown>>;
  };
  manifest.testProjects[1] = { ...manifest.testProjects[1], passWithNoTests: true };
  writeFileSync(manifestPath, JSON.stringify(manifest));
  expect(planCommand(root, 'test:integration')).toEqual([
    {
      command: 'vitest',
      args: ['run', '--project', 'integration', '--passWithNoTests'],
      env: { VERIFY_REPORT_FILE: join(root, 'artifacts/local/reports/integration.json') },
    },
  ]);
});

test('rejects unknown commands and unregistered platform projects', () => {
  const root = fixtureRoot();
  expect(() => planCommand(root, 'nope')).toThrow(/unknown command nope/);
  expect(() => planCommand(root, 'test:e2e:missing')).toThrow(/is not a registered test project/);
});

test('inserts manifest-registered protocol checks before check:fast steps', () => {
  const root = fixtureRoot();
  expect(planCommand(root, 'check:fast')[0]).toEqual({
    command: 'pnpm',
    args: ['format:check'],
  });
  const manifestPath = join(root, 'project.manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    packages: Array<{ role: string; checks?: string[] }>;
    requiredCommands: string[];
  };
  manifest.packages.find((item) => item.role === 'protocol')!.checks = ['proto:custom'];
  manifest.requiredCommands.push('proto:custom');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  expect(planCommand(root, 'check:fast')[0]).toEqual({
    command: 'pnpm',
    args: ['proto:custom'],
  });

  manifest.requiredCommands = manifest.requiredCommands.filter(
    (command) => command !== 'proto:custom',
  );
  writeFileSync(manifestPath, JSON.stringify(manifest));
  expect(() => planCommand(root, 'check:fast')).toThrow(
    /protocol check proto:custom is not registered/,
  );
});

test('runs planned steps in order and stops at the first non-zero exit code', () => {
  const root = fixtureRoot();
  const seen: string[] = [];
  expect(
    runByManifest(root, 'build', (step) => {
      seen.push(step.command);
      return 0;
    }),
  ).toBe(0);
  expect(seen).toEqual(['pnpm', 'pnpm']);

  const executed: string[] = [];
  const code = runByManifest(root, 'build', (step) => {
    executed.push(step.args[1]!);
    return step.args[1] === '@sample/product' ? 7 : 0;
  });
  expect(code).toBe(7);
  expect(executed).toEqual(['@sample/protocol', '@sample/product']);
});

test('spawns real subprocesses and maps signal termination to failure', () => {
  const ok: PlannedCommand = { command: process.execPath, args: ['-e', 'process.exit(0)'] };
  const failed: PlannedCommand = { command: process.execPath, args: ['-e', 'process.exit(3)'] };
  const missing: PlannedCommand = { command: 'template-run-by-manifest-not-a-binary', args: [] };
  const withEnv: PlannedCommand = {
    command: process.execPath,
    args: ['-e', 'process.exit(process.env.TEMPLATE_PROBE === "1" ? 0 : 4)'],
    env: { TEMPLATE_PROBE: '1' },
  };
  expect(spawnStep(ok)).toBe(0);
  expect(spawnStep(failed)).toBe(3);
  expect(spawnStep(missing)).toBe(1);
  expect(spawnStep(withEnv)).toBe(0);
});
