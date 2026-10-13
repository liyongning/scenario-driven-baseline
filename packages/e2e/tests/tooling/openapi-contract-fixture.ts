import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
export const contractPath = 'packages/openapi/contracts/trade-v1.yaml';
export const lockPath = 'packages/openapi/contracts/trade-v1.lock.json';
export const redoclyConfigPath = 'redocly.yaml';

export function readRepositoryFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

/** 复制真实清单及全部 OpenAPI 契约到临时根，保留多协议包拓扑，只替换目标契约内容。 */
export function writeOpenApiRoot(contract = readRepositoryFile(contractPath)) {
  const root = mkdtempSync(join(tmpdir(), 'template-openapi-contract-'));
  const manifestText = readRepositoryFile('project.manifest.json');
  const manifest = JSON.parse(manifestText) as {
    packages: ReadonlyArray<{
      directory: string;
      contract?: { file: string; lock: string };
    }>;
  };
  writeFileSync(join(root, 'project.manifest.json'), manifestText);
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
    for (const file of [pkg.contract.file, pkg.contract.lock]) {
      const sourceFile = resolve(repositoryRoot, file);
      const targetFile = join(root, file);
      mkdirSync(dirname(targetFile), { recursive: true });
      writeFileSync(targetFile, readFileSync(sourceFile));
    }
  }
  const contractTarget = join(root, contractPath);
  mkdirSync(dirname(contractTarget), { recursive: true });
  writeFileSync(contractTarget, contract);
  writeFileSync(join(root, redoclyConfigPath), readRepositoryFile(redoclyConfigPath));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
