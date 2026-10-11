import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadScenarioConfig } from './scenario-config.ts';
import { readSpecInventory } from './spec-inventory.ts';
import { findOwnerRequirement, projectEffectiveSpecs, requirementDigest } from './spec-sources.ts';
import type { ProjectManifest } from './project-manifest.ts';
import type { AffectedSelection } from './affected-types.ts';

/** 按 `spec-sources` 的同一分块规则切出 Requirement 块（用于比较 base 与工作区）。 */
export function requirementBlocks(content: string): ReadonlyArray<{ id: string; block: string }> {
  const lines = content.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^### Requirement:\s+/.test(line)) starts.push(index);
  });
  return starts.map((start, index) => {
    let end = starts[index + 1] ?? lines.length;
    for (let cursor = start + 1; cursor < end; cursor += 1)
      if (/^#{1,2}\s/.test(lines[cursor]!)) {
        end = cursor;
        break;
      }
    return {
      id: lines[start]!.replace(/^### Requirement:\s+/, '')
        .trim()
        .split(/\s+/, 1)[0]!,
      block: lines.slice(start, end).join('\n').trimEnd(),
    };
  });
}

const specPathPattern = /^openspec\/(?:specs\/.*\/spec\.md|changes\/[^/]+\/specs\/.*\/spec\.md)$/;

function fileAtBase(root: string, base: string, path: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${base}:${path}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

/** Requirement 块摘要（与 GATE-10 相同的规范化算法）变化的 Requirement ID。 */
export function changedRequirements(
  root: string,
  base: string,
  changed: ReadonlyArray<string>,
): string[] {
  const ids = new Set<string>();
  for (const path of changed.filter((item) => specPathPattern.test(item))) {
    const atBase = fileAtBase(root, base, path);
    const inWorktree = existsSync(join(root, path))
      ? readFileSync(join(root, path), 'utf8')
      : undefined;
    const digests = (content: string | undefined) =>
      new Map(
        requirementBlocks(content ?? '').map(
          (item) => [item.id, requirementDigest(item.block)] as const,
        ),
      );
    const before = digests(atBase);
    const after = digests(inWorktree);
    for (const [id, digest] of after) if (before.get(id) !== digest) ids.add(id);
    for (const id of before.keys()) if (!after.has(id)) ids.add(id);
  }
  return [...ids].sort();
}

/** 由变化的 Requirement 选出其下全部 Scenario 与 FLOW。 */
export async function specSelections(
  root: string,
  manifest: ProjectManifest,
  base: string,
  changed: ReadonlyArray<string>,
): Promise<AffectedSelection[]> {
  const requirements = changedRequirements(root, base, changed);
  if (requirements.length === 0) return [];
  const projection = await projectEffectiveSpecs(root);
  const config = await loadScenarioConfig(root);
  const inventory = await readSpecInventory(
    projection.requirements.map((item) => ({
      ...item.source,
      path: `${item.source.path}#${item.id}`,
      content: item.block,
    })),
    config,
    manifest.testProjects,
  );
  const selections: AffectedSelection[] = [];
  for (const scenario of inventory.scenarios) {
    const requirement = scenario.source.slice(scenario.source.lastIndexOf('#') + 1);
    if (requirements.includes(requirement))
      selections.push({ id: scenario.id, reason: `Requirement ${requirement} 摘要变化` });
  }
  for (const flow of inventory.flows) {
    // readSpecInventory 只从 Requirement 正文的 FLOW 行产出 flow，owner 必然存在。
    const owner = findOwnerRequirement(projection.requirements, flow.id)!;
    if (requirements.includes(owner.id))
      selections.push({ id: flow.id, reason: `Requirement ${owner.id} 摘要变化` });
  }
  return selections;
}
