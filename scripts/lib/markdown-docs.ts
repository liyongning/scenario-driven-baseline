import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { nodeText } from './spec-inventory.ts';

/** 文档检查共用的 Markdown 解析链，与既有门禁同源（unified + remark-parse）。 */
export function markdown(content: string) {
  return unified().use(remarkParse).parse(content);
}

/** 需要表格解析（GFM）的文档事实，例如指南的能力地图；与 [markdown] 分开，避免自动链接改变既有断链判定。 */
export function markdownTables(content: string) {
  return unified().use(remarkParse).use(remarkGfm).parse(content);
}

/** 文档中出现的全部链接地址。 */
export function linksIn(content: string): string[] {
  const urls: string[] = [];
  visit(markdown(content), 'link', (node) => {
    urls.push(node.url);
  });
  return urls;
}

/** 相对链接解析为文件系统路径；锚点只保留文件部分。 */
export function linkTarget(baseFile: string, url: string): string {
  return resolve(dirname(baseFile), decodeURIComponent(url.split('#')[0]!));
}

/** 文件存在且其中任一链接解析到目标文件。 */
export function linksTo(filePath: string, target: string): boolean {
  if (!existsSync(filePath)) return false;
  return linksIn(readFileSync(filePath, 'utf8')).some(
    (url) => linkTarget(filePath, url) === target,
  );
}

/** 文档中全部仓库内相对链接（排除 http(s)、mailto 与纯锚点），供断链检查共用。 */
export function relativeLinks(content: string): string[] {
  return linksIn(content).filter((url) => !/^(https?:|#|mailto:)/.test(url));
}

/** 一级标题的层级与文字；标题文字按渲染文本（行内代码去掉反引号）比较。 */
export type DocHeading = Readonly<{ depth: number; text: string }>;

export function headingsOf(content: string): DocHeading[] {
  const headings: DocHeading[] = [];
  visit(markdown(content), 'heading', (node) => {
    headings.push({ depth: node.depth, text: nodeText(node) });
  });
  return headings;
}
