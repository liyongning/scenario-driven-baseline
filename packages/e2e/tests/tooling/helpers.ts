import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

/** 在根 AGENTS.md 与 README.md 中补一条指向文档的相对链接（已存在则跳过）。 */
function linkRootDocument(root: string, link: string) {
  for (const file of ['AGENTS.md', 'README.md']) {
    const path = join(root, file);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (!current.includes(link))
      writeFileSync(path, `${current.trimEnd()}\n\n${link}\n`.trimStart());
  }
}

/** 临时架构根的合法技术架构文档：与指南能力地图同名，四部分齐全。 */
export function writeArchitectureFixture(root: string) {
  const sections = ['解决的问题', '实现机制与关键文件', '关键设计决策与被否决的方案', '演进记录'];
  const capabilityNames = [
    '临时能力',
    '组合绑定',
    '协议适配器',
    'Web 应用包（含前端架构规范）',
    '产物边界',
    'OpenAPI 协议包',
    '浏览器平台点位',
    '本地预览',
    'Web 示例',
  ];
  const document = [
    '# 技术架构',
    '',
    '## 粗略层',
    '',
    '（临时根占位）',
    '',
    '## 细节层',
    '',
    ...capabilityNames.flatMap((capability) => [
      `### ${capability}`,
      '',
      ...sections.flatMap((name) => [`#### ${name}`, '', '（临时根占位）', '']),
    ]),
  ].join('\n');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs/architecture.md'), document);
  linkRootDocument(root, '[技术架构](docs/architecture.md)');
}

/**
 * 临时架构根的合法使用指南：规定章节齐全、删除白名单完整、能力地图与架构文档同名，
 * 且不含 Scenario ID、pnpm 命令与清单字段引用。
 */
export function writeTemplateGuideFixture(
  root: string,
  directories: { product: string; protocol: string; test: string } = {
    product: 'sdk',
    protocol: 'protocol',
    test: 'e2e',
  },
) {
  const { product, protocol, test } = directories;
  const guide = [
    '# 模板使用指南',
    '',
    '## 能力地图',
    '',
    '| 能力 | 承载文件 | 验证方式 |',
    '| --- | --- | --- |',
    '| 临时能力 | 临时根占位 | 无 |',
    '| 组合绑定 | 临时根占位 | 无 |',
    '| 协议适配器 | 临时根占位 | 无 |',
    '| Web 应用包（含前端架构规范） | 临时根占位 | 无 |',
    '| 产物边界 | 临时根占位 | 无 |',
    '| OpenAPI 协议包 | 临时根占位 | 无 |',
    '| 浏览器平台点位 | 临时根占位 | 无 |',
    '| 本地预览 | 临时根占位 | 无 |',
    '',
    '<!-- web-example:begin -->',
    '',
    '| 能力 | 承载文件 | 验证方式 |',
    '| --- | --- | --- |',
    '| Web 示例 | 临时根占位 | 无 |',
    '',
    '<!-- web-example:end -->',
    '',
    '## 从方案到验收',
    '',
    '（临时根占位）',
    '',
    '## 初始化方式',
    '',
    '（临时根占位）',
    '',
    '## 移除模板示例',
    '',
    `删除白名单：\`packages/${product}/src/example/\`、\`packages/${protocol}/testing/shadow/example/\`、`,
    `\`packages/${test}/tests/example/\`、\`packages/${test}/tests/weapp/example/\`、`,
    `\`packages/${test}/host/weapp/example-runner.ts\`、\`packages/${test}/tests/fixtures/\` 下的`,
    '`SCN-TEMPLATE-EXAMPLE-*` 与 `FLOW-TEMPLATE-EXAMPLE-*`、',
    `\`packages/${test}/tests/tooling/SCN-TEMPLATE-EXAMPLE-*\`、\`openspec/specs/template-example/\`、`,
    `\`packages/${test}/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts\` 与`,
    `\`packages/${test}/tests/tooling/example-removal-support.ts\`、`,
    `Fixture \`packages/${test}/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/\`、`,
    `\`packages/${test}/tests/protocol/SCN-PROTOCOL-CONTRACT-002-extension.spec.ts\`；`,
    '片段从 `template-example:begin` 到 `template-example:end`；',
    `\`packages/${product}/src/index.ts\` 的示例导出、\`consumed-operations.ts\` 的示例条目、`,
    `\`packages/${test}/host/weapp/app.js\`、\`packages/${test}/src/drivers/weapp-host.test.ts\` 中的示例运行器片段；`,
    '`protocol-matrix.json` 中的示例键删除后用 `fixtures:refresh` 重算摘要；',
    '同步 `coverageExclusions`。',
    'Web 示例白名单包含 `openspec/specs/web-example/`、`packages/web/src/trade-create/`、',
    '`packages/web/src/trade-list/`、`packages/web/src/trade-status/`、',
    '`packages/e2e/tests/fixtures/_datasets/trade-in-progress/`、',
    '`packages/e2e/tests/fixtures/_datasets/trade-completed/`、',
    '`SCN-WEB-EXAMPLE-*`、`FLOW-WEB-EXAMPLE-*`、`packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-*`、',
    '`web-example:begin` 与 `web-example:end`；',
    '`packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`。',
    '',
    '## 归档已知限制',
    '',
    '（临时根占位）',
    '',
    '## 版本对齐',
    '',
    '（临时根占位）',
    '',
    '## 使用方约定',
    '',
    '（临时根占位）',
    '',
    '## 复刻验收',
    '',
    '（临时根占位）',
    '',
    '## 移除一条绑定',
    '',
    '（临时根占位）',
    '',
    '## 跨源部署',
    '',
    '（临时根占位）',
    '',
    '## 替换点地图',
    '',
    '### 产品形态',
    '',
    '（临时根占位）',
    '',
    '### 协议来源',
    '',
    '（临时根占位）',
    '',
    '### 运行平台',
    '',
    '（临时根占位）',
    '',
    '### 本地预览',
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
  writeArchitectureFixture(root);
  linkRootDocument(root, '[模板使用指南](docs/template-guide.md)');
}

/** 模块级 AGENTS.md 的固定五节骨架；没有内容的节写「无」，不得删节。 */
export function moduleSkeleton(): string {
  const sections = ['职责', '对外入口', '允许依赖', '本地约束', '子模块'];
  return `# AGENTS.md\n\n${sections.map((name) => `## ${name}\n\n无\n`).join('\n')}`;
}

/** 覆盖或追加一个二级标题小节：已有同名小节时先删除，保证夹具可重复生成。 */
function replaceSection(path: string, heading: string, lines: ReadonlyArray<string>): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const kept: string[] = [];
  let skipping = false;
  for (const line of existing.split('\n')) {
    if (/^##\s+/.test(line)) skipping = line.trim() === `## ${heading}`;
    if (!skipping) kept.push(line);
  }
  const body = lines.length > 0 ? lines.join('\n') : '无';
  const content = `${kept.join('\n').trimEnd()}\n\n## ${heading}\n\n${body}\n`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** 模块目录：清单 `moduleRoots` 每个根下的一级子目录，生成目录、夹具与隐藏目录不算模块。 */
function fixtureModules(root: string, packages: ReadonlyArray<FixturePackage>): string[] {
  const modules: string[] = [];
  for (const pkg of packages) {
    for (const moduleRoot of pkg.moduleRoots ?? ['src']) {
      const base = join(root, 'packages', pkg.directory, moduleRoot);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        if (['generated', 'fixtures', 'node_modules'].includes(entry.name)) continue;
        modules.push(`packages/${pkg.directory}/${moduleRoot}/${entry.name}`);
      }
    }
  }
  return modules;
}

type FixturePackage = Readonly<{
  directory: string;
  role: string;
  moduleRoots?: ReadonlyArray<string>;
}>;

/**
 * 项目地图夹具：根「项目地图」小节、各包「子模块」小节、模块级 AGENTS.md 骨架与全部 CLAUDE.md 配对。
 * 内容按清单与真实目录生成，架构检查的其余夹具只需在最后调用一次即可保持合法。
 */
export function writeProjectMapFixture(root: string): void {
  const manifest = JSON.parse(readFileSync(join(root, 'project.manifest.json'), 'utf8')) as {
    packages: ReadonlyArray<FixturePackage>;
  };
  const modules = fixtureModules(root, manifest.packages);
  for (const module of modules) {
    const agents = join(root, module, 'AGENTS.md');
    if (!existsSync(agents)) writeFileSync(agents, moduleSkeleton());
  }
  replaceSection(
    join(root, 'AGENTS.md'),
    '项目地图',
    manifest.packages.map(
      (pkg) =>
        `- \`packages/${pkg.directory}\`（${pkg.role}）：[AGENTS](packages/${pkg.directory}/AGENTS.md)`,
    ),
  );
  for (const pkg of manifest.packages) {
    const listed = modules.filter((module) => module.startsWith(`packages/${pkg.directory}/`));
    replaceSection(
      join(root, 'packages', pkg.directory, 'AGENTS.md'),
      '子模块',
      listed.map((module) => `- \`${module}\``),
    );
  }
  for (const agents of [
    'AGENTS.md',
    ...manifest.packages.map((pkg) => `packages/${pkg.directory}/AGENTS.md`),
    ...modules.map((module) => `${module}/AGENTS.md`),
  ]) {
    writeFileSync(join(root, agents.replace(/AGENTS\.md$/, 'CLAUDE.md')), '@AGENTS.md\n');
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
