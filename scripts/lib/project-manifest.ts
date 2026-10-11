import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

export type PackageRole = 'product' | 'protocol' | 'test';
export type TestProjectClass = 'unit' | 'integration' | 'platform';
export type ProductForm = 'sdk' | 'web-app';
export type ProtocolKind = 'idl' | 'openapi';

/** OpenAPI 协议包登记的一份契约及其来源与生成物 lock。 */
export type ManifestContract = Readonly<{ file: string; lock: string }>;

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
  /** 产品包的工程形态；仅 product 角色可填。 */
  form?: ProductForm;
  /** 协议包的适配器种类；仅 protocol 角色可填。 */
  protocolKind?: ProtocolKind;
  /** Web 应用包的全局 store 模块路径；仅 web-app 形态可填。 */
  globalStore?: string;
  /** 协议包在 check:fast 中执行的前置检查命令。 */
  checks?: ReadonlyArray<string>;
  /** OpenAPI 协议包登记的契约与 lock 路径。 */
  contract?: ManifestContract;
}>;

/** 产品、协议与平台测试项目的一条组合绑定。 */
export type ManifestBinding = Readonly<{
  name: string;
  product: string;
  protocol: string;
  platforms: ReadonlyArray<string>;
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

/** 质量例外登记：覆盖率排除、行数上限与组件命名豁免。 */
export type QualitySettings = Readonly<{
  coverageExclusions: ReadonlyArray<QualityException>;
  maxLinesExemptions: ReadonlyArray<QualityException>;
  componentNameExemptions?: ReadonlyArray<QualityException>;
}>;

/** 可选的发布设置；缺省表示已删除发布模块。 */
export type ReleaseSettings = Readonly<{ registry: string; tagPrefix: string }>;

/** 项目清单：工程形态的唯一事实来源。 */
export type ProjectManifest = Readonly<{
  packages: ReadonlyArray<ManifestPackage>;
  bindings: ReadonlyArray<ManifestBinding>;
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

/** 校验角色数量、测试包私有、测试项目名唯一、绑定拓扑与 workspace 依赖等 schema 无法表达的事实。 */
export function validateManifest(manifest: ProjectManifest, root?: string): string[] {
  const issues: string[] = [];
  for (const role of ['product', 'protocol', 'test'] as const) {
    const matches = manifest.packages.filter((item) => item.role === role);
    if (role === 'test' && matches.length !== 1)
      issues.push(`expected exactly one test package, found ${matches.length}`);
    if (role !== 'test' && matches.length < 1)
      issues.push(`expected at least one ${role} package, found ${matches.length}`);
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
  for (const item of manifest.packages) {
    if (item.role === 'product' && !item.form)
      issues.push(`product package ${item.name} must declare form`);
    if (item.role === 'protocol' && !item.protocolKind)
      issues.push(`protocol package ${item.name} must declare protocolKind`);
    if (item.form && item.form !== 'web-app' && item.globalStore)
      issues.push(`globalStore is only allowed for web-app, found on ${item.name}`);
    if (item.role !== 'protocol' && item.checks && item.checks.length > 0)
      issues.push(`checks is only allowed for protocol packages, found on ${item.name}`);
    if (item.contract) {
      if (!manifest.fingerprints.protocolInputs.includes(item.contract.file))
        issues.push(
          `contract file ${item.contract.file} must be listed in fingerprints.protocolInputs`,
        );
      if (!manifest.fingerprints.protocolInputs.includes(item.contract.lock))
        issues.push(
          `contract lock ${item.contract.lock} must be listed in fingerprints.protocolInputs`,
        );
    }
  }
  const knownDirectories = new Set(manifest.packages.map((item) => item.directory));
  const productDirectories = new Set(
    manifest.packages.filter((item) => item.role === 'product').map((item) => item.directory),
  );
  const protocolDirectories = new Set(
    manifest.packages.filter((item) => item.role === 'protocol').map((item) => item.directory),
  );
  const platformProjects = new Set(
    manifest.testProjects.filter((item) => item.class === 'platform').map((item) => item.name),
  );
  const bindingNames = manifest.bindings.map((item) => item.name);
  if (new Set(bindingNames).size !== bindingNames.length)
    issues.push('binding names must be unique');
  const productBindingCounts = new Map<string, number>();
  for (const binding of manifest.bindings) {
    if (!productDirectories.has(binding.product))
      issues.push(`binding ${binding.name} product must reference a product package directory`);
    if (!protocolDirectories.has(binding.protocol))
      issues.push(`binding ${binding.name} protocol must reference a protocol package directory`);
    if (!knownDirectories.has(binding.product) || !knownDirectories.has(binding.protocol))
      issues.push(`binding ${binding.name} references an unknown package directory`);
    for (const platform of binding.platforms)
      if (!platformProjects.has(platform))
        issues.push(`binding ${binding.name} platform ${platform} is not a platform test project`);
    productBindingCounts.set(binding.product, (productBindingCounts.get(binding.product) ?? 0) + 1);
  }
  for (const product of manifest.packages.filter((item) => item.role === 'product')) {
    const count = productBindingCounts.get(product.directory) ?? 0;
    if (count !== 1)
      issues.push(`product package ${product.directory} must appear in exactly one binding`);
    if (!root) continue;
    const binding = manifest.bindings.find((item) => item.product === product.directory);
    const protocol =
      binding && manifest.packages.find((item) => item.directory === binding.protocol);
    if (!protocol) continue;
    let packageJson: { dependencies?: Record<string, unknown> };
    try {
      packageJson = JSON.parse(
        readFileSync(join(root, 'packages', product.directory, 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, unknown> };
    } catch (error) {
      issues.push(
        `cannot read package.json for product ${product.directory}: ${errorMessage(error)}`,
      );
      continue;
    }
    if (packageJson.dependencies?.[protocol.name] !== 'workspace:*')
      issues.push(
        `product package ${product.directory} must declare workspace dependency on ${protocol.name}`,
      );
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
  const issues = validateManifest(manifest, root);
  if (issues.length > 0) throw new Error(`${projectManifestFile} is invalid: ${issues.join('; ')}`);
  return manifest;
}

/** 按角色取全部包，顺序与清单一致；不再假定每种角色唯一。 */
export function packagesByRole(
  manifest: ProjectManifest,
  role: PackageRole,
): ReadonlyArray<ManifestPackage> {
  return manifest.packages.filter((item) => item.role === role);
}

/** 取 SDK 形态的产品包；模板自身固定消费这一形态，Web 产品包不参与 SDK 工程检查。 */
export function sdkProduct(manifest: ProjectManifest): ManifestPackage {
  const found = packagesByRole(manifest, 'product').find((item) => item.form === 'sdk');
  if (!found) throw new Error(`${projectManifestFile} has no sdk product package`);
  return found;
}

/** 按目录取包；绑定校验后目录唯一。 */
export function packageByDirectory(manifest: ProjectManifest, directory: string): ManifestPackage {
  const found = manifest.packages.find((item) => item.directory === directory);
  if (!found) throw new Error(`${projectManifestFile} has no package ${directory}`);
  return found;
}

/** 取唯一测试包；test 角色数量由清单校验保证恰好一个。 */
export function testPackage(manifest: ProjectManifest): ManifestPackage {
  const found = packagesByRole(manifest, 'test')[0];
  if (!found) throw new Error(`${projectManifestFile} has no test package`);
  return found;
}

/** 取产品包所在绑定；产品包恰好一条绑定由清单校验保证。 */
export function bindingForProduct(
  manifest: ProjectManifest,
  productDirectory: string,
): ManifestBinding {
  const found = manifest.bindings.find((item) => item.product === productDirectory);
  if (!found) throw new Error(`${projectManifestFile} has no binding for ${productDirectory}`);
  return found;
}

/** 按名称取绑定；未登记时抛错。 */
export function bindingByName(manifest: ProjectManifest, name: string): ManifestBinding {
  const found = manifest.bindings.find((item) => item.name === name);
  if (!found) throw new Error(`${projectManifestFile} has no binding ${name}`);
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

/**
 * 场景门禁默认读取的报告路径：unit 类与非 perFile 项目各一份 `<name>.json`，
 * perFile 项目取其目录 `reports/<name>/` 下的全部报告文件（见 GATE-14）。
 */
export function defaultReportPaths(
  root: string,
  runId: string,
  manifest: ProjectManifest,
): string[] {
  const reportsDirectory = resolve(root, 'artifacts', runId, 'reports');
  const paths: string[] = [];
  for (const project of manifest.testProjects) {
    if (project.perFile) {
      const directory = join(reportsDirectory, project.name);
      if (!existsSync(directory)) continue;
      for (const entry of readdirSync(directory).sort())
        if (entry.endsWith('.json')) paths.push(join(directory, entry));
    } else {
      const path = join(reportsDirectory, `${reportNameFor(project)}.json`);
      if (existsSync(path)) paths.push(path);
    }
  }
  return [...new Set(paths)];
}

/** 取登记的覆盖率排除项；清单缺省质量块时返回空数组。 */
export function coverageExclusions(manifest: ProjectManifest): ReadonlyArray<QualityException> {
  return manifest.quality?.coverageExclusions ?? [];
}

/** 取登记的行数上限豁免项；清单缺省质量块时返回空数组。 */
export function maxLinesExemptions(manifest: ProjectManifest): ReadonlyArray<QualityException> {
  return manifest.quality?.maxLinesExemptions ?? [];
}

/** 取登记的 Vue 多词组件名豁免项；清单缺省时返回空数组。 */
export function componentNameExemptions(
  manifest: ProjectManifest,
): ReadonlyArray<QualityException> {
  return manifest.quality?.componentNameExemptions ?? [];
}
