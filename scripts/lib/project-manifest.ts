import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

export type PackageRole = 'product' | 'protocol' | 'test';
export type TestProjectClass = 'unit' | 'integration' | 'platform';

/** 清单登记的一个包：目录、包名、角色、私有标记与允许的一级子目录。 */
export type ManifestPackage = Readonly<{
  directory: string;
  name: string;
  role: PackageRole;
  private: boolean;
  allowedDirectories: ReadonlyArray<string>;
  /** 包内承载模块的根目录，其一级子目录视为模块。 */
  moduleRoots?: ReadonlyArray<string>;
  /** 产品包内声明消费接口的模块路径；仅 product 角色可填。 */
  consumedOperations?: ReadonlyArray<string>;
}>;

/** 清单登记的一个测试项目：Vitest 项目名、类别与项目配置文件。 */
export type TestProject = Readonly<{
  name: string;
  class: TestProjectClass;
  /** 该项目的 Vitest 项目配置文件路径，根 vitest 配置按它组装 projects。 */
  config: string;
  /** 为 true 时验收入口逐文件运行该项目，每个文件一份报告。 */
  perFile?: boolean;
  /** 逐文件运行前执行的准备命令名，例如退出并预热微信开发者工具。 */
  prepare?: string;
}>;

/** 参与验证摘要的源码目录、构建输入与协议来源输入。 */
export type FingerprintInputs = Readonly<{
  sourceRoots: ReadonlyArray<string>;
  buildInputs: ReadonlyArray<string>;
  protocolInputs: ReadonlyArray<string>;
}>;

/** 一条带理由的质量例外登记。 */
export type QualityException = Readonly<{ path: string; reason: string }>;

/** 质量例外登记：覆盖率排除与行数上限豁免。 */
export type QualitySettings = Readonly<{
  coverageExclusions: ReadonlyArray<QualityException>;
  maxLinesExemptions: ReadonlyArray<QualityException>;
}>;

/** 可选的发布设置；缺省表示已删除发布模块。 */
export type ReleaseSettings = Readonly<{ registry: string; tagPrefix: string }>;

/** 项目清单：工程形态的唯一事实来源。 */
export type ProjectManifest = Readonly<{
  packages: ReadonlyArray<ManifestPackage>;
  requiredCommands: ReadonlyArray<string>;
  testProjects: ReadonlyArray<TestProject>;
  fingerprints: FingerprintInputs;
  quality?: QualitySettings;
  release?: ReleaseSettings;
}>;

export const projectManifestFile = 'project.manifest.json';

/** 清单 schema 总是从仓库位置加载，临时根目录无需复制 schema。 */
export const projectManifestSchemaUrl = new URL(
  '../../project.manifest.schema.json',
  import.meta.url,
);

/** 把未知异常转成可读信息；门禁与清单读取统一使用，避免各处重复分支。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let compiled: ReturnType<typeof compileSchema> | undefined;

function compileSchema() {
  const schema = JSON.parse(readFileSync(projectManifestSchemaUrl, 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  return { validate, errorsText: () => ajv.errorsText(validate.errors) };
}

/** 校验角色唯一、测试包私有、测试项目名唯一与类别覆盖等 schema 无法表达的事实。 */
export function validateManifest(manifest: ProjectManifest): string[] {
  const issues: string[] = [];
  for (const role of ['product', 'protocol', 'test'] as const) {
    const matches = manifest.packages.filter((item) => item.role === role);
    if (matches.length !== 1)
      issues.push(`expected exactly one ${role} package, found ${matches.length}`);
  }
  const directories = manifest.packages.map((item) => item.directory);
  if (new Set(directories).size !== directories.length)
    issues.push('package directories must be unique');
  const names = manifest.packages.map((item) => item.name);
  if (new Set(names).size !== names.length) issues.push('package names must be unique');
  const testPackage = manifest.packages.find((item) => item.role === 'test');
  if (testPackage && testPackage.private !== true) issues.push('the test package must be private');
  const projectNames = manifest.testProjects.map((item) => item.name);
  if (new Set(projectNames).size !== projectNames.length)
    issues.push('test project names must be unique');
  for (const requiredClass of ['unit', 'integration'] as const) {
    if (!manifest.testProjects.some((item) => item.class === requiredClass)) {
      issues.push(`at least one ${requiredClass} test project is required`);
    }
  }
  for (const item of manifest.packages) {
    if (item.role !== 'product' && item.consumedOperations && item.consumedOperations.length > 0) {
      issues.push(
        `consumedOperations is only allowed for the product package, found on ${item.name}`,
      );
    }
  }
  return issues;
}

/** 从门禁根目录加载并校验清单；缺失或非法时抛出带路径的错误，不回退到默认值。 */
export function loadProjectManifest(root: string): ProjectManifest {
  const path = join(root, projectManifestFile);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const issue = new Error(
      `${projectManifestFile} cannot be read from ${path}: ${String(error)}`,
    ) as Error & { cause: unknown };
    issue.cause = error;
    throw issue;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const issue = new Error(
      `${projectManifestFile} is not valid JSON: ${String(error)}`,
    ) as Error & { cause: unknown };
    issue.cause = error;
    throw issue;
  }
  compiled ??= compileSchema();
  if (!compiled.validate(parsed)) {
    throw new Error(
      `${projectManifestFile} does not match ${projectManifestSchemaUrl.pathname}: ${compiled.errorsText()}`,
    );
  }
  const manifest = parsed as ProjectManifest;
  const issues = validateManifest(manifest);
  if (issues.length > 0) throw new Error(`${projectManifestFile} is invalid: ${issues.join('; ')}`);
  return manifest;
}

/** 按角色取唯一的包；角色缺失属于清单非法。 */
export function packageByRole(manifest: ProjectManifest, role: PackageRole): ManifestPackage {
  const found = manifest.packages.find((item) => item.role === role);
  if (!found) throw new Error(`${projectManifestFile} has no ${role} package`);
  return found;
}

/** 取指定类别的测试项目名，顺序与清单一致。 */
export function testProjectsByClass(
  manifest: ProjectManifest,
  classes: ReadonlyArray<TestProjectClass>,
): string[] {
  return manifest.testProjects
    .filter((item) => classes.includes(item.class))
    .map((item) => item.name);
}

/** 取根 vitest 配置组装 projects 所需的项目配置文件路径，顺序与清单一致。 */
export function testProjectConfigs(manifest: ProjectManifest): string[] {
  return manifest.testProjects.map((item) => item.config);
}

/** 测试项目的默认报告名：unit 类项目合并为 unit，其余每个项目一份与自己同名的报告。 */
export function reportNameFor(project: TestProject): string {
  return project.class === 'unit' ? 'unit' : project.name;
}

/** 默认报告名清单（去重、保持清单顺序）；运行入口与场景门禁共用同一口径。 */
export function defaultReportNames(manifest: ProjectManifest): string[] {
  return [...new Set(manifest.testProjects.map(reportNameFor))];
}

/** 取登记的覆盖率排除项；清单缺省质量块时返回空数组。 */
export function coverageExclusions(manifest: ProjectManifest): ReadonlyArray<QualityException> {
  return manifest.quality?.coverageExclusions ?? [];
}

/** 取登记的行数上限豁免项；清单缺省质量块时返回空数组。 */
export function maxLinesExemptions(manifest: ProjectManifest): ReadonlyArray<QualityException> {
  return manifest.quality?.maxLinesExemptions ?? [];
}
