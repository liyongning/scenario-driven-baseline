import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ProjectManifest } from './project-manifest.ts';

/** 仓库根由脚本位置推导：受控根中的副本仍使用仓库自己的分析工具。 */
const toolRoot = resolve(import.meta.dirname, '../..');
const depcruiseBin = resolve(toolRoot, 'node_modules/.bin/depcruise');

/** 一条可执行的分析命令：命令、参数与工作目录。 */
export type AnalysisRunner = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
) => Readonly<{ status: number | null; stdout?: string | null; stderr?: string | null }>;

const defaultAnalysisRunner: AnalysisRunner = (command, args, cwd) => {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** 只供分析的 tsconfig：把清单里的包名映射到各自的 `src` 入口（不参与构建与测试）。 */
export function analysisTsconfig(root: string, manifest: ProjectManifest): string {
  const paths: Record<string, string[]> = {};
  // 包目录相对仓库的 packages 根；路径映射只用于分析，不改变构建与测试的模块解析。
  for (const item of manifest.packages)
    paths[item.name] = [`packages/${item.directory}/src/index.ts`];
  return `${JSON.stringify(
    {
      compilerOptions: { baseUrl: root, paths },
      include: manifest.fingerprints.sourceRoots.map((source) => `${root}/${source}/**/*.ts`),
    },
    null,
    2,
  )}\n`;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 用 dependency-cruiser 的 `--reaches` 求出"能到达改动文件"的测试文件：
 * 经包名（package exports 指向 dist）导入的 integration 与平台用例也能被找到。
 */
export function reachedTestFiles(
  root: string,
  manifest: ProjectManifest,
  changed: ReadonlyArray<string>,
  run: AnalysisRunner = defaultAnalysisRunner,
): string[] {
  const code = changed.filter(
    (path) => /\.(?:ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(path) && !path.endsWith('.d.ts'),
  );
  const directories = manifest.fingerprints.sourceRoots.filter((source) =>
    existsSync(join(root, source)),
  );
  if (code.length === 0 || directories.length === 0) return [];
  const directory = mkdtempSync(join(tmpdir(), 'affected-analysis-'));
  try {
    const tsconfig = join(directory, 'tsconfig.analysis.json');
    const config = join(directory, 'dependency-cruiser.cjs');
    writeFileSync(tsconfig, analysisTsconfig(root, manifest));
    writeFileSync(
      config,
      `module.exports = ${JSON.stringify({
        forbidden: [],
        options: {
          doNotFollow: { path: ['node_modules'] },
          tsConfig: { fileName: tsconfig },
        },
      })};\n`,
    );
    const result = run(
      depcruiseBin,
      [...directories, '--reaches', code.map(escapeRegExp).join('|'), '-T', 'json', '-c', config],
      root,
    );
    if (result.status !== 0)
      throw new Error(
        `dependency-cruiser 分析失败：退出码 ${String(result.status)}：${result.stderr ?? '（无 stderr）'}`,
      );
    const parsed = JSON.parse(result.stdout ?? '{}') as {
      modules?: ReadonlyArray<{ source: string }>;
    };
    return [...new Set((parsed.modules ?? []).map((module) => module.source))]
      .filter((path) => /\.(?:test|spec)\.ts$/.test(path))
      .sort((left, right) => left.localeCompare(right));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
