import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { errorMessage, loadProjectManifest, type ManifestPackage } from './lib/project-manifest.ts';
import {
  checkContractConsistency,
  contractTitle,
  contractVersion,
  generateContractFiles,
  sha256,
  type NormalizedContractConventions,
} from './lib/openapi-contract-core.ts';

export { checkContractConsistency, generateContractFiles } from './lib/openapi-contract-core.ts';

type JsonObject = Record<string, unknown>;
export type ContractResult = Readonly<{ issues: ReadonlyArray<string>; exitCode: number }>;

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const redoclyBinary = join(repositoryRoot, 'node_modules/.bin/redocly');
const generatedPaths = [
  'src/generated/schema.d.ts',
  'src/generated/operations.ts',
  'src/generated/codes.ts',
] as const;
type ContractConventionsModule = Readonly<{
  normalizeContractConventions(value: unknown): NormalizedContractConventions;
}>;

async function conventionsModuleFor(
  root: string,
  contractFile: string,
): Promise<ContractConventionsModule> {
  const modulePath = join(dirname(resolve(root, contractFile)), 'conventions.ts');
  let module: Partial<ContractConventionsModule>;
  try {
    module = (await import(pathToFileURL(modulePath).href)) as Partial<ContractConventionsModule>;
  } catch (error) {
    const wrapped = new Error(
      `无法加载契约约定模块 ${modulePath}: ${errorMessage(error)}`,
    ) as Error & {
      cause: unknown;
    };
    wrapped.cause = error;
    throw wrapped;
  }
  if (typeof module.normalizeContractConventions !== 'function')
    throw new Error(`契约约定模块 ${modulePath} 缺少 normalizeContractConventions`);
  return module as ContractConventionsModule;
}

async function conventionsFor(
  root: string,
  contractFile: string,
  source: string,
): Promise<NormalizedContractConventions> {
  const module = await conventionsModuleFor(root, contractFile);
  return module.normalizeContractConventions(parseYaml(source));
}

function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function openapiPackages(root: string): ReadonlyArray<ManifestPackage> {
  return loadProjectManifest(root).packages.filter(
    (pkg) => pkg.role === 'protocol' && pkg.contract,
  );
}

function packagePath(root: string, pkg: ManifestPackage, path: string): string {
  return resolve(root, 'packages', pkg.directory, path);
}

function engineContractPaths(root: string, pkg: ManifestPackage) {
  return {
    contract: packagePath(root, pkg, 'testing/engine/trade-v1.yaml'),
    config: packagePath(root, pkg, 'testing/engine/redocly.yaml'),
  };
}

function writeAtomic(path: string, content: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

function redocly(root: string, args: ReadonlyArray<string>) {
  return spawnSync(redoclyBinary, [...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function lintIssues(root: string, contractPath: string, configPath = 'redocly.yaml'): string[] {
  const result = redocly(root, [
    'lint',
    contractPath,
    '--config',
    resolve(root, configPath),
    '--format',
    'json',
  ]);
  let parsed: JsonObject | undefined;
  try {
    parsed = object(JSON.parse(result.stdout));
  } catch {
    parsed = undefined;
  }
  const totals = object(parsed?.totals);
  const errors = typeof totals?.errors === 'number' ? totals.errors : 0;
  const warnings = typeof totals?.warnings === 'number' ? totals.warnings : 0;
  if (result.status === 0 && errors === 0 && warnings === 0) return [];
  return [
    `redocly lint failed for ${contractPath}: ${result.stdout || result.stderr || `exit ${result.status}`}`,
  ];
}

async function bundleContract(
  root: string,
  contractPath: string,
  output: string,
  configPath = 'redocly.yaml',
): Promise<void> {
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}.json`;
  const result = redocly(root, [
    'bundle',
    contractPath,
    '--config',
    resolve(root, configPath),
    '--dereferenced',
    '--ext',
    'json',
    '--output',
    temporary,
  ]);
  if (result.status !== 0) {
    rmSync(temporary, { force: true });
    throw new Error(`redocly bundle failed: ${result.stdout || result.stderr}`);
  }
  const bundled = JSON.parse(readFileSync(temporary, 'utf8')) as unknown;
  rmSync(temporary, { force: true });
  writeAtomic(output, `${JSON.stringify(bundled, null, 2)}\n`);
}

/** 运行 lint 与契约自洽检查；任一失败返回可直接展示的问题。 */
export async function validateContract(root: string): Promise<ContractResult> {
  const issues: string[] = [];
  for (const pkg of openapiPackages(root)) {
    const contractPath = pkg.contract!.file;
    const source = readFileSync(resolve(root, contractPath), 'utf8');
    const conventions = await conventionsFor(root, contractPath, source);
    issues.push(...checkContractConsistency(source, conventions).issues);
    issues.push(...lintIssues(root, contractPath));
    const engine = engineContractPaths(root, pkg);
    if (existsSync(engine.contract)) {
      const engineSource = readFileSync(engine.contract, 'utf8');
      const engineConventions = await conventionsFor(root, engine.contract, engineSource);
      issues.push(...checkContractConsistency(engineSource, engineConventions).issues);
      issues.push(...lintIssues(root, engine.contract, engine.config));
    }
  }
  return { issues, exitCode: Math.min(1, issues.length) };
}

/** 按传入来源重新生成全部 OpenAPI 生成物，并原子写回完整 lock。 */
export async function syncContract(root: string, source: string): Promise<void> {
  if (!source.trim()) throw new Error('api:sync requires a contract source argument');
  for (const pkg of openapiPackages(root)) {
    const contract = pkg.contract!;
    const contractPath = resolve(root, contract.file);
    const sourceText = readFileSync(contractPath, 'utf8');
    const conventions = await conventionsFor(root, contract.file, sourceText);
    const consistency = checkContractConsistency(sourceText, conventions);
    if (consistency.issues.length > 0) throw new Error(consistency.issues.join('\n'));
    const generated = await generateContractFiles(sourceText, conventions);
    const bundleOutput = packagePath(root, pkg, 'testing/contract.bundle.json');
    await bundleContract(root, contract.file, bundleOutput);
    for (const path of generatedPaths) writeAtomic(packagePath(root, pkg, path), generated[path]!);
    const lock = {
      contract: contractTitle(sourceText, pkg.name),
      version: contractVersion(sourceText),
      source,
      sha256: sha256(sourceText),
      generated: Object.fromEntries(generatedPaths.map((path) => [path, sha256(generated[path]!)])),
    };
    writeAtomic(resolve(root, contract.lock), `${JSON.stringify(lock, null, 2)}\n`);
  }
}

/** 比较 lock、当前契约与内存重新生成结果，不修改任何文件。 */
export async function statusContract(root: string): Promise<string[]> {
  const issues: string[] = [];
  for (const pkg of openapiPackages(root)) {
    const contract = pkg.contract!;
    const source = readFileSync(resolve(root, contract.file), 'utf8');
    const conventions = await conventionsFor(root, contract.file, source);
    const lockPath = resolve(root, contract.lock);
    const lock = object(JSON.parse(readFileSync(lockPath, 'utf8'))) ?? {};
    const version = contractVersion(source);
    if (lock.version !== version)
      issues.push(`${contract.lock}: version ${String(lock.version)} != ${version}`);
    if (lock.sha256 !== sha256(source)) issues.push(`${contract.file}: sha256 differs from lock`);
    const generated = await generateContractFiles(source, conventions);
    const lockedGenerated = object(lock.generated) ?? {};
    const expectedPaths = [...generatedPaths].sort();
    const lockedPaths = Object.keys(lockedGenerated).sort();
    for (const path of expectedPaths)
      if (!lockedPaths.includes(path)) issues.push(`${contract.lock}: missing generated ${path}`);
    for (const path of lockedPaths)
      if (!expectedPaths.includes(path as (typeof generatedPaths)[number]))
        issues.push(`${contract.lock}: unknown generated ${path}`);
    for (const path of expectedPaths) {
      const expected = sha256(generated[path]!);
      if (lockedGenerated[path] !== expected)
        issues.push(`${contract.lock}: sha256 differs for ${path}`);
      const disk = packagePath(root, pkg, path);
      if (!existsSync(disk)) issues.push(`${path}: generated file is missing`);
      else if (sha256(readFileSync(disk)) !== expected)
        issues.push(`${path}: sha256 differs from regenerated content`);
    }
  }
  return issues;
}

/** 解析根命令参数并执行 OpenAPI 契约动作；供 CLI 与工具集成用例共用。 */
export async function runApiContractCli(
  argv: ReadonlyArray<string>,
  root = process.cwd(),
): Promise<ContractResult> {
  const direct = ['validate', 'sync', 'status'].includes(argv[0] ?? '');
  const action = direct ? argv[0] : argv[2];
  const source = direct ? argv[1] : argv[3];
  try {
    if (action === 'validate') return await validateContract(root);
    if (action === 'sync') {
      if (!source) return { issues: ['api:sync requires a contract source argument'], exitCode: 1 };
      await syncContract(root, source);
      return { issues: [], exitCode: 0 };
    }
    if (action === 'status') {
      const issues = await statusContract(root);
      return { issues, exitCode: Math.min(1, issues.length) };
    }
    return { issues: [`unknown api contract action: ${action ?? '<missing>'}`], exitCode: 1 };
  } catch (error) {
    return { issues: [errorMessage(error)], exitCode: 1 };
  }
}

/* v8 ignore start -- 真实 CLI 分支由 OpenAPI 契约 integration 用例执行。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await runApiContractCli(process.argv);
  console.log(JSON.stringify({ issues: result.issues }, null, 2));
  process.exitCode = result.exitCode;
}
/* v8 ignore stop */
