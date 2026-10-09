import {
  coverageExclusions,
  loadProjectManifest,
  type ProjectManifest,
} from './project-manifest.ts';
import { codeFiles, readSourceInventory } from './source-inventory.ts';

/** 覆盖率配置：include 取清单 code 类文件，exclude 只含测试模式、生成代码与登记排除项。 */
export type CoverageScope = Readonly<{
  include: ReadonlyArray<string>;
  exclude: ReadonlyArray<string>;
}>;

/** 非特定文件的固定排除：测试文件模式与生成代码目录。 */
const fixedExcludes = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/generated/**',
  '**/.generated/**',
] as const;

/** 覆盖率 include：清单读出的全部 code 类文件。 */
export function coverageInclude(
  root: string,
  manifest: ProjectManifest = loadProjectManifest(root),
): string[] {
  return codeFiles(readSourceInventory(root, manifest));
}

/** 覆盖率 exclude：测试文件模式、生成代码与清单登记的覆盖率排除项。 */
export function coverageExclude(
  root: string,
  manifest: ProjectManifest = loadProjectManifest(root),
): string[] {
  return [...fixedExcludes, ...coverageExclusions(manifest).map((item) => item.path)];
}

/** 根 vitest 配置与 check:coverage 共用的覆盖率范围。 */
export function coverageScope(
  root: string,
  manifest: ProjectManifest = loadProjectManifest(root),
): CoverageScope {
  return { include: coverageInclude(root, manifest), exclude: coverageExclude(root, manifest) };
}
