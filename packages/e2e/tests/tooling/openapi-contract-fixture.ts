import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
type ManifestPackage = Readonly<{
  directory: string;
  role?: string;
  protocolKind?: string;
  contract?: Readonly<{ file: string; lock: string }>;
}>;

const manifestPackages = () =>
  (
    JSON.parse(readFileSync(join(repositoryRoot, 'project.manifest.json'), 'utf8')) as {
      packages: ManifestPackage[];
    }
  ).packages;
const openApiPackage = manifestPackages().find(
  (pkg) => pkg.role === 'protocol' && pkg.protocolKind === 'openapi' && pkg.contract,
);
if (!openApiPackage?.contract)
  throw new Error('OpenAPI fixture requires a registered OpenAPI package with a contract');
const openApiDirectory = openApiPackage.directory;
const engineDirectory = join('packages', openApiDirectory, 'testing/engine');
export const contractPath = join(engineDirectory, 'trade-v1.yaml');
export const lockPath = join(engineDirectory, 'trade-v1.lock.json');
export const redoclyConfigPath = join(engineDirectory, 'redocly.yaml');

export function readRepositoryFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

/** 以清单中的 OpenAPI 包为骨架，把引擎测试契约登记为待测契约并写入受控根。 */
export function writeOpenApiRoot(contract = readRepositoryFile(contractPath)) {
  const root = mkdtempSync(join(tmpdir(), 'template-openapi-contract-'));
  const manifest = JSON.parse(readRepositoryFile('project.manifest.json')) as {
    packages: Array<ManifestPackage & { contract?: { file: string; lock: string } }>;
    fingerprints: { protocolInputs: string[] };
  };
  const packageEntry = manifest.packages.find((pkg) => pkg.directory === openApiDirectory);
  if (!packageEntry) throw new Error(`fixture package ${openApiDirectory} is missing`);
  packageEntry.contract = { file: contractPath, lock: lockPath };
  for (const path of [contractPath, lockPath])
    if (!manifest.fingerprints.protocolInputs.includes(path))
      manifest.fingerprints.protocolInputs.push(path);
  writeFileSync(join(root, 'project.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of ['tsconfig.base.json', 'tsconfig.json']) {
    const source = resolve(repositoryRoot, file);
    try {
      writeFileSync(join(root, file), readFileSync(source));
    } catch {
      // 临时根只需要门禁实际配置；缺失的可选文件由具体用例自行提供。
    }
  }
  for (const pkg of manifest.packages) {
    const source = resolve(repositoryRoot, 'packages', pkg.directory, 'package.json');
    const target = join(root, 'packages', pkg.directory, 'package.json');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source));
    if (!pkg.contract) continue;
    for (const file of [
      contractPath,
      redoclyConfigPath,
      join(engineDirectory, 'conventions.ts'),
      join('packages', pkg.directory, 'testing/conventions.ts'),
    ]) {
      const sourceFile = resolve(repositoryRoot, file);
      const targetFile = join(root, file);
      mkdirSync(dirname(targetFile), { recursive: true });
      writeFileSync(targetFile, readFileSync(sourceFile));
    }
  }
  const contractTarget = join(root, contractPath);
  mkdirSync(dirname(contractTarget), { recursive: true });
  writeFileSync(contractTarget, contract);
  writeFileSync(join(root, 'redocly.yaml'), readRepositoryFile('redocly.yaml'));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
