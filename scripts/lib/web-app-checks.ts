import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packagesByRole, type ManifestPackage, type ProjectManifest } from './project-manifest.ts';

/** `web-app` 形态的产品包；模板与其他复刻项目均按清单发现。 */
export function webAppPackages(manifest: ProjectManifest): ReadonlyArray<ManifestPackage> {
  return packagesByRole(manifest, 'product').filter((pkg) => pkg.form === 'web-app');
}

/** `web-app` 形态包的产物检查骨架；具体规则由 Web 产物边界任务补齐。 */
export function webAppPackageDirectories(manifest: ProjectManifest): string[] {
  return webAppPackages(manifest).map((pkg) => `packages/${pkg.directory}`);
}

type PackageJson = Readonly<{
  name?: string;
  private?: boolean;
  scripts?: Readonly<Record<string, string>>;
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
}>;

const packageLevelConfig =
  /^(?:eslint\.config\.|\.eslintrc|prettier\.config\.|\.prettierrc|oxlint)/;
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function packageJson(root: string, pkg: ManifestPackage): PackageJson {
  return JSON.parse(
    readFileSync(resolve(root, 'packages', pkg.directory, 'package.json'), 'utf8'),
  ) as PackageJson;
}

/** 应用包初始化对齐：根配置、精确依赖与绑定协议 workspace 依赖均由清单派生。 */
export function checkWebAppAlignment(root: string, manifest: ProjectManifest): string[] {
  const issues: string[] = [];
  const webPackages = webAppPackages(manifest);
  const eslintConfig = resolve(root, 'eslint.config.js');
  if (webPackages.length > 0 && existsSync(eslintConfig)) {
    const source = readFileSync(eslintConfig, 'utf8');
    if (
      !source.includes('manifest.quality?.componentNameExemptions') ||
      !/componentNameExemptions\s*\.map/.test(source)
    )
      issues.push('eslint.config.js: component name exemptions must be read from the manifest');
    if (/files\s*:\s*\[[^\]]*['"`][^'"`*?]*\/[^'"`*?]*\.vue['"`]/s.test(source))
      issues.push('eslint.config.js: hardcoded component name exemption is not allowed');
  }
  for (const pkg of webPackages) {
    const directory = resolve(root, 'packages', pkg.directory);
    if (!existsSync(directory)) continue;
    const manifestFile = `packages/${pkg.directory}/package.json`;
    const value = packageJson(root, pkg);
    if (value.name !== pkg.name) issues.push(`${manifestFile}: expected name ${pkg.name}`);
    if (pkg.private !== true || value.private !== true)
      issues.push(`${manifestFile}: web-app package must be private`);

    for (const entry of readdirSync(directory, { withFileTypes: true }))
      if (packageLevelConfig.test(entry.name))
        issues.push(`${manifestFile}: package-level lint or format configuration ${entry.name}`);
    if (existsSync(join(directory, '.vscode')))
      issues.push(`${manifestFile}: scaffold residue .vscode`);
    if (existsSync(join(directory, 'README.md')))
      issues.push(`${manifestFile}: scaffold residue README.md`);
    if (
      JSON.stringify(value.scripts ?? {})
        .toLowerCase()
        .includes('cypress')
    )
      issues.push(`${manifestFile}: scaffold residue Cypress script`);

    const dependencies = Object.assign({}, value.dependencies, value.devDependencies);
    for (const [name, version] of Object.entries(dependencies)) {
      if (version === 'workspace:*') continue;
      if (!exactVersion.test(version))
        issues.push(`${manifestFile}: dependency ${name} must use an exact version`);
    }
    if (!value.dependencies?.['@vue/devtools-api'])
      issues.push(`${manifestFile}: missing explicit dependency @vue/devtools-api`);
    if (value.dependencies?.['@vue/eslint-config-typescript'])
      issues.push(`${manifestFile}: @vue/eslint-config-typescript must not be a dependency`);

    const binding = manifest.bindings.find((item) => item.product === pkg.directory)!;
    const protocol = manifest.packages.find((item) => item.directory === binding.protocol)!;
    if (value.dependencies?.[protocol.name] !== 'workspace:*')
      issues.push(
        `${manifestFile}: bound protocol ${protocol.name} must use a workspace dependency`,
      );
  }
  return issues;
}

/** `tsconfig.core.json` 中由清单派生的 include；顺序稳定，便于门禁比对。 */
export function coreTsconfigInclude(pkg: ManifestPackage): string[] {
  if (pkg.form !== 'web-app') return [];
  const roots = pkg.moduleRoots && pkg.moduleRoots.length > 0 ? pkg.moduleRoots : ['src'];
  return [
    ...roots.map((root) => `${root}/runtime/**/*.ts`),
    ...roots.map((root) => `${root}/*/core/**/*.ts`),
    ...roots.map((root) => `${root}/*/ports/**/*.ts`),
    ...(pkg.globalStore ? [pkg.globalStore] : []),
  ];
}

/** 校验核心 tsconfig 的 include、lib 与 types 仍与清单事实一致。 */
export function checkCoreTsconfig(root: string, manifest: ProjectManifest): string[] {
  const issues: string[] = [];
  for (const pkg of webAppPackages(manifest)) {
    const path = `packages/${pkg.directory}/tsconfig.core.json`;
    const file = resolve(root, path);
    if (!existsSync(file)) {
      issues.push(`${path}: missing`);
      continue;
    }
    const value = JSON.parse(readFileSync(file, 'utf8')) as {
      include?: unknown;
      compilerOptions?: { lib?: unknown; types?: unknown };
    };
    const expected = coreTsconfigInclude(pkg);
    if (JSON.stringify(value.include) !== JSON.stringify(expected))
      issues.push(`${path}: include must be derived from project.manifest.json`);
    if (JSON.stringify(value.compilerOptions?.lib) !== JSON.stringify(['ES2022']))
      issues.push(`${path}: lib must be ["ES2022"]`);
    if (JSON.stringify(value.compilerOptions?.types) !== JSON.stringify([]))
      issues.push(`${path}: types must be empty`);
  }
  return issues;
}
