import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlledRoot } from './controlled-root.ts';
import { enableInventory } from './scenario-gate-helpers.ts';

/** 仓库根由模块位置推导：副本中的验收入口用例指向副本自身的脚本与依赖。 */
export const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const tsx = resolve(repositoryRoot, 'node_modules/.bin/tsx');
const gateScript = resolve(repositoryRoot, 'scripts/check-scenarios.ts');
export const fixtureRelative = 'verify-fixture';

export type VerifyInvocation = Readonly<{
  label: string;
  argv: ReadonlyArray<string>;
  runId?: string;
  changeScope?: string;
  reportFile?: string;
  /** 逐文件替身记录的 Vitest 项目名与测试文件名。 */
  project?: string;
  file?: string;
}>;

export type VerifyFixture = Readonly<{
  root: string;
  /** 在夹具根中运行 `pnpm verify`，返回退出码与合并后的输出。 */
  run: (args: ReadonlyArray<string>) => Readonly<{ status: number | null; output: string }>;
  invocations: () => ReadonlyArray<VerifyInvocation>;
  clearInvocations: () => void;
  setFailures: (failures: Readonly<Record<string, number>>) => void;
  cleanup: () => void;
}>;

/**
 * 夹具替身记录一次调用：标签、参数与验收相关环境变量，供用例按步骤核对。
 */
const stubLibrary = [
  "import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
  "import { dirname, join } from 'node:path';",
  '',
  'export function record(label, extra = {}) {',
  "  appendFileSync(join(process.cwd(), 'verify-fixture', 'invocations.ndjson'), JSON.stringify({",
  '    label,',
  '    argv: process.argv.slice(2),',
  '    runId: process.env.VERIFY_RUN_ID,',
  '    changeScope: process.env.SCENARIO_GATE_CHANGES,',
  '    reportFile: process.env.VERIFY_REPORT_FILE,',
  '    ...extra,',
  "  }) + '\\n');",
  '}',
  '',
  '/** 写一份可被真实场景门禁读到的探针报告：缺 binding，门禁会给出报告路径。 */',
  'export function writeProbeReport(path, tests = [{ caseId: "probe", status: "passed" }]) {',
  '  mkdirSync(dirname(path), { recursive: true });',
  '  writeFileSync(path, JSON.stringify({',
  '    runId: process.env.VERIFY_RUN_ID,',
  "    sourceDigest: 'probe',",
  "    specDigest: 'probe',",
  "    protocolDigest: 'probe',",
  "    fixtureDigest: 'probe',",
  '    tests,',
  '  }));',
  '}',
  '',
  '/** 失败控制：failures.json 记录每个键剩余失败次数，每次命中时递减。 */',
  'export function consumeFailure(key) {',
  "  const path = join(process.cwd(), 'verify-fixture', 'failures.json');",
  '  let failures = {};',
  '  try {',
  "    failures = JSON.parse(readFileSync(path, 'utf8'));",
  '  } catch {',
  '    failures = {};',
  '  }',
  "  const remaining = typeof failures[key] === 'number' ? failures[key] : 0;",
  '  if (remaining <= 0) return false;',
  '  failures[key] = remaining - 1;',
  '  writeFileSync(path, JSON.stringify(failures));',
  '  return true;',
  '}',
  '',
].join('\n');

const checkFastStub = [
  "import { join } from 'node:path';",
  "import { consumeFailure, record, writeProbeReport } from './lib.mjs';",
  '',
  "record('check:fast');",
  'const reports = join(process.cwd(), "artifacts", process.env.VERIFY_RUN_ID, "reports");',
  'writeProbeReport(join(reports, "unit.json"));',
  'writeProbeReport(join(reports, "integration.json"));',
  "process.exit(consumeFailure('check:fast') ? 1 : 0);",
  '',
].join('\n');

const samplePlatformStub = [
  "import { join } from 'node:path';",
  "import { consumeFailure, record, writeProbeReport } from './lib.mjs';",
  '',
  "record('test:e2e:sample-platform');",
  'writeProbeReport(',
  '  join(process.cwd(), "artifacts", process.env.VERIFY_RUN_ID, "reports", "sample-platform.json"),',
  ');',
  "process.exit(consumeFailure('sample-platform') ? 1 : 0);",
  '',
].join('\n');

const prepareStub = [
  "import { consumeFailure, record } from './lib.mjs';",
  '',
  "record('weapp:prepare');",
  "process.exit(consumeFailure('weapp:prepare') ? 1 : 0);",
  '',
].join('\n');

/** 逐文件运行的替身：按最后一个参数取测试文件，失败次数由 failures.json 控制。 */
const vitestStub = [
  "import { basename } from 'node:path';",
  "import { consumeFailure, record, writeProbeReport } from './lib.mjs';",
  '',
  'const args = process.argv.slice(2);',
  'const file = args[args.length - 1];',
  "record('vitest', { project: args[args.indexOf('--project') + 1], file: basename(file) });",
  'const failed = consumeFailure(basename(file));',
  'if (process.env.VERIFY_REPORT_FILE) {',
  '  writeProbeReport(process.env.VERIFY_REPORT_FILE, [',
  '    { caseId: "probe", status: failed ? "failed" : "passed" },',
  '  ]);',
  '}',
  'process.exit(failed ? 1 : 0);',
  '',
].join('\n');

/** 真实场景门禁包装：先记录步骤，再以同一 run id 运行门禁并透传退出码。 */
const checkScenariosStub = [
  "import { spawnSync } from 'node:child_process';",
  "import { record } from './lib.mjs';",
  '',
  "record('check:scenarios');",
  'const result = spawnSync(process.env.VERIFY_FIXTURE_TSX, [process.env.VERIFY_FIXTURE_GATE], {',
  "  stdio: 'inherit',",
  '});',
  'process.exit(result.status ?? 1);',
  '',
].join('\n');

/** 不该被调用的整项目命令：记录后失败，暴露错误的运行方式。 */
const unexpectedStub = [
  "import { record } from './lib.mjs';",
  '',
  "record('unexpected');",
  'process.exit(1);',
  '',
].join('\n');

const vitestBin = '#!/bin/sh\nexec node "$(dirname "$0")/../stubs/vitest.mjs" "$@"\n';

const sampleConfig =
  'export default { test: { include: ["verify-fixture/platform/sample/**/*.spec.ts"] } };\n';
const deviceConfig =
  'export default { test: { include: ["verify-fixture/platform/device/**/*.spec.ts"] } };\n';

const scenarioGateConfig = {
  scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
  flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
  ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
};

const verificationBlock = () =>
  [
    '',
    '```json verification',
    JSON.stringify({
      formatVersion: 2,
      checkpoints: { result: '结果' },
      cases: [{ key: 'normal', kind: 'behavior', requiredIn: ['integration'], checks: ['result'] }],
      blockedBy: [],
    }),
    '```',
    '',
  ].join('\n');

const sampleSpec = [
  '### Requirement: VERIFY-01 验收入口夹具',
  '',
  '系统 SHALL 提供验收入口夹具。',
  '',
  '#### Scenario: SCN-SAMPLE-VERIFY-001 夹具主场景',
  '',
  '- **WHEN** 夹具',
  '- **THEN** 夹具',
  verificationBlock(),
].join('\n');

const changeDelta = (name: string, id: string) =>
  [
    '## ADDED Requirements',
    '',
    `### Requirement: ${name}`,
    '',
    '系统 SHALL 提供夹具增量。',
    '',
    `#### Scenario: ${id} 夹具增量场景`,
    '',
    '- **WHEN** 夹具',
    '- **THEN** 夹具',
    verificationBlock(),
  ].join('\n');

/** 夹具清单：仓库清单的包与协议来源，替换平台类项目为一个整体运行、一个逐文件运行。 */
function fixtureManifest(): Record<string, unknown> {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'project.manifest.json'), 'utf8'),
  ) as {
    requiredCommands: string[];
    testProjects: Array<Record<string, unknown>>;
  };
  manifest.testProjects = [
    ...manifest.testProjects.filter((project) => project.class !== 'platform'),
    {
      name: 'sample-platform',
      class: 'platform',
      config: `${fixtureRelative}/vitest.config.sample.mjs`,
    },
    {
      name: 'device-platform',
      class: 'platform',
      config: `${fixtureRelative}/vitest.config.device.mjs`,
      perFile: true,
      prepare: 'weapp:prepare',
    },
  ];
  manifest.requiredCommands = [
    ...new Set([
      ...manifest.requiredCommands,
      'verify',
      'weapp:prepare',
      'test:e2e:sample-platform',
      'test:e2e:device-platform',
    ]),
  ];
  return manifest;
}

function fixturePackageJson(): Record<string, unknown> {
  return {
    name: 'verify-fixture',
    private: true,
    type: 'module',
    scripts: {
      verify: `${tsx} ${resolve(repositoryRoot, 'scripts/verify.ts')}`,
      check: 'pnpm verify',
      'check:fast': `node ${fixtureRelative}/stubs/check-fast.mjs`,
      'check:scenarios': `node ${fixtureRelative}/stubs/check-scenarios.mjs`,
      'test:e2e:sample-platform': `node ${fixtureRelative}/stubs/sample-platform.mjs`,
      'test:e2e:device-platform': `node ${fixtureRelative}/stubs/unexpected.mjs`,
      'weapp:prepare': `node ${fixtureRelative}/stubs/prepare.mjs`,
    },
  };
}

function git(root: string, args: ReadonlyArray<string>): void {
  const result = spawnSync('git', [...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

/**
 * 验收入口夹具：清单登记两个 platform 类项目（其一 perFile + prepare，含 2 个测试文件），
 * 步骤命令与 prepare 以可观测替身实现，门禁步骤由真实 `check-scenarios` 承担。
 */
export function createVerifyFixture(prefix = 'verify-fixture-'): VerifyFixture {
  const controlled = createControlledRoot({
    manifest: fixtureManifest(),
    files: {
      'scenario-gate.config.json': JSON.stringify(scenarioGateConfig),
      'package.json': JSON.stringify(fixturePackageJson(), null, 2),
      [`${fixtureRelative}/vitest.config.sample.mjs`]: sampleConfig,
      [`${fixtureRelative}/vitest.config.device.mjs`]: deviceConfig,
      [`${fixtureRelative}/platform/device/first.spec.ts`]: '// 夹具占位，逐文件运行由替身承担。\n',
      [`${fixtureRelative}/platform/device/second.spec.ts`]:
        '// 夹具占位，逐文件运行由替身承担。\n',
      [`${fixtureRelative}/stubs/lib.mjs`]: stubLibrary,
      [`${fixtureRelative}/stubs/check-fast.mjs`]: checkFastStub,
      [`${fixtureRelative}/stubs/sample-platform.mjs`]: samplePlatformStub,
      [`${fixtureRelative}/stubs/prepare.mjs`]: prepareStub,
      [`${fixtureRelative}/stubs/vitest.mjs`]: vitestStub,
      [`${fixtureRelative}/stubs/check-scenarios.mjs`]: checkScenariosStub,
      [`${fixtureRelative}/stubs/unexpected.mjs`]: unexpectedStub,
      [`${fixtureRelative}/bin/vitest`]: vitestBin,
      'openspec/specs/sample/spec.md': sampleSpec,
      'openspec/changes/A/specs/sample/spec.md': changeDelta(
        'VERIFY-02 夹具 A 增量',
        'SCN-SAMPLE-VERIFY-002',
      ),
      'openspec/changes/B/specs/sample/spec.md': changeDelta(
        'VERIFY-03 夹具 B 增量',
        'SCN-SAMPLE-VERIFY-003',
      ),
    },
    prefix,
  });
  enableInventory(controlled.root);
  chmodSync(join(controlled.root, fixtureRelative, 'bin/vitest'), 0o755);
  git(controlled.root, ['checkout', '-q', '-b', 'feat/scope']);
  const env: NodeJS.ProcessEnv = {
    ...controlled.env,
    PATH: `${join(controlled.root, fixtureRelative, 'bin')}:${controlled.env.PATH ?? ''}`,
    VERIFY_FIXTURE_TSX: tsx,
    VERIFY_FIXTURE_GATE: gateScript,
  };
  const logPath = join(controlled.root, fixtureRelative, 'invocations.ndjson');
  return {
    root: controlled.root,
    run: (args) => {
      const result = spawnSync('pnpm', ['verify', ...args], {
        cwd: controlled.root,
        env,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
    },
    invocations: () =>
      readFileSync(logPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as VerifyInvocation),
    clearInvocations: () => writeFileSync(logPath, ''),
    setFailures: (failures) =>
      writeFileSync(
        join(controlled.root, fixtureRelative, 'failures.json'),
        JSON.stringify(failures),
      ),
    cleanup: controlled.cleanup,
  };
}
