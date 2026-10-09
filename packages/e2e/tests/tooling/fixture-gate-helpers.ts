import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createControlledRoot } from './controlled-root.ts';
import {
  findOwnerRequirement,
  projectEffectiveSpecs,
  requirementDigest,
} from '../../../../scripts/lib/spec-sources.ts';

/** Fixture 用例的仓库根与门禁脚本：全部由模块位置推导，不依赖调用方工作目录。 */
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const fixturesScript = resolve(repositoryRoot, 'scripts/check-fixtures.ts');
const refreshScript = resolve(repositoryRoot, 'scripts/fixtures-refresh.ts');
const tsx = resolve(repositoryRoot, 'node_modules/.bin/tsx');

export const fixtureScenarioConfig = {
  scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
  flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
  ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
};

/** 受控根的主 Spec：一个 Scenario owner 与一个 FLOW owner 同属 BASE-01。 */
export const baseSpecText = [
  '# Sample Specification',
  '',
  '## Purpose',
  '受控门禁用例的样例 Spec。',
  '## Requirements',
  '### Requirement: BASE-01 交易示例',
  '',
  '系统 SHALL 提供交易示例。',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
  '',
  '- **WHEN** 调用创建交易',
  '- **THEN** 返回订单号',
  '',
  '| FLOW ID | Related | Stages | Cases | Environments | Notes |',
  '| --- | --- | --- | --- | --- | --- |',
  '| FLOW-SAMPLE-FLOW-001 | SCN-SAMPLE-CONTRACT-001 | create → result | normal | integration | |',
  '',
  '### Requirement: BASE-02 查询示例',
  '',
  '系统 SHALL 提供查询示例。',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-002 查询交易',
  '',
  '- **WHEN** 查询',
  '- **THEN** 返回状态',
  '',
].join('\n');

export type ControlledFixtureRoot = Readonly<{
  root: string;
  fixtures: string;
  specPath: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
}>;

/** 受控 Fixture 门禁根：清单、主 Spec、可选 active Change 与固定版本 OpenSpec CLI。 */
export function controlledFixtureRoot(
  options: Readonly<{
    spec?: string;
    changes?: Readonly<Record<string, string>>;
    openspec?: 'real';
  }> = {},
): ControlledFixtureRoot {
  const controlled = createControlledRoot({
    files: { 'scenario-gate.config.json': JSON.stringify(fixtureScenarioConfig) },
    ...(options.openspec === 'real' ? { openspec: 'real' as const } : {}),
    prefix: 'fixture-gate-',
  });
  const specPath = join(controlled.root, 'openspec/specs/sample/spec.md');
  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, options.spec ?? baseSpecText);
  for (const [name, content] of Object.entries(options.changes ?? {})) {
    const path = join(controlled.root, 'openspec/changes', name, 'specs/sample/spec.md');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return {
    root: controlled.root,
    fixtures: join(controlled.root, 'packages/e2e/tests/fixtures'),
    specPath,
    env: controlled.env,
    cleanup: controlled.cleanup,
  };
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** 写入一个 Fixture 目录：manifest 的 spec 来源只记 requirementDigest。 */
export function writeOwnerFixture(
  gate: ControlledFixtureRoot,
  owner: string,
  options: Readonly<{
    requirementDigest?: string;
    legacyPath?: string;
    omitDigest?: boolean;
    caseText?: string;
  }> = {},
) {
  const directory = join(gate.fixtures, owner);
  mkdirSync(directory, { recursive: true });
  const caseText = options.caseText ?? '{"request":"fixture","response":{}}';
  writeFileSync(join(directory, 'case.json'), caseText);
  const spec = options.legacyPath
    ? { path: options.legacyPath, sha256: sha('legacy') }
    : options.omitDigest
      ? {}
      : { requirementDigest: options.requirementDigest };
  const manifest = {
    formatVersion: 1,
    ownerId: owner,
    sources: { spec },
    cases: { case: 'case.json' },
    sha256: { 'case.json': sha(caseText) },
  };
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
  return directory;
}

/** 按当前生效 Spec（可指定作用域）计算 owner 的 Requirement 摘要，供受控 Fixture 作为初始正确值。 */
export async function ownerDigest(
  root: string,
  owner: string,
  changes?: ReadonlyArray<string>,
): Promise<string> {
  const projection = await projectEffectiveSpecs(root, changes ? { changes } : {});
  const requirement = findOwnerRequirement(projection.requirements, owner);
  if (!requirement) throw new Error(`${owner} not found in effective specs`);
  return requirementDigest(requirement.block);
}

type CliResult = Readonly<{
  status: number | null;
  output: Readonly<{
    manifests?: number;
    updated?: ReadonlyArray<string>;
    issues: ReadonlyArray<string>;
    help?: string;
  }>;
  stdout: string;
  stderr: string;
}>;

function runCli(script: string, root: string, args: ReadonlyArray<string>, env = {}): CliResult {
  // 受控根有自己的 active Change 集合：剔除调用方的作用域，避免外层 SCENARIO_GATE_CHANGES 泄漏。
  const base = { ...process.env };
  delete base.SCENARIO_GATE_CHANGES;
  const result = spawnSync(tsx, [script, ...args], {
    cwd: root,
    env: { ...base, ...env },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: result.stdout ? (JSON.parse(result.stdout) as CliResult['output']) : { issues: [] },
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** 在受控根上运行 check:fixtures CLI。 */
export function runFixtureCli(
  gate: ControlledFixtureRoot,
  args: ReadonlyArray<string> = [],
  env = {},
): CliResult {
  return runCli(fixturesScript, gate.root, ['--root', gate.fixtures, ...args], env);
}

/** 在受控根上运行 fixtures:refresh CLI。 */
export function runRefreshCli(
  gate: ControlledFixtureRoot,
  owners: ReadonlyArray<string>,
  env = {},
): CliResult {
  return runCli(refreshScript, gate.root, owners, env);
}

/** 读取仍写有旧 path 字段的遗留 manifest 文本，供反例断言未写入。 */
export const manifestText = (directory: string): string =>
  readFileSync(join(directory, 'manifest.json'), 'utf8');

/** 在受控根上运行固定版本的 OpenSpec CLI（openspec: 'real' 时 PATH 指向仓库 node_modules/.bin）。 */
export function runOpenspec(gate: ControlledFixtureRoot, args: ReadonlyArray<string>) {
  return spawnSync('openspec', args, { cwd: gate.root, env: gate.env, encoding: 'utf8' });
}
