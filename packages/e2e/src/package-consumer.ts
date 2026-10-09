type PackageJson = Readonly<{ name?: string; dependencies?: Readonly<Record<string, string>> }>;
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** 检查实际 tarball 清单及 SDK 固定协议依赖；协议包名由调用方按项目清单传入。 */
export function inspectPackageConsumer(
  options: Readonly<{
    packageJson: PackageJson;
    files: ReadonlyArray<string>;
    protocolPackageName: string;
    expectedProtocolVersion?: string;
  }>,
): string[] {
  const issues = options.files
    .filter((file) => /(?:^|\/)(?:testing|tests|fixtures|e2e)(?:\/|$)/.test(file))
    .map((file) => `package contains test-only path ${file}`);
  if (options.packageJson.name === options.protocolPackageName) return issues;
  const version = options.packageJson.dependencies?.[options.protocolPackageName];
  if (!version || !exactVersion.test(version))
    issues.push(
      `${options.protocolPackageName} dependency must be exact, received ${version ?? '<missing>'}`,
    );
  if (
    options.expectedProtocolVersion !== undefined &&
    version !== options.expectedProtocolVersion
  ) {
    issues.push(
      `${options.protocolPackageName} dependency does not match recorded ${options.expectedProtocolVersion}`,
    );
  }
  return issues;
}
