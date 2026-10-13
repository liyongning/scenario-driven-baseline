import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InventoryOutput } from './example-removal-expected.ts';
import type { RepositoryCopy } from './repository-copy.ts';

export const markerStems = ['template-example', 'web-example'] as const;

type MarkerStem = (typeof markerStems)[number];
export type MatrixRemoval = Readonly<{
  fixture: string;
  owner: string;
  kind: 'declaration-keys' | 'openapi-plans';
  declaration: string;
}>;
export type Removal = Readonly<{
  directories: ReadonlyArray<string>;
  files: ReadonlyArray<string>;
  globs: ReadonlyArray<Readonly<{ directory: string; prefixes: ReadonlyArray<string> }>>;
  matrices: ReadonlyArray<MatrixRemoval>;
}>;
export type RemovalFixture = Readonly<{ removal: Removal }>;
export type DeclarationEvidence = Readonly<{
  path: string;
  methodsBefore: ReadonlyArray<string>;
  outsideMethodsBefore: ReadonlyArray<string>;
  bodyAfter: string;
}>;
export type MatrixEvidence = Readonly<{
  fixture: string;
  owner: string;
  kind: MatrixRemoval['kind'];
  keysBefore: ReadonlyArray<string>;
  keysRemoved: ReadonlyArray<string>;
  keysAfter: ReadonlyArray<string>;
}>;
/** 反例探针：刻意破坏共享 Scenario 的非平台绑定后再跑一次清单模式门禁。 */
export type Probe = Readonly<{
  status: number | null;
  issues: ReadonlyArray<string>;
  brokenIssue: string;
  log: string;
}>;

export function writeLog(name: string, text: string): string {
  const path = join(tmpdir(), name);
  writeFileSync(path, text);
  return path;
}

export function git(root: string, args: ReadonlyArray<string>): string {
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
export function run(copy: RepositoryCopy, command: string, args: ReadonlyArray<string>) {
  const result = spawnSync(command, [...args], {
    cwd: copy.root,
    env: copy.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** 注释行里的示例标记；TS/JS 用 `//`，Markdown/Vue 用 `<!--`。 */
function markerAt(
  path: string,
  line: string,
): Readonly<{ kind: 'begin' | 'end'; stem: MarkerStem }> | undefined {
  const trimmed = line.trim();
  const comment = /^\/\//.test(trimmed) || /^<!--/.test(trimmed);
  if (!comment) return undefined;
  for (const stem of markerStems) {
    if (trimmed.includes(`${stem}:begin`)) return { kind: 'begin', stem };
    if (trimmed.includes(`${stem}:end`)) return { kind: 'end', stem };
  }
  return undefined;
}

/** 删除文件里全部成对标记之间的内容（连同标记本身），返回删除后的文本与被删片段。 */
export function stripMarkedFragments(path: string, content: string) {
  const kept: string[] = [];
  const removed: string[] = [];
  const open: MarkerStem[] = [];
  for (const line of content.split('\n')) {
    const marker = markerAt(path, line);
    if (marker?.kind === 'begin') {
      open.push(marker.stem);
      removed.push(line);
      continue;
    }
    if (marker?.kind === 'end') {
      const current = open.pop();
      if (current !== marker.stem) throw new Error(`${path}: ${marker.stem} 标记未成对`);
      removed.push(line);
      continue;
    }
    if (open.length > 0) removed.push(line);
    else kept.push(line);
  }
  if (open.length > 0) throw new Error(`${path}: ${open.at(-1)} 标记未成对`);
  return { text: kept.join('\n'), removed: removed.join('\n') };
}

/** 全仓库含标记的文件清单：删除片段前确定，作为「只删白名单」的允许改动面。 */
export function markerFiles(root: string): string[] {
  const found: string[] = [];
  for (const path of git(root, ['ls-files', '--cached', '--others', '--exclude-standard']).split(
    '\n',
  )) {
    if (!path) continue;
    if (!existsSync(join(root, path))) continue;
    if (
      readFileSync(join(root, path), 'utf8')
        .split('\n')
        .some((line) => markerAt(path, line) !== undefined)
    )
      found.push(path);
  }
  return found;
}

/** 按白名单删除整目录、整文件与按前缀取的文件；返回实际删除的相对路径。 */
export function removeWhitelistedPaths(root: string, removal: Removal): string[] {
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
export function fixtureKeys(root: string, matrix: MatrixRemoval): string[] {
  const document = JSON.parse(readFileSync(join(root, matrix.fixture), 'utf8')) as Record<
    string,
    unknown
  >;
  if (matrix.kind === 'openapi-plans') return Object.keys((document.plans ?? {}) as object);
  return Object.keys(document);
}

/**
 * 只删示例删除后不再被标记外声明的矩阵键（A5/A6 口径），返回被删除的键。
 * 共用接口（示例与使用方都调用）由使用方在标记外保留同名条目，对应的 Fixture 键必须保留；
 * 模板仓库里标记外为空，所以移除全部示例键。
 */
export function removeDeclaredMatrixKeys(
  root: string,
  matrix: MatrixRemoval,
  removable: ReadonlyArray<string>,
): string[] {
  const document = JSON.parse(readFileSync(join(root, matrix.fixture), 'utf8')) as Record<
    string,
    unknown
  >;
  let removed: string[];
  let kept: Record<string, unknown>;
  if (matrix.kind === 'openapi-plans') {
    const plans = (document.plans ?? {}) as Record<string, unknown>;
    const envelopes = (document.envelopes ?? {}) as Record<string, string>;
    removed = Object.keys(plans).filter((key) => removable.includes(key));
    kept = {
      ...document,
      envelopes: Object.fromEntries(
        Object.entries(envelopes).filter(([, operation]) => !removable.includes(operation)),
      ),
      plans: Object.fromEntries(Object.entries(plans).filter(([key]) => !removable.includes(key))),
    };
  } else {
    removed = Object.keys(document).filter((key) => removable.includes(key));
    kept = Object.fromEntries(Object.entries(document).filter(([key]) => !removable.includes(key)));
  }
  if (removed.length === 0) return [];
  writeFileSync(join(root, matrix.fixture), `${JSON.stringify(kept, null, 2)}\n`);
  return removed;
}

/** 声明体里登记的方法名；删除后的声明体只由标记外的条目组成。 */
export function methodsInBody(body: string): string[] {
  return [...body.matchAll(/method: (\w+)/g)].map((match) => match[1]!);
}

/** 同步清单中指向已删除文件的覆盖率排除项；返回被移除的路径。 */
export function syncCoverageExclusions(root: string): string[] {
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
export function declarationBody(source: string): string {
  const start = source.indexOf('= [');
  const end = source.lastIndexOf('];');
  if (start < 0 || end < start) throw new Error('consumed operations declaration not found');
  return source.slice(start + 3, end).trim();
}

/** 解析 check:scenarios 的 stdout JSON（pnpm 会在正文前后追加自己的行）。 */
export function parseInventory(output: string): InventoryOutput {
  const start = output.indexOf('\n{\n');
  const end = output.lastIndexOf('\n}');
  if (start < 0 || end < start) throw new Error('场景门禁没有输出 JSON 正文');
  return JSON.parse(output.slice(start + 1, end + 2)) as InventoryOutput;
}

/**
 * 反例：删掉共享 Scenario 的非平台绑定（集成报告里对应的一条执行记录）后，门禁必须判失败，
 * 且问题集合恰好多出该用例的缺失绑定——精确扣除的断言必须拦得住这类多余问题。
 */
export function probeSharedBindingBreak(copy: RepositoryCopy): Probe {
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
