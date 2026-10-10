import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import type { CoverageInput } from '../../../../scripts/check-scenarios.ts';
import { minimalManifest } from './controlled-root.ts';

/** 仓库根由模块位置推导，helper 不依赖调用方的工作目录。 */
export const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

export type DeepMutable<T> =
  T extends ReadonlyArray<infer Item>
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;
export type MutableCoverageInput = DeepMutable<CoverageInput>;

export const current = {
  runId: 'tooling-run',
  sourceDigest: 'source',
  specDigest: 'spec',
  protocolDigest: 'idl',
  fixtureDigest: 'fixture',
} as const;

export function baseCoverage(): CoverageInput {
  return {
    current,
    scenarios: [
      {
        id: 'SCN-SAMPLE-TEST-001',
        cases: [
          { key: 'normal', kind: 'behavior', requiredIn: ['integration'], checks: ['result'] },
        ],
      },
    ],
    contracts: [],
    flows: [
      {
        id: 'FLOW-SAMPLE-001',
        cases: ['normal'],
        requiredIn: ['integration'],
        requiredStages: ['prepare', 'invoke', 'query', 'result'],
      },
    ],
    bindings: [
      {
        ownerId: 'FLOW-SAMPLE-001',
        caseId: 'normal',
        fixtureCase: 'normal',
        environment: 'integration',
        covers: [{ id: 'SCN-SAMPLE-TEST-001', caseKey: 'normal', checks: ['result'] }],
        flowId: 'FLOW-SAMPLE-001',
        flowCase: 'normal',
      },
    ],
    reports: [
      {
        ...current,
        project: 'integration',
        file: 'normal.spec.ts',
        fullName: 'FLOW-SAMPLE-001 normal',
        caseId: 'normal',
        status: 'passed',
        assertions: 1,
        checkpoints: ['result'],
        flow: {
          id: 'FLOW-SAMPLE-001',
          caseKey: 'normal',
          continuityId: 'run-one',
          stages: ['prepare', 'invoke', 'query', 'result'],
        },
      },
    ],
  };
}

export function runScenarioCli(input: CoverageInput) {
  const directory = mkdtempSync(`${tmpdir()}/template-scenario-cli-`);
  const inputPath = resolve(directory, 'input.json');
  writeFileSync(inputPath, JSON.stringify(input));
  try {
    const result = spawnSync(
      resolve('node_modules/.bin/tsx'),
      ['scripts/check-scenarios.ts', '--input', inputPath],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

/** 临时架构根的合法使用指南：规定章节齐全，且不含 Scenario ID、pnpm 命令与清单字段引用。 */
export function writeTemplateGuideFixture(root: string) {
  const guide = [
    '# 模板使用指南',
    '',
    '## 能力地图',
    '',
    '（临时根占位）',
    '',
    '## 从方案到验收',
    '',
    '（临时根占位）',
    '',
    '## 初始化方式',
    '',
    '（临时根占位）',
    '',
    '## 替换点地图',
    '',
    '### 协议来源',
    '',
    '（临时根占位）',
    '',
    '### 运行平台',
    '',
    '（临时根占位）',
    '',
    '### 包发布',
    '',
    '（临时根占位）',
    '',
  ].join('\n');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs/template-guide.md'), guide);
  const link = '[模板使用指南](docs/template-guide.md)';
  for (const file of ['AGENTS.md', 'README.md']) {
    const path = join(root, file);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (!current.includes(link))
      writeFileSync(path, `${current.trimEnd()}\n\n${link}\n`.trimStart());
  }
}

/** 门禁逻辑自测的受控输入：写入最小清单，不读取仓库实时状态。 */
export async function writeProjectManifest(root: string) {
  await writeFile(join(root, 'project.manifest.json'), JSON.stringify(minimalManifest(), null, 2));
}

/** 覆盖门禁自测的基线输入：一个行为 Scenario、一个协议义务与一条连续 FLOW 报告。 */
export function base(): CoverageInput {
  return {
    current: {
      runId: 'run-1',
      sourceDigest: 'source',
      specDigest: 'spec',
      protocolDigest: 'idl',
      fixtureDigest: 'fixture',
    },
    scenarios: [
      {
        id: 'SCN-SAMPLE-CORE-001',
        cases: [
          {
            key: 'normal',
            kind: 'behavior',
            requiredIn: ['integration', 'weapp'],
            checks: ['phase', 'result'],
          },
        ],
      },
    ],
    contracts: [{ id: 'method#request#field', cases: ['normal'], requiredIn: ['integration'] }],
    flows: [
      {
        id: 'FLOW-SAMPLE-001',
        cases: ['normal'],
        requiredIn: ['integration'],
        requiredStages: ['prepare', 'invoke', 'query', 'result'],
      },
    ],
    bindings: [
      {
        ownerId: 'FLOW-SAMPLE-001',
        caseId: 'flow-normal',
        fixtureCase: 'normal',
        environment: 'integration',
        covers: [
          { id: 'SCN-SAMPLE-CORE-001', caseKey: 'normal', checks: ['phase', 'result'] },
          {
            id: 'method#request#field',
            caseKey: 'normal',
            checks: ['method#request#field/normal'],
          },
        ],
        flowId: 'FLOW-SAMPLE-001',
        flowCase: 'normal',
      },
    ],
    reports: [
      {
        runId: 'run-1',
        sourceDigest: 'source',
        specDigest: 'spec',
        protocolDigest: 'idl',
        fixtureDigest: 'fixture',
        project: 'integration',
        file: 'flow.spec.ts',
        fullName: 'FLOW-SAMPLE-001 normal',
        caseId: 'flow-normal',
        status: 'passed',
        assertions: 3,
        checkpoints: ['phase', 'result', 'method#request#field/normal'],
        flow: {
          id: 'FLOW-SAMPLE-001',
          caseKey: 'normal',
          continuityId: 'one-run',
          stages: ['prepare', 'invoke', 'query', 'result'],
        },
      },
    ],
  };
}
