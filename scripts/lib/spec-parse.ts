import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { unified } from 'unified';
import { nodeText } from './spec-inventory.ts';
import type { EffectiveRequirement, SpecSource } from './spec-sources.ts';

/** 收集 `openspec/` 下每个 `spec.md`；`archive/` 只保存历史，不参与有效 Spec。 */
export async function filesUnder(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.flatMap((entry) => {
        if (entry.name === 'archive') return [];
        const path = join(root, entry.name);
        return entry.isDirectory()
          ? [filesUnder(path)]
          : entry.name === 'spec.md'
            ? [Promise.resolve([path])]
            : [];
      }),
    );
    return nested.flat().sort();
  } catch {
    return [];
  }
}

/** 按 `### Requirement:` 标题切分 Requirement 块；块到更高级标题或文件结束为止。 */
export function requirements(content: string, source: SpecSource): EffectiveRequirement[] {
  const lines = content.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^### Requirement:\s+/.test(line)) starts.push(index);
  });
  return starts.map((start, index) => {
    // 块到下一个 Requirement 标题、任一更高级标题（# / ##）或文件结束为止。
    let end = starts[index + 1] ?? lines.length;
    for (let cursor = start + 1; cursor < end; cursor += 1)
      if (/^#{1,2}\s/.test(lines[cursor]!)) {
        end = cursor;
        break;
      }
    const heading = lines[start]!.replace(/^### Requirement:\s+/, '').trim();
    const id = heading.split(/\s+/, 1)[0]!;
    return {
      id,
      title: heading,
      block: lines.slice(start, end).join('\n').trimEnd(),
      changes: [],
      source,
    };
  });
}

/** 判断是否存在落在 Requirement 之外的 FLOW 表；归档时这类表会丢失，属于非法输入。 */
export function outsideFlowTable(content: string): boolean {
  let inRequirement = false;
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content);
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth <= 3) {
      inRequirement = node.depth === 3 && /^Requirement:\s+/.test(nodeText(node));
    }
    if (
      node.type === 'table' &&
      !inRequirement &&
      nodeText(node.children[0]?.children[0]) === 'FLOW ID'
    )
      return true;
  }
  return false;
}

/** 取 delta 中某个小节（ADDED / MODIFIED / REMOVED / RENAMED）的正文。 */
export function deltaSection(content: string, name: string): string {
  const start = content.indexOf(`## ${name} Requirements`);
  if (start < 0) return '';
  const rest = content.slice(start + `## ${name} Requirements`.length);
  const next = rest.search(/^##\s+/m);
  return next < 0 ? rest : rest.slice(0, next);
}
