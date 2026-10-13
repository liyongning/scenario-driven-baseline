import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { headingsOf, linkTarget, linksTo, markdownTables, relativeLinks } from './markdown-docs.ts';
import { nodeText } from './spec-inventory.ts';

/** 指南与技术架构文档的仓库相对路径；门禁与用例共用这一份。 */
export const guideRelativePath = 'docs/template-guide.md';
export const architectureRelativePath = 'docs/architecture.md';
/** 指南中登记能力清单的章节标题；技术架构文档按该表格第一列逐项建节。 */
const capabilitySection = '能力地图';

type MarkdownNode = Readonly<{
  type: string;
  depth?: number;
  children?: ReadonlyArray<MarkdownNode>;
}>;

/** 指南「能力地图」章节内全部表格第一列的每一项；找不到表格时返回 undefined。 */
export function capabilityMapNames(guideContent: string): string[] | undefined {
  const tree = markdownTables(guideContent) as unknown as {
    children: ReadonlyArray<MarkdownNode>;
  };
  let insideSection = false;
  const names: string[] = [];
  for (const node of tree.children) {
    if (node.type === 'heading') {
      if (node.depth === 2) insideSection = nodeText(node) === capabilitySection;
      continue;
    }
    if (insideSection && node.type === 'table') {
      const rows = node.children as ReadonlyArray<MarkdownNode>;
      names.push(
        ...rows
          .slice(1)
          .map((row) => nodeText((row.children as ReadonlyArray<MarkdownNode>)[0]))
          .filter((name) => name.length > 0),
      );
    }
  }
  return names.length > 0 ? names : undefined;
}

/**
 * 技术架构文档检查（ENG-10）：文档存在、根 AGENTS.md 与 README.md 都链接它、
 * 指南能力地图的每一项都有同名二级或三级标题、文档中的相对链接都能解析。
 */
export function checkArchitectureDoc(root: string): string[] {
  const errors: string[] = [];
  const docFile = join(root, architectureRelativePath);
  if (!existsSync(docFile)) return [`missing ${architectureRelativePath}`];
  const target = resolve(docFile);
  if (!linksTo(join(root, 'AGENTS.md'), target))
    errors.push(`AGENTS.md does not link ${architectureRelativePath}`);
  if (!linksTo(join(root, 'README.md'), target))
    errors.push(`README.md does not link ${architectureRelativePath}`);
  const content = readFileSync(docFile, 'utf8');
  const headings = new Set(
    headingsOf(content)
      .filter((heading) => heading.depth === 2 || heading.depth === 3)
      .map((heading) => heading.text),
  );
  const guideFile = join(root, guideRelativePath);
  // 指南缺失由指南检查报告，这里不再重复；只比对能力地图。
  if (existsSync(guideFile)) {
    const names = capabilityMapNames(readFileSync(guideFile, 'utf8'));
    if (!names) errors.push(`${guideRelativePath}: capability map table not found`);
    else
      for (const name of names)
        if (!headings.has(name))
          errors.push(`${architectureRelativePath}: missing capability section ${name}`);
  }
  for (const url of relativeLinks(content))
    if (!existsSync(linkTarget(docFile, url)))
      errors.push(`broken link ${architectureRelativePath} -> ${url}`);
  return errors;
}
