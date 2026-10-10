import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { deltaSection, filesUnder, outsideFlowTable, requirements } from './spec-parse.ts';

export type SpecSource = Readonly<{
  path: string;
  content: string;
  kind: 'main' | 'change';
  change?: string;
}>;
export type EffectiveSpecs = Readonly<{
  documents: ReadonlyArray<SpecSource>;
  issues: ReadonlyArray<string>;
}>;

/** 有效 Requirement 块：`changes` 为 delta 中触碰该 Requirement 的 active Change（受作用域限制）。 */
export type EffectiveRequirement = Readonly<{
  id: string;
  title: string;
  block: string;
  changes: ReadonlyArray<string>;
  source: SpecSource;
}>;

export type EffectiveProjection = Readonly<{
  requirements: ReadonlyArray<EffectiveRequirement>;
  issues: ReadonlyArray<string>;
}>;

/** Change 作用域：`changes` 未定义表示"主 Spec + 全部 active Change"。 */
export type ChangeScope = Readonly<{ changes?: ReadonlyArray<string> }>;

/** 规范化 Requirement 块文本：换行统一为 LF、去掉行尾空白、去掉空行。 */
export function normalizeRequirementBlock(block: string): string {
  return block
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Requirement 块规范化文本的 sha256：只改换行、行尾空白或空行时摘要不变。 */
export function requirementDigest(block: string): string {
  return createHash('sha256').update(normalizeRequirementBlock(block)).digest('hex');
}

export async function activeChangeNames(repositoryRoot: string): Promise<string[]> {
  const entries = await readdir(resolve(repositoryRoot, 'openspec/changes'), {
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
    .sort();
}

/** 从命令行参数解析 `--change`（可重复出现，也可在一个值中逗号分隔）。 */
export function parseChangeArguments(argv: ReadonlyArray<string>): Readonly<{
  specified: boolean;
  names: ReadonlyArray<string>;
  issues: ReadonlyArray<string>;
}> {
  const issues: string[] = [];
  const names: string[] = [];
  let specified = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--change') continue;
    specified = true;
    const raw = argv[index + 1];
    if (raw === undefined || raw.trim() === '' || raw.startsWith('-')) {
      issues.push('--change 需要 Change 名，不能没有值或为空');
      continue;
    }
    index += 1;
    for (const part of raw.split(',')) {
      const name = part.trim();
      if (name === '') issues.push(`--change ${raw}: 存在空的 Change 名`);
      else names.push(name);
    }
  }
  return { specified, names, issues };
}

/** `--change` / `SCENARIO_GATE_CHANGES` 的作用域帮助文本，两条门禁命令共用。 */
export const changeScopeHelp =
  '  --change <name>[,<name>]  只合并主 Spec 与所列 active Change 的 delta；可重复或逗号分隔。\n' +
  '                           不带 --change 时合并主 Spec 与全部 active Change；\n' +
  '                           命令行没有 --change 时读取环境变量 SCENARIO_GATE_CHANGES（同一格式）。';

export function resolveChangeScope(
  options: Readonly<{
    argv: ReadonlyArray<string>;
    environment: Readonly<Record<string, string | undefined>>;
    activeChanges: ReadonlyArray<string>;
  }>,
): Readonly<{ scope: ChangeScope; issues: ReadonlyArray<string> }> {
  const parsed = parseChangeArguments(options.argv);
  const issues = [...parsed.issues];
  let source = '--change';
  let names: string[] | undefined;
  if (parsed.specified) names = [...parsed.names];
  else if (options.environment.SCENARIO_GATE_CHANGES !== undefined) {
    source = 'SCENARIO_GATE_CHANGES';
    const raw = options.environment.SCENARIO_GATE_CHANGES;
    if (raw.trim() === '') issues.push('SCENARIO_GATE_CHANGES 已设置但为空值');
    else
      names = raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
  }
  if (names !== undefined) {
    for (const name of names)
      if (!options.activeChanges.includes(name))
        issues.push(
          `${source} ${name}: 不存在于 active 目录的 Change（只存在于 archive 的同样不算）`,
        );
    names = [...new Set(names)];
  }
  return { scope: names === undefined ? {} : { changes: names }, issues };
}

/** 按作用域合并主 Spec 与 active Change 的 delta，保留来源与触碰的 Change。 */
export async function projectEffectiveSpecs(
  repositoryRoot: string,
  options: Readonly<{ changes?: ReadonlyArray<string> }> = {},
): Promise<EffectiveProjection> {
  const mainPaths = await filesUnder(resolve(repositoryRoot, 'openspec/specs'));
  const allChanges = await activeChangeNames(repositoryRoot);
  const changeNames =
    options.changes === undefined
      ? allChanges
      : allChanges.filter((name) => options.changes!.includes(name));
  const issues: string[] = [];
  const main = await Promise.all(
    mainPaths.map(async (path) => ({
      path,
      content: await readFile(path, 'utf8'),
      kind: 'main' as const,
    })),
  );
  for (const source of main)
    if (outsideFlowTable(source.content))
      issues.push(
        `${source.path}: FLOW table is outside a Requirement and would be lost during archive`,
      );
  const byId = new Map<string, EffectiveRequirement>();
  for (const source of main)
    for (const requirement of requirements(source.content, source)) {
      if (byId.has(requirement.id))
        issues.push(`${source.path}: duplicate main Requirement ${requirement.id}`);
      else byId.set(requirement.id, requirement);
    }
  const activeTouches = new Map<string, string>();
  const touch = (id: string, change: string) => {
    const previous = activeTouches.get(id);
    if (previous && previous !== change)
      issues.push(`active changes ${previous} and ${change} both touch Requirement ${id}`);
    else activeTouches.set(id, change);
  };
  const replace = (id: string, requirement: EffectiveRequirement, change: string) => {
    const previous = byId.get(id);
    byId.set(id, {
      ...requirement,
      changes: [...new Set([...(previous?.changes ?? []), change])],
    });
  };
  for (const change of changeNames) {
    const specPaths = await filesUnder(
      resolve(repositoryRoot, 'openspec/changes', change, 'specs'),
    );
    for (const path of specPaths) {
      const source: SpecSource = {
        path,
        content: await readFile(path, 'utf8'),
        kind: 'change',
        change,
      };
      if (outsideFlowTable(source.content))
        issues.push(
          `${source.path}: FLOW table is outside a Requirement and would be lost during archive`,
        );
      for (const requirement of requirements(deltaSection(source.content, 'ADDED'), source)) {
        touch(requirement.id, change);
        if (byId.has(requirement.id))
          issues.push(`${source.path}: ADDED Requirement ${requirement.id} already exists`);
        else replace(requirement.id, requirement, change);
      }
      for (const requirement of requirements(deltaSection(source.content, 'MODIFIED'), source)) {
        touch(requirement.id, change);
        if (!byId.has(requirement.id))
          issues.push(`${source.path}: MODIFIED Requirement ${requirement.id} does not exist`);
        else replace(requirement.id, requirement, change);
      }
      for (const requirement of requirements(deltaSection(source.content, 'REMOVED'), source)) {
        touch(requirement.id, change);
        if (!byId.has(requirement.id))
          issues.push(`${source.path}: REMOVED Requirement ${requirement.id} does not exist`);
        else byId.delete(requirement.id);
      }
      const renamed = deltaSection(source.content, 'RENAMED');
      for (const line of renamed.split(/\r?\n/)) {
        const match = /(?:FROM|from)\s*[:：]\s*([^\s]+).*?(?:TO|to)\s*[:：]\s*([^\s]+)/.exec(line);
        if (!match) continue;
        touch(match[1]!, change);
        touch(match[2]!, change);
        const previous = byId.get(match[1]!);
        if (!previous)
          issues.push(`${source.path}: RENAMED Requirement ${match[1]} does not exist`);
        else if (byId.has(match[2]!))
          issues.push(`${source.path}: RENAMED target Requirement ${match[2]} already exists`);
        else {
          byId.delete(match[1]!);
          replace(
            match[2]!,
            { ...previous, id: match[2]!, title: previous.title.replace(match[1]!, match[2]!) },
            change,
          );
        }
      }
    }
  }
  return {
    requirements: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    issues,
  };
}

export async function readEffectiveSpecs(
  repositoryRoot: string,
  options: Readonly<{ changes?: ReadonlyArray<string> }> = {},
): Promise<EffectiveSpecs> {
  const projection = await projectEffectiveSpecs(repositoryRoot, options);
  return {
    documents: projection.requirements.map((item) => ({
      ...item.source,
      path: `${item.source.path}#${item.id}`,
      content: item.block,
    })),
    issues: projection.issues,
  };
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 按 owner ID（Scenario 标题或 FLOW 登记行）定位所属有效 Requirement 块。 */
export function findOwnerRequirement(
  requirements: ReadonlyArray<EffectiveRequirement>,
  ownerId: string,
): EffectiveRequirement | undefined {
  const scenario = new RegExp(`^####\\s+Scenario:\\s+${escapeRegExp(ownerId)}(?:\\s|$)`, 'm');
  const flowRow = new RegExp(`^\\|\\s*${escapeRegExp(ownerId)}\\s*\\|`, 'm');
  return requirements.find((item) => scenario.test(item.block) || flowRow.test(item.block));
}

export async function discoverSpecSources(repositoryRoot: string): Promise<SpecSource[]> {
  return (await readEffectiveSpecs(repositoryRoot)).documents.slice();
}
