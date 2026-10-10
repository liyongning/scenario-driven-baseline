// @SCN-TEMPLATE-ENGINEERING-008: 按白名单删除模板示例后门禁仍全绿。
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, vi, type TestContext } from 'vitest';
import {
  loadProjectManifest,
  packageByRole,
  testProjectsByClass,
} from '../../../../scripts/lib/project-manifest.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { copyCreatingSpecs } from '../../vitest.config.integration.ts';
import { repositoryRoot } from './helpers.ts';
import {
  createRepositoryCopy,
  scopedChangeNames,
  workspaceRealpath,
  type RepositoryCopy,
} from './repository-copy.ts';

// 副本内要重建依赖、归档作用域内 Change、跑完整 check:fast 与场景门禁，预算高于 026 的 300s。
vi.setConfig({ testTimeout: 900_000 });

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const markerStem = 'template-example';
const integrationConfig = 'packages/e2e/vitest.config.integration.ts';
const specRelative = relative(repositoryRoot, fileURLToPath(import.meta.url));
const specFile = specRelative.split('/').pop()!;
const matrixSpecFile = 'packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts';

type Expect = TestContext['expect'];
type Removal = Readonly<{
  directories: ReadonlyArray<string>;
  files: ReadonlyArray<string>;
  globs: ReadonlyArray<Readonly<{ directory: string; prefixes: ReadonlyArray<string> }>>;
  matrixFixture: string;
  matrixOwner: string;
}>;
type RemovalFixture = Readonly<{ removal: Removal }>;
type InventoryCase = Readonly<{ key: string; requiredIn: ReadonlyArray<string> }>;
type InventoryScenario = Readonly<{
  id: string;
  verification: Readonly<{ cases: ReadonlyArray<InventoryCase> }>;
}>;
type InventoryItem = Readonly<{
  id: string;
  cases: ReadonlyArray<string>;
  requiredIn: ReadonlyArray<string>;
}>;
type InventoryOutput = Readonly<{
  mode: string;
  issues: ReadonlyArray<string>;
  contracts: ReadonlyArray<InventoryItem>;
  scenarios: ReadonlyArray<InventoryScenario>;
  flows: ReadonlyArray<InventoryItem>;
}>;
/** 反例探针：刻意破坏共享 Scenario 的非平台绑定后再跑一次清单模式门禁。 */
type Probe = Readonly<{
  status: number | null;
  issues: ReadonlyArray<string>;
  brokenIssue: string;
  log: string;
}>;
type Evidence = Readonly<{
  copy: RepositoryCopy;
  removed: ReadonlyArray<string>;
  markerFiles: ReadonlyArray<string>;
  declaredBefore: ReadonlyArray<string>;
  outsideMethodsBefore: ReadonlyArray<string>;
  matrixKeysBefore: ReadonlyArray<string>;
  matrixKeys: ReadonlyArray<string>;
  matrixKeysAfter: ReadonlyArray<string>;
  coverageExcluded: ReadonlyArray<string>;
  manifestBefore: unknown;
  changed: ReadonlyArray<string>;
  fastStatus: number | null;
  fastOutput: string;
  fastLog: string;
  inventoryStatus: number | null;
  inventory: InventoryOutput;
  inventoryLog: string;
  probe: Probe;
  declarationBody: string;
}>;

function writeLog(name: string, text: string): string {
  const path = join(tmpdir(), name);
  writeFileSync(path, text);
  return path;
}

function git(root: string, args: ReadonlyArray<string>): string {
  const result = spawnSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'template-fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'template-fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** 副本内运行命令：副本自带 node_modules 与固定版本工具链，不读调用方环境。 */
function run(copy: RepositoryCopy, command: string, args: ReadonlyArray<string>) {
  const result = spawnSync(command, [...args], {
    cwd: copy.root,
    env: copy.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** 注释行里的示例标记；判定与 scripts/lib/example-markers.ts 一致（代码 `//`、Markdown `<!--`）。 */
function markerAt(path: string, line: string): 'begin' | 'end' | undefined {
  const trimmed = line.trim();
  const comment = path.endsWith('.md') ? /^<!--/.test(trimmed) : /^\/\//.test(trimmed);
  if (!comment) return undefined;
  if (trimmed.includes(`${markerStem}:begin`)) return 'begin';
  if (trimmed.includes(`${markerStem}:end`)) return 'end';
  return undefined;
}

/** 删除文件里全部成对标记之间的内容（连同标记本身），返回删除后的文本与被删片段。 */
function stripMarkedFragments(path: string, content: string) {
  const kept: string[] = [];
  const removed: string[] = [];
  let depth = 0;
  for (const line of content.split('\n')) {
    const marker = markerAt(path, line);
    if (marker === 'begin') {
      depth += 1;
      removed.push(line);
      continue;
    }
    if (marker === 'end') {
      depth -= 1;
      removed.push(line);
      continue;
    }
    if (depth > 0) removed.push(line);
    else kept.push(line);
  }
  if (depth !== 0) throw new Error(`${path}: ${markerStem} 标记未成对`);
  return { text: kept.join('\n'), removed: removed.join('\n') };
}

/** 全仓库含标记的文件清单：删除片段前确定，作为「只删白名单」的允许改动面。 */
function markerFiles(root: string): string[] {
  const found: string[] = [];
  for (const path of git(root, ['ls-files', '--cached', '--others', '--exclude-standard']).split(
    '\n',
  )) {
    if (!path) continue;
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    if (
      readFileSync(absolute, 'utf8')
        .split('\n')
        .some((line) => markerAt(path, line) !== undefined)
    )
      found.push(path);
  }
  return found;
}

/** 按白名单删除整目录、整文件与按前缀取的文件；返回实际删除的相对路径。 */
function removeWhitelistedPaths(root: string, removal: Removal): string[] {
  const removed: string[] = [];
  const drop = (relativePath: string) => {
    rmSync(join(root, relativePath), { recursive: true, force: true });
    removed.push(relativePath);
  };
  for (const directory of removal.directories)
    if (existsSync(join(root, directory))) drop(directory);
  for (const file of removal.files) if (existsSync(join(root, file))) drop(file);
  for (const glob of removal.globs) {
    const directory = join(root, glob.directory);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory))
      if (glob.prefixes.some((prefix) => entry.startsWith(prefix)))
        drop(`${glob.directory}/${entry}`);
  }
  return removed;
}

/** 矩阵 Fixture 的接口键（对象键顺序即文件顺序）。 */
function fixtureKeys(root: string, removal: Removal): string[] {
  return Object.keys(JSON.parse(readFileSync(join(root, removal.matrixFixture), 'utf8')) as object);
}

/**
 * 只删示例删除后不再被标记外声明的矩阵键（A5/A6 口径），返回被删除的键。
 * 共用接口（示例与使用方都调用）由使用方在标记外保留同名条目，对应的 Fixture 键必须保留；
 * 模板仓库里标记外为空，所以移除全部示例键。
 */
function removeDeclaredMatrixKeys(
  root: string,
  removal: Removal,
  removable: ReadonlyArray<string>,
): string[] {
  const matrix = JSON.parse(readFileSync(join(root, removal.matrixFixture), 'utf8')) as Record<
    string,
    unknown
  >;
  const removed = Object.keys(matrix).filter((key) => removable.includes(key));
  if (removed.length === 0) return [];
  const kept = Object.fromEntries(
    Object.entries(matrix).filter(([key]) => !removable.includes(key)),
  );
  writeFileSync(join(root, removal.matrixFixture), `${JSON.stringify(kept, null, 2)}\n`);
  return removed;
}

/** 声明体里登记的方法名；删除后的声明体只由标记外的条目组成。 */
function methodsInBody(body: string): string[] {
  return [...body.matchAll(/method: (\w+)/g)].map((match) => match[1]!);
}

/** 同步清单中指向已删除文件的覆盖率排除项；返回被移除的路径。 */
function syncCoverageExclusions(root: string): string[] {
  const path = join(root, 'project.manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    quality?: { coverageExclusions?: ReadonlyArray<{ path: string; reason: string }> };
  };
  const exclusions = manifest.quality?.coverageExclusions ?? [];
  const kept = exclusions.filter((item) => existsSync(join(root, item.path)));
  const dropped = exclusions.filter((item) => !kept.includes(item)).map((item) => item.path);
  if (manifest.quality) manifest.quality.coverageExclusions = [...kept];
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return dropped;
}

/** 数组字面量里除声明元素外的内容；声明为空时应只剩空白。 */
function declarationBody(source: string): string {
  const start = source.indexOf('= [');
  const end = source.lastIndexOf('];');
  if (start < 0 || end < start) throw new Error('consumed operations declaration not found');
  return source.slice(start + 3, end).trim();
}

/** 解析 check:scenarios 的 stdout JSON（pnpm 会在正文前后追加自己的行）。 */
function parseInventory(output: string): InventoryOutput {
  const start = output.indexOf('\n{\n');
  const end = output.lastIndexOf('\n}');
  if (start < 0 || end < start) throw new Error('场景门禁没有输出 JSON 正文');
  return JSON.parse(output.slice(start + 1, end + 2)) as InventoryOutput;
}

/**
 * 副本中“不可能产生绑定”的用例所对应的缺失项（A2 用户裁决：多一条、少一条都算失败）：
 * 1. 被 `TEMPLATE_COPY` 排除的会创建副本的用例：绑定由排除列表里的 spec 文件提供，用例名从
 *    有效 Spec 清单取、环境取该文件里声明的环境，不另写名单；
 * 2. `requiredIn` 含清单 `class` 为 `platform` 的测试项目：副本不运行小程序（清单模式不要求
 *    平台报告），绑定同样来自运行报告，必然缺失。
 * 问题文本与 scripts/lib/scenario-coverage.ts 的 `check()` 同款。
 */
function expectedMissingBindings(copy: RepositoryCopy, inventory: InventoryOutput): string[] {
  const platformProjects = testProjectsByClass(loadProjectManifest(copy.root), ['platform']);
  const byId = new Map(inventory.scenarios.map((scenario) => [scenario.id, scenario]));
  const expected = new Set<string>();
  for (const scenario of inventory.scenarios) {
    for (const item of scenario.verification.cases) {
      for (const environment of item.requiredIn) {
        if (platformProjects.includes(environment))
          expected.add(`${scenario.id}/${item.key}: missing binding for ${environment}`);
      }
    }
  }
  // 协议义务与 FLOW 的 requiredIn 同样可能含平台项目：清单模式不要求平台报告，它们的缺失
  // 绑定同属"副本中不可能产生绑定"（全部取自门禁输出，不手写）。
  for (const [items, word] of [
    [inventory.contracts, ''],
    [inventory.flows, 'FLOW '],
  ] as const)
    for (const item of items)
      for (const caseKey of item.cases)
        for (const environment of item.requiredIn)
          if (platformProjects.includes(environment))
            expected.add(`${item.id}/${caseKey}: missing ${word}binding for ${environment}`);
  for (const spec of copyCreatingSpecs) {
    // 示例自身的 spec 随白名单删除、对应 Scenario 也已删除：没有可推导的缺失项。
    if (!existsSync(join(copy.root, spec))) continue;
    const source = readFileSync(join(copy.root, spec), 'utf8');
    const environments = [
      ...new Set([...source.matchAll(/environment: '([^']+)'/g)].map((match) => match[1]!)),
    ];
    const owners = [
      ...new Set([...source.matchAll(/ownerId: '([^']+)'/g)].map((match) => match[1]!)),
    ];
    for (const ownerId of owners) {
      const scenario = byId.get(ownerId);
      if (!scenario) continue;
      for (const item of scenario.verification.cases) {
        for (const environment of item.requiredIn) {
          if (environments.includes(environment))
            expected.add(`${ownerId}/${item.key}: missing binding for ${environment}`);
        }
      }
    }
  }
  return [...expected].sort();
}

/**
 * 反例：删掉共享 Scenario 的非平台绑定（集成报告里对应的一条执行记录）后，门禁必须判失败，
 * 且问题集合恰好多出该用例的缺失绑定——精确扣除的断言必须拦得住这类多余问题。
 */
function probeSharedBindingBreak(copy: RepositoryCopy): Probe {
  const reportPath = join(copy.root, 'artifacts/local/reports/integration.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    tests: Array<{
      binding?: {
        environment: string;
        flowId?: string;
        covers: ReadonlyArray<{ id: string; caseKey: string }>;
      };
    }>;
  };
  const index = report.tests.findIndex(
    (test) =>
      test.binding?.environment === 'integration' &&
      test.binding.flowId === undefined &&
      test.binding.covers.length === 1 &&
      !test.binding.covers[0]!.id.startsWith('SCN-TEMPLATE-EXAMPLE-'),
  );
  if (index < 0) throw new Error('integration 报告里没有可用于反例的共享 Scenario 绑定');
  const cover = report.tests[index]!.binding!.covers[0]!;
  report.tests.splice(index, 1);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const run2 = run(copy, 'pnpm', ['check:scenarios', '--inventory']);
  return {
    status: run2.status,
    issues: parseInventory(run2.output).issues,
    brokenIssue: `${cover.id}/${cover.caseKey}: missing binding for integration`,
    log: writeLog('t17-copy-inventory-probe.log', run2.output),
  };
}

async function runRemoval(fixture: RemovalFixture): Promise<Evidence> {
  const { removal } = fixture;
  const copy = createRepositoryCopy({ prefix: 'engineering-008-' });
  try {
    // 模拟交付状态并格式化，再提交基线：白名单删除的 diff 只反映删除本身。
    // 副本 helper 已按作用域归档，归档后的来源摘要与归档前一致（实测 19 个 owner 全无变化），
    // 这里不再重算全部 Fixture 摘要；只有被删除内容改动的 Fixture 才需要 refresh。
    const archivedFormat = run(copy, 'pnpm', ['format']);
    if (archivedFormat.status !== 0) throw new Error(`format failed: ${archivedFormat.output}`);
    git(copy.root, ['add', '-A']);
    // 作用域为空（主仓库已归档本 Change）时没有归档动作，可能没有可提交的内容：跳过提交即可，
    // 副本此时已经是交付状态。
    if (git(copy.root, ['status', '--porcelain']) !== '')
      git(copy.root, [
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-q',
        '-m',
        'copy: archive scoped change',
      ]);
    const declarationPath = packageByRole(loadProjectManifest(copy.root), 'product')
      .consumedOperations![0]!;
    const manifestPath = join(copy.root, 'project.manifest.json');
    const manifestBefore = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    const marked = markerFiles(copy.root);
    const fragments = new Map<string, string>();
    for (const path of marked) {
      const absolute = join(copy.root, path);
      const stripped = stripMarkedFragments(path, readFileSync(absolute, 'utf8'));
      writeFileSync(absolute, stripped.text);
      fragments.set(path, stripped.removed);
    }
    const declaredBefore = [
      ...(fragments.get(declarationPath) ?? '').matchAll(/method: (\w+)/g),
    ].map((match) => match[1]!);
    // 标记外登记的方法：使用方条目，以及被移到标记外的共用接口（模板仓库为空）。
    // 只读声明数组的正文，避免把类型定义里的 `method:` 成员当成条目。
    const outsideMethodsBefore = [
      ...new Set(
        methodsInBody(declarationBody(readFileSync(join(copy.root, declarationPath), 'utf8'))),
      ),
    ];
    const removed = removeWhitelistedPaths(copy.root, removal);
    const matrixKeysBefore = fixtureKeys(copy.root, removal);
    const removable = [...new Set(declaredBefore)].filter(
      (name) => !outsideMethodsBefore.includes(name),
    );
    const matrixKeys = removeDeclaredMatrixKeys(copy.root, removal, removable);
    const matrixKeysAfter = fixtureKeys(copy.root, removal);
    const coverageExcluded = syncCoverageExclusions(copy.root);
    const refresh = run(copy, 'pnpm', ['fixtures:refresh', removal.matrixOwner]);
    if (refresh.status !== 0) throw new Error(`fixtures:refresh failed: ${refresh.output}`);
    // 片段删除会留下空行与折行差异，按仓库脚本格式化后再核对改动面。
    const formatted = run(copy, 'pnpm', ['format']);
    if (formatted.status !== 0) throw new Error(`format failed: ${formatted.output}`);
    git(copy.root, ['add', '-A']);
    const changed = git(copy.root, ['diff', '--cached', '--name-only', 'HEAD'])
      .split('\n')
      .filter(Boolean);
    const fast = run(copy, 'pnpm', ['check:fast']);
    const fastLog = writeLog('t17-copy-check-fast.log', fast.output);
    // check:fast 失败时先落盘再抛错：否则后面的探针读不到报告，会以 ENOENT 盖掉真正的失败原因。
    if (fast.status !== 0)
      throw new Error(
        `副本内 check:fast 退出码 ${fast.status}（日志 ${fastLog}）：\n${fast.output.slice(-6000)}`,
      );
    const inventoryRun = run(copy, 'pnpm', ['check:scenarios', '--inventory']);
    const inventoryLog = writeLog('t17-copy-inventory.log', inventoryRun.output);
    let inventory: InventoryOutput;
    try {
      inventory = parseInventory(inventoryRun.output);
    } catch (error) {
      // `lib` 为 ES2020，`new Error(message, { cause })` 不可用；沿用仓库既有写法挂上 cause。
      const issue = new Error(
        `副本内场景门禁清单模式输出无法解析（日志 ${inventoryLog}）`,
      ) as Error & { cause: unknown };
      issue.cause = error;
      throw issue;
    }
    // 反例必须在正常清单结果取到之后再跑：它会改写副本里的集成报告。
    const probe = probeSharedBindingBreak(copy);
    return {
      copy,
      removed,
      markerFiles: marked,
      declaredBefore,
      outsideMethodsBefore,
      matrixKeysBefore,
      matrixKeys,
      matrixKeysAfter,
      coverageExcluded,
      manifestBefore,
      changed,
      fastStatus: fast.status,
      fastOutput: fast.output,
      fastLog,
      inventoryStatus: inventoryRun.status,
      inventory,
      inventoryLog,
      probe,
      declarationBody: declarationBody(readFileSync(join(copy.root, declarationPath), 'utf8')),
    };
  } catch (error) {
    copy.cleanup();
    throw error;
  }
}

let pending: Promise<Evidence> | undefined;
/** 两个 case 共用一次副本构建与门禁运行：同一份状态给出两组 checkpoint 证据。 */
function evidence(fixture: RemovalFixture): Promise<Evidence> {
  pending ??= runRemoval(fixture);
  return pending;
}

afterAll(async () => {
  const value = await pending;
  value?.copy.cleanup();
});

/** copy-construction：副本自建、归档作用域内 Change、workspace 链接落在副本内。 */
function assertCopyConstruction(value: Evidence, expect: Expect) {
  expect(value.copy.env.TEMPLATE_COPY).toBe('1');
  expect(value.copy.env.SCENARIO_GATE_CHANGES).toBeUndefined();
  expect(git(value.copy.root, ['rev-parse', '--is-inside-work-tree'])).toBe('true');
  const scope = scopedChangeNames();
  // 作用域为空（主仓库已归档本 Change）时没有归档动作：跳过归档断言，只要求副本处于交付态。
  if (scope.length > 0) {
    const archived = readdirSync(join(value.copy.root, 'openspec/changes/archive'));
    for (const name of scope)
      expect(archived.some((entry) => entry === name || entry.endsWith(`-${name}`))).toBe(true);
  }
  expect(
    readdirSync(join(value.copy.root, 'openspec/changes')).filter((entry) => entry !== 'archive'),
  ).toEqual([]);
  expect(workspaceRealpath(value.copy.root).startsWith(realpathSync(value.copy.root))).toBe(true);
  expect(existsSync(join(value.copy.root, 'packages/sdk/src/example'))).toBe(false);
}

/** whitelist-only-removal：改动面只落在白名单、标记片段、矩阵 Fixture 与清单排除项。 */
function assertWhitelistOnly(value: Evidence, removal: Removal, expect: Expect) {
  for (const directory of removal.directories) expect(value.removed).toContain(directory);
  for (const file of removal.files) expect(value.removed).toContain(file);
  expect(value.matrixKeys.length).toBeGreaterThan(0);
  // 只删"示例接口中不再被标记外声明"的键（A5/A6）：共用接口由使用方在标记外保留同名条目，
  // 对应的 Fixture 键必须保留；模板仓库里标记外为空，示例键因此全部删除。
  expect(
    [...value.matrixKeys].sort(),
    '示例删除应移除的矩阵键 = 示例接口中不再被标记外声明的那些',
  ).toEqual(
    [...new Set(value.declaredBefore)]
      .filter((name) => !value.outsideMethodsBefore.includes(name))
      .sort(),
  );
  expect(value.matrixKeysAfter).toEqual(
    value.matrixKeysBefore.filter((key) => !value.matrixKeys.includes(key)),
  );
  const covered = (path: string) =>
    value.removed.some((item) => path === item || path.startsWith(`${item}/`)) ||
    value.markerFiles.includes(path) ||
    path === removal.matrixFixture ||
    path === join(dirname(removal.matrixFixture), 'manifest.json') ||
    path === 'project.manifest.json';
  expect(value.changed.filter((path) => !covered(path))).toEqual([]);
  expect(value.changed.filter((path) => path.startsWith('scripts/'))).toEqual([]);
  expect(
    value.changed.filter(
      (path) =>
        path.startsWith('packages/e2e/tests/tooling/') &&
        !value.markerFiles.includes(path) &&
        !value.removed.includes(path),
    ),
  ).toEqual([]);
  expect(
    value.changed.filter(
      (path) =>
        path.startsWith('openspec/specs/') && !path.startsWith('openspec/specs/template-example/'),
    ),
  ).toEqual([]);
  if (value.matrixKeys.length > 0) expect(value.changed).toContain(removal.matrixFixture);
  expect(value.changed).toContain('project.manifest.json');
  // 覆盖率排除项只随指向的白名单对象一起消失：期望集合 = 清单原有排除项中位于删除面下者。
  // 白名单条目本身不要求都出现在排除项里——例如删除验收自身的用例与 Fixture 就没有覆盖项。
  const beforePaths = (
    value.manifestBefore as { quality: { coverageExclusions: ReadonlyArray<{ path: string }> } }
  ).quality.coverageExclusions.map((item) => item.path);
  const underRemoved = (path: string) =>
    value.removed.some((item) => path === item || path.startsWith(`${item}/`));
  expect([...value.coverageExcluded].sort()).toEqual(beforePaths.filter(underRemoved).sort());
  // 清单只动覆盖率排除项，其余字段逐项不变。
  const after = JSON.parse(
    readFileSync(join(value.copy.root, 'project.manifest.json'), 'utf8'),
  ) as { quality: { coverageExclusions: ReadonlyArray<{ path: string }> } };
  const before = value.manifestBefore as { quality: { coverageExclusions: unknown } };
  expect(after).toEqual({
    ...before,
    quality: {
      ...before.quality,
      coverageExclusions: after.quality.coverageExclusions,
    },
  });
  expect(after.quality.coverageExclusions.map((item) => item.path)).toEqual(
    beforePaths.filter((path) => !value.coverageExcluded.includes(path)),
  );
  expect(value.coverageExcluded.length).toBeGreaterThan(0);
  for (const item of after.quality.coverageExclusions)
    expect(existsSync(join(value.copy.root, item.path))).toBe(true);
  // 示例删除后白名单内的路径都不再存在：包含示例删除验收自身的用例与 Fixture（A3）。
  for (const directory of removal.directories)
    expect(existsSync(join(value.copy.root, directory))).toBe(false);
  for (const file of removal.files) expect(existsSync(join(value.copy.root, file))).toBe(false);
  // 集成测试配置里也不再留有指向已删除示例或示例删除验收的条目。
  const config = readFileSync(join(value.copy.root, integrationConfig), 'utf8');
  expect(config).not.toContain(specFile);
  expect(config).not.toContain('SCN-TEMPLATE-EXAMPLE-008.spec.ts');
  expect(config).not.toContain('tests/example/');
}

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-008',
    caseId: 'example-removal-fast',
    fixtureCase: 'example-removal-fast',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-008',
        caseKey: 'example-removal-fast',
        checks: [
          'copy-construction',
          'whitelist-only-removal',
          'fast-gates-green',
          'empty-declaration-matrix',
          'no-recursive-copy',
        ],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const value = await evidence(fixture as RemovalFixture);
    const { removal } = fixture as RemovalFixture;
    await checkpoint('copy-construction', () => assertCopyConstruction(value, expect));
    await checkpoint('whitelist-only-removal', () => assertWhitelistOnly(value, removal, expect));
    await checkpoint('fast-gates-green', () => {
      expect(value.fastStatus, `${value.fastLog}\n${value.fastOutput.slice(-6000)}`).toBe(0);
    });
    await checkpoint('empty-declaration-matrix', () => {
      // 删除后的声明体只由标记外的条目组成：模板仓库里标记外为空，此时才断言声明为空、
      // 按消费接口派生的义务为空并结束；使用方保留标记外条目时按这些条目继续取证。
      expect(methodsInBody(value.declarationBody)).toEqual(value.outsideMethodsBefore);
      expect(value.declarationBody.length === 0).toBe(value.outsideMethodsBefore.length === 0);
      // 矩阵键只减不增：删掉示例中不再被标记外声明的键，其余键（含共用接口）原样保留。
      expect(value.matrixKeysAfter).toEqual(
        value.matrixKeysBefore.filter((key) => !value.matrixKeys.includes(key)),
      );
      if (value.outsideMethodsBefore.length === 0) {
        expect(value.declarationBody).toBe('');
        expect(value.matrixKeysAfter).toEqual([]);
      }
      // 矩阵用例在两种状态下都执行完（声明为空时断言义务为空并结束，不因缺少示例路由失败）。
      expect(value.fastOutput).toContain(matrixSpecFile);
      const errors = value.inventory.contracts.filter((item) =>
        item.id.startsWith('idl.error-contract#business-error#'),
      );
      expect(errors.length).toBe(1);
      expect(errors[0]!.requiredIn).toEqual(['integration']);
    });
    await checkpoint('no-recursive-copy', () => {
      expect(value.copy.env.TEMPLATE_COPY).toBe('1');
      // 副本里会创建副本的用例仍被排除：排除列表里凡在副本中仍存在的 spec 都还在配置里；
      // 随示例删除的条目（示例用例与示例删除验收自身）不再出现（A3）。
      const config = readFileSync(join(value.copy.root, integrationConfig), 'utf8');
      const stillPresent = copyCreatingSpecs.filter((path) =>
        existsSync(join(value.copy.root, path)),
      );
      expect(stillPresent.length).toBeGreaterThan(0);
      for (const path of stillPresent) expect(config).toContain(path);
      expect(stillPresent).not.toContain(specRelative);
      expect(value.fastOutput).not.toContain(specFile);
      const previous = process.env.TEMPLATE_COPY;
      process.env.TEMPLATE_COPY = '1';
      try {
        expect(() => createRepositoryCopy()).toThrow(/must not be created inside a copy/);
      } finally {
        if (previous === undefined) delete process.env.TEMPLATE_COPY;
        else process.env.TEMPLATE_COPY = previous;
      }
    });
  },
  { fixtureRoot },
);

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-008',
    caseId: 'example-removal-scenarios',
    fixtureCase: 'example-removal-scenarios',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-008',
        caseKey: 'example-removal-scenarios',
        checks: ['copy-construction', 'whitelist-only-removal', 'scenario-gate-green'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const value = await evidence(fixture as RemovalFixture);
    const { removal } = fixture as RemovalFixture;
    await checkpoint('copy-construction', () => assertCopyConstruction(value, expect));
    await checkpoint('whitelist-only-removal', () => assertWhitelistOnly(value, removal, expect));
    await checkpoint('scenario-gate-green', () => {
      expect(value.inventory.mode).toBe('inventory');
      const expected = expectedMissingBindings(value.copy, value.inventory);
      expect(
        [...new Set(value.inventory.issues)].sort(),
        `${value.inventoryLog}\n${value.inventory.issues.join('\n')}`,
      ).toEqual(expected);
      // 反例：共享 Scenario 的非平台绑定被删掉后，问题集合多出恰好一条，门禁必须判失败。
      expect(expected).not.toContain(value.probe.brokenIssue);
      expect(value.probe.status, `${value.probe.log}\n${value.probe.issues.join('\n')}`).not.toBe(
        0,
      );
      expect(
        [...new Set(value.probe.issues)].sort(),
        `${value.probe.log}\n${value.probe.issues.join('\n')}`,
      ).toEqual([...new Set([...expected, value.probe.brokenIssue])].sort());
    });
  },
  { fixtureRoot },
);
