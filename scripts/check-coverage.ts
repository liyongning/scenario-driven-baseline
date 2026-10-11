import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  coverageExclusions,
  errorMessage,
  loadProjectManifest,
  type ProjectManifest,
} from './lib/project-manifest.ts';
import { codeFiles, readSourceInventory } from './lib/source-inventory.ts';

/** check:coverage 的比对结果：期望文件、登记排除与缺席文件。 */
export type CoverageCheckResult = Readonly<{
  expected: ReadonlyArray<string>;
  excluded: ReadonlyArray<string>;
  missing: ReadonlyArray<string>;
  issues: ReadonlyArray<string>;
}>;

/** 覆盖率报告（istanbul json，键为绝对路径）中出现的文件，归一化为仓库相对路径。 */
function reportedFiles(root: string, coveragePath: string): Set<string> {
  const report = JSON.parse(readFileSync(coveragePath, 'utf8')) as Record<string, unknown>;
  const files = new Set<string>();
  for (const key of Object.keys(report)) {
    files.add(isAbsolute(key) ? relative(root, key) : key);
  }
  return files;
}

/**
 * 比对"清单 code 类文件减去登记排除"与覆盖率报告中的文件：
 * 缺席文件逐个报出，指向不存在文件的排除项被指出。
 */
export function checkCoverage(
  root: string,
  coveragePath: string,
  manifest: ProjectManifest = loadProjectManifest(root),
): CoverageCheckResult {
  const inventory = codeFiles(readSourceInventory(root, manifest));
  const codeSet = new Set(inventory);
  const issues: string[] = [];
  const excluded: string[] = [];
  for (const item of coverageExclusions(manifest)) {
    excluded.push(item.path);
    if (!codeSet.has(item.path))
      issues.push(`coverage exclusion ${item.path} does not match any hand-written code file`);
  }
  const expected = inventory.filter((path) => !excluded.includes(path));
  if (!existsSync(coveragePath)) {
    return {
      expected,
      excluded,
      missing: expected,
      issues: [...issues, `coverage report ${coveragePath} is missing`],
    };
  }
  const reported = reportedFiles(root, coveragePath);
  const missing = expected.filter((path) => !reported.has(path));
  for (const path of missing) issues.push(`missing from coverage report: ${path}`);
  return { expected, excluded, missing, issues };
}

export function runCoverageCli(argv: ReadonlyArray<string>, cwd = process.cwd()) {
  const rootIndex = argv.indexOf('--root');
  const coverageIndex = argv.indexOf('--coverage');
  const root = rootIndex >= 0 && argv[rootIndex + 1] ? resolve(argv[rootIndex + 1]!) : cwd;
  const coveragePath =
    coverageIndex >= 0 && argv[coverageIndex + 1]
      ? resolve(argv[coverageIndex + 1]!)
      : join(
          root,
          `artifacts/${process.env.VERIFY_RUN_ID ?? 'local'}/coverage/coverage-final.json`,
        );
  const issues: string[] = [];
  let result: CoverageCheckResult = { expected: [], excluded: [], missing: [], issues };
  try {
    result = checkCoverage(root, coveragePath);
  } catch (error) {
    issues.push(errorMessage(error));
    result = { ...result, issues };
  }
  return { ...result, exitCode: Math.min(1, result.issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by SCN-TEMPLATE-ENGINEERING-009. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = runCoverageCli(process.argv);
  console.log(JSON.stringify({ issues: result.issues }, null, 2));
  process.exitCode = result.exitCode;
}
/* v8 ignore stop */
