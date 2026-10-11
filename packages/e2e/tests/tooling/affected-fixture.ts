import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createControlledRoot } from './controlled-root.ts';

/** 仓库根由模块位置推导：受控根中的按需入口用例仍使用仓库自己的脚本与分析工具。 */
export const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const tsx = resolve(repositoryRoot, 'node_modules/.bin/tsx');
const script = resolve(repositoryRoot, 'scripts/test-affected.ts');
const gateScript = resolve(repositoryRoot, 'scripts/check-scenarios.ts');

export const fixtureRelative = '.fixture-bin';

export const scenarioConfig = {
  scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
  flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
  ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
};

/** 按需入口夹具清单：产品/协议/测试包各一个，unit 项目含 test-tools-unit，平台项目一个。 */
export const affectedManifest = (): Record<string, unknown> => ({
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
    // protocol 与 test 包沿用仓库目录名：真实门禁在任务 10 前仍按固定目录读取生成的 IDL。
    {
      directory: 'protocol',
      name: '@daqian/template-protocol',
      role: 'protocol',
      protocolKind: 'idl',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'e2e',
      name: '@daqian/template-e2e',
      role: 'test',
      private: true,
      allowedDirectories: ['src', 'tests', 'host'],
      moduleRoots: ['src', 'tests'],
    },
  ],
  bindings: [
    {
      name: 'sample-product-idl',
      product: 'sample-product',
      protocol: 'protocol',
      platforms: ['sample-platform'],
    },
  ],
  requiredCommands: ['check:fast', 'test:affected'],
  testProjects: [
    { name: 'product-unit', class: 'unit', config: 'packages/sample-product/vitest.config.ts' },
    { name: 'test-tools-unit', class: 'unit', config: 'packages/e2e/vitest.config.unit.ts' },
    { name: 'integration', class: 'integration', config: 'packages/e2e/vitest.config.ts' },
    {
      name: 'sample-platform',
      class: 'platform',
      config: 'packages/e2e/vitest.config.platform.ts',
      perFile: true,
      prepare: 'weapp:prepare',
    },
  ],
  fingerprints: {
    sourceRoots: ['scripts', 'packages/sample-product/src', 'packages/e2e/tests'],
    buildInputs: [
      'package.json',
      'tsconfig.test.json',
      'vitest.config.ts',
      '.dependency-cruiser.cjs',
      'eslint.config.js',
      'packages/*/package.json',
    ],
    protocolInputs: ['proto-gen.lock'],
  },
  quality: { coverageExclusions: [], maxLinesExemptions: [] },
});

const verification = JSON.stringify({
  formatVersion: 2,
  checkpoints: { result: '结果' },
  cases: [
    {
      key: 'normal',
      kind: 'behavior',
      requiredIn: ['integration', 'sample-platform'],
      checks: ['result'],
    },
  ],
  blockedBy: [],
});

const sampleSpec = [
  '### Requirement: SAMPLE-A 按需选择夹具需求',
  '',
  '夹具 SHALL 覆盖按需选择的检查点。',
  '',
  '| FLOW ID | Related | Stages | Cases | Environments | Notes |',
  '| --- | --- | --- | --- | --- | --- |',
  '| FLOW-SAMPLE-A-001 | SCN-SAMPLE-A-001 | prepare → invoke | normal | integration、sample-platform | 夹具 |',
  '',
  '#### Scenario: SCN-SAMPLE-A-001 夹具主场景',
  '',
  '- **WHEN** 夹具',
  '- **THEN** 夹具',
  '',
  '```json verification',
  verification,
  '```',
  '',
  '### Requirement: SAMPLE-B 不相关需求',
  '',
  '不动 SHOULD 保持稳定。',
  '',
  '| FLOW ID | Related | Stages | Cases | Environments | Notes |',
  '| --- | --- | --- | --- | --- | --- |',
  '| FLOW-SAMPLE-B-002 | SCN-SAMPLE-B-002 | prepare → invoke | normal | integration | 夹具 |',
  '',
  '',
  '#### Scenario: SCN-SAMPLE-B-002 不相关场景',
  '',
  '- **WHEN** 夹具',
  '- **THEN** 夹具',
  '',
  '```json verification',
  verification,
  '```',
  '',
].join('\n');

const defineCaseStub = 'export function defineCase(): void {}\n';

const binding = (ownerId: string, environment: string) =>
  [
    `import { defineCase } from '../../src/cases/define-case.ts';`,
    `import { core } from '@sample/product';`,
    '',
    'defineCase(',
    '  {',
    `    ownerId: '${ownerId}',`,
    "    caseId: 'normal',",
    "    fixtureCase: 'normal',",
    `    environment: '${environment}',`,
    `    covers: [{ id: '${ownerId}', caseKey: 'normal', checks: ['result'] }],`,
    '  },',
    '  () => {',
    '    void core;',
    '  },',
    ');',
    '',
  ].join('\n');

/** FLOW 绑定：同一个 ID 的环境扩展与 flowId 选择路径。 */
const flowSpec = [
  "import { defineCase } from '../../src/cases/define-case.ts';",
  "import { core } from '@sample/product';",
  '',
  'defineCase(',
  '  {',
  "    ownerId: 'FLOW-SAMPLE-A-001',",
  "    caseId: 'normal',",
  "    fixtureCase: 'normal',",
  "    environment: 'integration',",
  "    flowId: 'FLOW-SAMPLE-A-001',",
  "    flowCase: 'normal',",
  "    covers: [{ id: 'SCN-SAMPLE-A-001', caseKey: 'normal', checks: ['result'] }],",
  '  },',
  '  () => {',
  '    void core;',
  '  },',
  ');',
  '',
].join('\n');

const toolingSpec = [
  "import { defineCase } from '../../src/cases/define-case.ts';",
  "import { sampled } from '../../../../scripts/lib/affected-sample.ts';",
  '',
  'defineCase(',
  '  {',
  "    ownerId: 'SCN-SAMPLE-TOOL-009',",
  "    caseId: 'tool',",
  "    fixtureCase: 'tool',",
  "    environment: 'integration',",
  "    covers: [{ id: 'SCN-SAMPLE-TOOL-009', caseKey: 'tool', checks: ['result'] }],",
  '  },',
  '  () => {',
  '    void sampled;',
  '  },',
  ');',
  '',
].join('\n');

/**
 * 替身 vitest：按 VERIFY_REPORT_FILE 写出报告，TEST_AFFECTED_PARTIAL=1 时带 partial 标记。
 * `related` 模式按 Vitest 的参数语义解析：`--project` 每次只取一个值，其余位置参数是路径过滤器；
 * 解析出的测试文件由 related 文件推导（同名 `.test.ts`），无命中即打印 Vitest 的 `No test files found`。
 */
const vitestStub = [
  "import { existsSync, mkdirSync, writeFileSync } from 'node:fs';",
  "import { dirname } from 'node:path';",
  '',
  'const args = process.argv.slice(2);',
  'const file = process.env.VERIFY_REPORT_FILE;',
  'const tests = [];',
  "if (args[0] === 'related') {",
  '  const related = [];',
  '  const filters = [];',
  '  let sawFlag = false;',
  '  for (let index = 1; index < args.length; index += 1) {',
  '    const arg = args[index];',
  "    if (arg === '--project') {",
  '      index += 1;',
  '      sawFlag = true;',
  "    } else if (arg.startsWith('-')) sawFlag = true;",
  '    else if (sawFlag) filters.push(arg);',
  '    else related.push(arg);',
  '  }',
  '  for (const source of related) {',
  "    const candidate = source.replace(/\\.ts$/, '.test.ts');",
  '    if (existsSync(candidate) && filters.every((filter) => candidate.includes(filter)))',
  "      tests.push({ file: candidate, fullName: candidate, status: 'passed', assertions: 1 });",
  '  }',
  "  if (tests.length === 0) process.stdout.write('No test files found, exiting with code 0\\n');",
  '}',
  'if (file) {',
  '  mkdirSync(dirname(file), { recursive: true });',
  '  writeFileSync(',
  '    file,',
  '    JSON.stringify({',
  '      runId: process.env.VERIFY_RUN_ID,',
  "      sourceDigest: 'stub',",
  "      specDigest: 'stub',",
  "      protocolDigest: 'stub',",
  "      fixtureDigest: 'stub',",
  "      ...(process.env.TEST_AFFECTED_PARTIAL === '1' ? { partial: true } : {}),",
  '      tests,',
  '    }),',
  '  );',
  '}',
  '',
].join('\n');

const vitestShell = `#!/bin/sh\nexec node "$(dirname "$0")/vitest-stub.mjs" "$@"\n`;

/** 替身 pnpm：只记录调用，用于证明平台文件运行前真的执行了清单登记的 prepare。 */
const pnpmShell = `#!/bin/sh\nprintf '%s\\n' "$*" >> "$(dirname "$0")/pnpm-calls.log"\nexit 0\n`;

function git(root: string, args: ReadonlyArray<string>): void {
  const result = spawnSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'template-fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'template-fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    },
  });
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed in ${root}: ${result.stderr}`);
}

export type AffectedFixture = Readonly<{
  root: string;
  env: NodeJS.ProcessEnv;
  /** 以受控根为工作目录运行 `test:affected`，返回退出码与输出。 */
  run: (args: ReadonlyArray<string>) => Readonly<{ status: number | null; output: string }>;
  /** 以受控根为工作目录运行场景门禁；`env` 用于额外注入 `VERIFY_RUN_ID`。 */
  gate: (
    args: ReadonlyArray<string>,
    env?: Readonly<Record<string, string>>,
  ) => Readonly<{
    status: number | null;
    stdout: string;
    stderr: string;
  }>;
  /** 直接运行替身 vitest，模拟一次全量报告写入（不带 partial）。 */
  writeFullReport: (reportPath: string, runId: string) => void;
  /** 替身 pnpm 记录到的调用（每行一条），用于核对 prepare 是否执行。 */
  pnpmCalls: () => string;
  write: (path: string, content: string) => void;
  read: (path: string) => string;
  cleanup: () => void;
}>;

/** 受控临时根 + 按需入口夹具：清单、Spec、产品/协议/测试包、绑定用例与替身 vitest。 */
export function createAffectedFixture(): AffectedFixture {
  const controlled = createControlledRoot({
    manifest: affectedManifest(),
    files: {
      'scenario-gate.config.json': JSON.stringify(scenarioConfig),
      'openspec/specs/sample/spec.md': sampleSpec,
      'proto-gen.lock': 'fixture\n',
      'tsconfig.test.json': '{}\n',
      'vitest.config.ts': 'export default {};\n',
      '.dependency-cruiser.cjs': 'module.exports = { forbidden: [], options: {} };\n',
      'eslint.config.js': 'export default [];\n',
      'package.json': JSON.stringify({ name: 'affected-fixture', private: true }, null, 2),
      'packages/sample-product/package.json': JSON.stringify(
        {
          name: '@sample/product',
          exports: { '.': './dist/index.js' },
          dependencies: { '@daqian/template-protocol': 'workspace:*' },
        },
        null,
        2,
      ),
      'packages/sample-product/src/index.ts': "export { core } from './core.ts';\n",
      'packages/sample-product/src/core.ts': 'export const core = 1;\n',
      'packages/sample-product/src/core.test.ts': [
        "import { core } from './core.ts';",
        '',
        'export const value = core;',
        '',
      ].join('\n'),
      'packages/protocol/src/index.ts': 'export const protocol = 1;\n',
      'packages/protocol/src/adapters/network/wechat.ts': 'export const wx = 1;\n',
      'packages/e2e/src/cases/define-case.ts': defineCaseStub,
      'packages/e2e/tests/example/SCN-SAMPLE-A-001.spec.ts': binding(
        'SCN-SAMPLE-A-001',
        'integration',
      ),
      'packages/e2e/tests/weapp/SCN-SAMPLE-A-001.spec.ts': binding(
        'SCN-SAMPLE-A-001',
        'sample-platform',
      ),
      'packages/e2e/tests/flows/FLOW-SAMPLE-A-001.spec.ts': flowSpec,
      'packages/e2e/tests/tooling/SCN-SAMPLE-TOOL-009.spec.ts': toolingSpec,
      'packages/e2e/tests/fixtures/SCN-SAMPLE-A-001/base.json': '{}\n',
      'packages/e2e/host/weapp/app.js': 'export const app = 1;\n',
      'packages/e2e/src/drivers/platform.ts': 'export const driver = 1;\n',
      'scripts/lib/affected-sample.ts': 'export const sampled = 1;\n',
      'scripts/lib/affected-sample.test.ts': [
        "import { sampled } from './affected-sample.ts';",
        '',
        'export const value = sampled;',
        '',
      ].join('\n'),
      [`${fixtureRelative}/vitest`]: vitestShell,
      [`${fixtureRelative}/vitest-stub.mjs`]: vitestStub,
      [`${fixtureRelative}/pnpm`]: pnpmShell,
    },
    directories: ['openspec/changes'],
    commit: false,
    prefix: 'affected-root-',
  });
  chmodSync(join(controlled.root, fixtureRelative, 'vitest'), 0o755);
  chmodSync(join(controlled.root, fixtureRelative, 'pnpm'), 0o755);
  git(controlled.root, ['add', '-A']);
  git(controlled.root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture: initial']);
  const env: NodeJS.ProcessEnv = {
    ...controlled.env,
    PATH: `${join(controlled.root, fixtureRelative)}:${controlled.env.PATH ?? ''}`,
  };
  return {
    root: controlled.root,
    env,
    run: (args) => {
      const result = spawnSync(tsx, [script, ...args], {
        cwd: controlled.root,
        env,
        encoding: 'utf8',
      });
      return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
    },
    gate: (args, extraEnv = {}) => {
      const result = spawnSync(tsx, [gateScript, ...args], {
        cwd: controlled.root,
        env: { ...env, ...extraEnv },
        encoding: 'utf8',
      });
      return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    },
    writeFullReport: (reportPath, runId) => {
      const result = spawnSync(
        'node',
        [join(controlled.root, fixtureRelative, 'vitest-stub.mjs')],
        {
          cwd: controlled.root,
          env: { ...env, VERIFY_REPORT_FILE: reportPath, VERIFY_RUN_ID: runId },
          encoding: 'utf8',
        },
      );
      if (result.status !== 0) throw new Error(`stub vitest failed: ${result.stderr}`);
    },
    pnpmCalls: () => {
      const log = join(controlled.root, fixtureRelative, 'pnpm-calls.log');
      return existsSync(log) ? readFileSync(log, 'utf8') : '';
    },
    write: (path, content) => {
      const target = join(controlled.root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    read: (path) => readFileSync(join(controlled.root, path), 'utf8'),
    cleanup: controlled.cleanup,
  };
}
