import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parse } from 'dotenv';
import { build as viteBuild } from 'vite';
import { CreateTrade } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { parseLiveConfig } from '../../host/weapp/live/config';
import { buildVerificationFingerprints } from '../../../../scripts/lib/fingerprints';

export const liveOutputFiles = [
  'app.js', 'app.json', 'project.config.json', 'pages/live/index.js',
  'pages/live/index.json', 'pages/live/index.wxml', 'pages/live/index.wxss',
] as const;

export const liveSourceFiles = [
  'packages/e2e/host/weapp/live/config.ts',
  'packages/e2e/host/weapp/live/controller.ts',
  'packages/e2e/host/weapp/live/create-trade.ts',
  'packages/e2e/host/weapp/live/create-trade-errors.ts',
  'packages/e2e/host/weapp/live/evidence.ts',
  'packages/e2e/host/weapp/live/page.ts',
  'packages/e2e/host/weapp/live/runtime.ts',
  'packages/e2e/host/weapp/live/token-store.ts',
  'packages/e2e/host/weapp/live/trade-form.ts',
  'packages/e2e/host/weapp/pages/live/index.js',
  'packages/e2e/host/weapp/vite.live.config.ts',
] as const;

export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const cliErrorMessage = (error: unknown): string => error instanceof Error ? error.message : 'unknown error';

export const isForbiddenLiveModule = (id: string): boolean => /(?:^|\/)(?:testing\/shadow|tests\/fixtures|channel-double(?:\.|\/)|fixtures(?:\/|$))/i.test(id.split('\\').join('/'));

export function collectLiveModuleGraph(repositoryRoot: string, result: unknown): string[] {
  const outputs = (Array.isArray(result) ? result : [result]) as Array<{ output?: Array<{ type?: string; modules?: Record<string, unknown> }> }>;
  const modules = outputs.flatMap(output => output.output ?? []).flatMap(item => item.type === 'chunk' ? Object.keys(item.modules ?? {}) : []);
  return [...new Set(modules.map(id => {
    const withoutVirtualPrefix = id.charCodeAt(0) === 0 ? id.slice(1) : id;
    const clean = withoutVirtualPrefix.split('?')[0]!;
    const value = isAbsolute(clean) ? relative(repositoryRoot, clean) : clean;
    return value.split('\\').join('/');
  }))].sort();
}

export function assertLiveModuleGraph(moduleGraph: readonly string[]): void {
  if (moduleGraph.some(isForbiddenLiveModule)) throw new Error('Live module graph contains Shadow, channel double, or Fixture dependency');
}

export type LiveProjectConfig = Readonly<{
  appid: string;
  compileType: 'miniprogram';
  libVersion: string;
  miniprogramRoot: './';
  projectname: string;
  setting: Readonly<{ es6: boolean; minified: boolean; urlCheck: true }>;
}>;

export function parseLiveProjectConfig(input: unknown): LiveProjectConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('project.live.config.json must be an object');
  const value = input as Record<string, unknown>;
  const setting = value.setting;
  if (!setting || typeof setting !== 'object' || Array.isArray(setting)) throw new Error('project.live.config.json requires setting');
  const settings = setting as Record<string, unknown>;
  if (typeof value.appid !== 'string' || value.appid.length === 0 || value.appid === 'touristappid') throw new Error('project.live.config.json requires a non-tourist appid');
  if (value.compileType !== 'miniprogram') throw new Error('project.live.config.json requires miniprogram compileType');
  if (typeof value.libVersion !== 'string' || value.libVersion.length === 0) throw new Error('project.live.config.json requires libVersion');
  if (value.miniprogramRoot !== './') throw new Error('project.live.config.json requires ./ miniprogramRoot');
  if (typeof value.projectname !== 'string' || value.projectname.length === 0) throw new Error('project.live.config.json requires projectname');
  if (settings.urlCheck !== true) throw new Error('project.live.config.json must enable urlCheck');
  if (typeof settings.es6 !== 'boolean' || typeof settings.minified !== 'boolean') throw new Error('project.live.config.json requires boolean es6 and minified settings');
  return {
    appid: value.appid,
    compileType: 'miniprogram',
    libVersion: value.libVersion,
    miniprogramRoot: './',
    projectname: value.projectname,
    setting: { es6: settings.es6, minified: settings.minified, urlCheck: true },
  };
}

async function hashes(root: string, paths: readonly string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha256(await readFile(resolve(root, path)))])));
}

function outsideRepository(repositoryRoot: string, path: string): boolean {
  const value = relative(repositoryRoot, path);
  return (value === '..' || value.startsWith(`..${sep}`)) && !isAbsolute(value);
}

export function parseBuildArgs(input: readonly string[]) {
  if (input.length === 0) return { controlled: false as const };
  if (input.length !== 4 || input[0] !== '--controlled-root' || input[2] !== '--controlled-output' || !input[1] || !input[3]) throw new Error('only --controlled-root <path> --controlled-output <path> is supported');
  return { controlled: true as const, configRoot: input[1], output: input[3] };
}

export async function buildLiveHost(options: Readonly<{ repositoryRoot: string; configRoot?: string; output?: string; controlledToolInput?: boolean }>) {
  const repositoryRoot = resolve(options.repositoryRoot);
  const configRoot = resolve(options.configRoot ?? repositoryRoot);
  const hostRoot = resolve(repositoryRoot, 'packages/e2e/host/weapp');
  const output = resolve(options.output ?? resolve(hostRoot, '.generated-live'));
  const controlledToolInput = options.controlledToolInput === true;
  if (controlledToolInput && (!outsideRepository(repositoryRoot, configRoot) || !outsideRepository(repositoryRoot, output))) throw new Error('controlled paths must be outside the repository');
  if (!controlledToolInput && (configRoot !== repositoryRoot || output !== resolve(hostRoot, '.generated-live'))) throw new Error('production Live paths are fixed');

  const projectPath = controlledToolInput
    ? resolve(configRoot, 'packages/e2e/host/weapp/project.live.config.json')
    : resolve(hostRoot, 'project.live.config.json');
  const envText = await readFile(resolve(configRoot, '.env.live'), 'utf8');
  const config = parseLiveConfig(parse(envText));
  const projectText = await readFile(projectPath, 'utf8');
  const project = parseLiveProjectConfig(JSON.parse(projectText));

  const viteResult = await viteBuild({
    configFile: resolve(hostRoot, 'vite.live.config.ts'),
    envDir: false,
    envPrefix: '__PAYMENT_LIVE_DISABLED__',
    define: {
      __PAYMENT_LIVE_CONFIG__: JSON.stringify(config),
      __PAYMENT_LIVE_APP_ID__: JSON.stringify(project.appid),
    },
    build: { outDir: output, emptyOutDir: true },
  });
  const moduleGraph = collectLiveModuleGraph(repositoryRoot, viteResult);
  assertLiveModuleGraph(moduleGraph);
  await mkdir(resolve(output, 'pages/live'), { recursive: true });
  const normalizedProject = `${JSON.stringify(project, null, 2)}\n`;
  await Promise.all([
    copyFile(resolve(hostRoot, 'app.live.js'), resolve(output, 'app.js')),
    copyFile(resolve(hostRoot, 'app.live.json'), resolve(output, 'app.json')),
    copyFile(resolve(hostRoot, 'pages/live/index.json'), resolve(output, 'pages/live/index.json')),
    copyFile(resolve(hostRoot, 'pages/live/index.wxml'), resolve(output, 'pages/live/index.wxml')),
    copyFile(resolve(hostRoot, 'pages/live/index.wxss'), resolve(output, 'pages/live/index.wxss')),
    writeFile(resolve(output, 'project.config.json'), normalizedProject),
  ]);
  const sdkManifest = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/payment-sdk/package.json'), 'utf8')) as { version: string };
  const protocolManifest = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/payment-protocol/package.json'), 'utf8')) as { version: string };
  const createContract = await readFile(resolve(repositoryRoot, 'docs/engineering/live-create-trade-contract.md'), 'utf8');
  const fingerprints = buildVerificationFingerprints(repositoryRoot);
  const manifest = {
    schemaVersion: 1,
    mode: 'live' as const,
    controlledToolInput,
    createTradeAdapter: 'protocol-generated' as const,
    createTradeBinding: { method: CreateTrade.meta.method, path: CreateTrade.meta.path },
    createContractDigest: sha256(createContract),
    configKeys: Object.keys(parse(envText)).sort(),
    configHash: sha256(JSON.stringify(config)),
    projectHash: sha256(normalizedProject),
    sourceDigest: fingerprints.sourceDigest,
    specDigest: fingerprints.specDigest,
    idlDigest: fingerprints.idlDigest,
    sourceFiles: await hashes(repositoryRoot, liveSourceFiles),
    moduleGraph,
    products: {
      sdk: { version: sdkManifest.version, files: await hashes(repositoryRoot, ['packages/payment-sdk/dist/index.js', 'packages/payment-sdk/dist/index.cjs']) },
      protocol: { version: protocolManifest.version, files: await hashes(repositoryRoot, ['packages/payment-protocol/dist/index.js', 'packages/payment-protocol/dist/index.cjs']) },
    },
    productionEntrypoints: ['@daqian/payment-sdk', '@daqian/payment-protocol'],
    outputFiles: await hashes(output, liveOutputFiles),
  };
  await writeFile(resolve(output, 'live-build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { output, manifest };
}

type CliIo = Readonly<{ cwd: () => string; log: (value: string) => void; error: (value: string) => void }>;
export const defaultCliIo: CliIo = { cwd: () => process.cwd(), log: value => console.log(value), error: value => console.error(value) };

export async function runBuildCli(input: readonly string[], io: CliIo = defaultCliIo): Promise<number> {
  try {
    const parsed = parseBuildArgs(input);
    const options = parsed.controlled
      ? { repositoryRoot: io.cwd(), configRoot: parsed.configRoot, output: parsed.output, controlledToolInput: true }
      : { repositoryRoot: io.cwd() };
    const result = await buildLiveHost(options);
    io.log(JSON.stringify({ status: 'built', output: result.output, controlledToolInput: result.manifest.controlledToolInput }));
    return 0;
  } catch (error) {
    io.error(JSON.stringify({ status: 'failed', issue: cliErrorMessage(error) }));
    return 1;
  }
}

/* v8 ignore next -- the one-line process dispatch is exercised by the CORE-022 subprocess case; runBuildCli is unit-covered. */
if (import.meta.url === `file://${process.argv[1]}`) void runBuildCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
