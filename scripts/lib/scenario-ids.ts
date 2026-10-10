import { matchesAny } from './scenario-config.ts';

/**
 * 按项目配置的格式从全文中提取 Scenario ID 词元。
 * 只有当词元本身就是 Scenario ID 时才算引用：ID 后面紧跟 `.` 或 `/` 时它是文件名或目录名的一部分
 * （例如 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`、
 * `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`），不算 Scenario 引用；
 * ID 位于路径末尾（后面是反引号、空格或行尾）时仍按引用检查。
 */
export function extractScenarioIds(text: string, patterns: ReadonlyArray<string>): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/[A-Za-z0-9_-]+/g)) {
    const token = match[0];
    const after = text[match.index + token.length] ?? '';
    if (after === '.' || after === '/') continue;
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
