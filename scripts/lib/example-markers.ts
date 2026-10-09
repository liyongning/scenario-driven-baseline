import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { collectFiles } from './fingerprints.ts';
import type { ProjectManifest } from './project-manifest.ts';

/** 包内模块根目录的默认值与判定；与依赖规则共用同一份 CJS 模块。 */
const dependencyRules = createRequire(import.meta.url)('./dependency-rules.cjs') as {
  moduleRoots(pkg: Readonly<{ moduleRoots?: ReadonlyArray<string> }>): string[];
};

/** 示例片段标记的词干：代码写 `// <stem>:begin`，Markdown 写 `<!-- <stem>:begin -->`。 */
const markerStem = 'template-example';

/** 参与标记校验的手写代码扩展名；生成物、构建产物与依赖目录不在范围内。 */
function isCodeFile(path: string): boolean {
  return /\.(?:ts|js|mjs|cjs)$/.test(path);
}

/**
 * 需要校验示例标记的文件：各包模块根下的手写代码文件，以及 Markdown 事实文件。
 * 只有这些文件会被"移除模板示例"按标记裁剪，因此只校验它们。
 */
function markerFiles(root: string, manifest: ProjectManifest): string[] {
  const code = manifest.packages.flatMap((item) =>
    dependencyRules
      .moduleRoots(item)
      .flatMap((moduleRoot) =>
        collectFiles(join(root, 'packages', item.directory, moduleRoot), isCodeFile).map((path) =>
          relative(root, path),
        ),
      ),
  );
  const markdown = [
    'README.md',
    'docs/template-guide.md',
    ...manifest.packages.map((item) => `packages/${item.directory}/AGENTS.md`),
  ].filter((path) => existsSync(join(root, path)));
  return [...code, ...markdown].sort();
}

/**
 * 读取一行里的示例标记；只有注释行才算标记，
 * 避免字符串字面量与文档正文中的同名文字被误判。
 */
function markerAt(path: string, line: string): 'begin' | 'end' | undefined {
  const trimmed = line.trim();
  const comment = path.endsWith('.md') ? /^<!--/.test(trimmed) : /^\/\//.test(trimmed);
  if (!comment) return undefined;
  if (trimmed.includes(`${markerStem}:begin`)) return 'begin';
  if (trimmed.includes(`${markerStem}:end`)) return 'end';
  return undefined;
}

/** 校验一个文件里的示例标记成对出现、不嵌套；违规时指出文件与行号（ENG-06）。 */
export function scanExampleMarkers(path: string, content: string): string[] {
  const issues: string[] = [];
  const open: number[] = [];
  for (const [index, line] of content.split('\n').entries()) {
    const marker = markerAt(path, line);
    if (marker === 'begin') {
      if (open.length > 0) issues.push(`${path}:${index + 1}: ${markerStem} 标记不允许嵌套`);
      open.push(index + 1);
    } else if (marker === 'end') {
      if (open.length === 0)
        issues.push(`${path}:${index + 1}: ${markerStem}:end 没有对应的 begin`);
      else open.pop();
    }
  }
  for (const line of open) issues.push(`${path}:${line}: ${markerStem}:begin 没有对应的 end`);
  return issues;
}

/** 扫描受管文件里的示例标记：未闭合、多余或嵌套时给出文件与行号。 */
export function checkExampleMarkers(root: string, manifest: ProjectManifest): string[] {
  return markerFiles(root, manifest).flatMap((path) =>
    scanExampleMarkers(path, readFileSync(join(root, path), 'utf8')),
  );
}
