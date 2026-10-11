import { matchesAny } from './scenario-config.ts';

/** 路径里的文件名常见扩展名；`SCN-X-001.spec.ts` 这类词元不算 Scenario 引用。 */
const pathExtensions = /^\.(?:spec|test|ts|tsx|json|md|mjs|cjs|yml|yaml)(?![A-Za-z0-9_-])/;
/** 路径里的目录片段：`SCN-X-001/`、`fixtures/SCN-X-001/evidence.json`；`/002` 这类编号不算。 */
const directorySegment = /^\/(?![0-9])/;

/**
 * 按项目配置的格式从全文中提取 Scenario ID 词元。
 * 只有路径里的 ID 不算引用：ID 前面紧挨 `/`，且后面紧跟已知扩展名（例如
 * `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`）或 `/` 再接非数字
 * （目录名，例如 `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`）。
 * 其余情况仍按引用检查：句末英文句号（`参见 SCN-X-001.`）、`SCN-X-001/002` 这类简写，
 * 以及路径末尾（`fixtures/SCN-X-001` 后面没有分隔符）都算引用。
 */
export function extractScenarioIds(text: string, patterns: ReadonlyArray<string>): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/[A-Za-z0-9_-]+/g)) {
    const token = match[0];
    const index = match.index ?? 0;
    const before = text[index - 1] ?? '';
    const after = text.slice(index + token.length);
    if (before === '/' && (pathExtensions.test(after) || directorySegment.test(after))) continue;
    if (matchesAny(token, patterns)) ids.push(token);
  }
  return ids;
}

/**
 * 文档里出现、但未在有效 Spec 中登记的 Scenario ID。
 * 只有架构文档的错误带文档名：指南沿用不带后缀的既有文案，既有用例与 checkpoint 依赖它。
 */
export function unregisteredScenarioIds(
  content: string,
  document: string,
  patterns: ReadonlyArray<string>,
  registered: ReadonlySet<string>,
): string[] {
  const suffix = document === 'docs/template-guide.md' ? '' : ` (${document})`;
  return [...new Set(extractScenarioIds(content, patterns))]
    .filter((id) => !registered.has(id))
    .map((id) => `unregistered Scenario ID ${id}${suffix}`);
}
