import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'dotenv';
import { CreateTrade } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { buildVerificationFingerprints } from '../../../../scripts/lib/fingerprints';
import { parseLiveConfig } from '../../host/weapp/live/config';
import { cliErrorMessage, isForbiddenLiveModule, liveOutputFiles, liveSourceFiles, parseLiveProjectConfig, sha256 } from './build';

type Manifest = Record<string, unknown> & {
  controlledToolInput?: boolean;
  createTradeAdapter?: string;
  createTradeBinding?: { method?: string; path?: string };
  createContractDigest?: string;
  configKeys?: string[];
  configHash?: string;
  projectHash?: string;
  sourceDigest?: string;
  specDigest?: string;
  idlDigest?: string;
  sourceFiles?: Record<string, string>;
  moduleGraph?: string[];
  products?: { sdk?: { version?: string; files?: Record<string, string> }; protocol?: { version?: string; files?: Record<string, string> } };
  outputFiles?: Record<string, string>;
};

async function hashFiles(root: string, paths: readonly string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha256(await readFile(resolve(root, path)))])));
}

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function parseCheckArgs(input: readonly string[]) {
  if (input.length === 0) return {};
  if (input.length !== 4 || input[0] !== '--controlled-root' || input[2] !== '--controlled-output' || !input[1] || !input[3]) throw new Error('only --controlled-root <path> --controlled-output <path> is supported');
  return { configRoot: input[1], output: input[3] };
}

export async function checkLiveHost(options: Readonly<{ repositoryRoot: string; configRoot?: string; output?: string; contractPath?: string }>) {
  const root = resolve(options.repositoryRoot);
  const configRoot = resolve(options.configRoot ?? root);
  const output = resolve(options.output ?? resolve(root, 'packages/e2e/host/weapp/.generated-live'));
  const controlledInvocation = options.configRoot !== undefined || options.output !== undefined;
  const issues: string[] = [];
  let manifest: Manifest = {};
  try {
    manifest = JSON.parse(await readFile(resolve(output, 'live-build-manifest.json'), 'utf8')) as Manifest;
    const schema = JSON.parse(await readFile(new URL('./build-manifest.schema.json', import.meta.url), 'utf8'));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    if (!validate(manifest)) issues.push(...validate.errors!.map(error => `build manifest ${error.instancePath || '/'} ${error.message}`));
  } catch { issues.push('live build manifest missing or invalid'); }

  let projectText = '';
  try {
    projectText = await readFile(resolve(output, 'project.config.json'), 'utf8');
    const project = parseLiveProjectConfig(JSON.parse(projectText));
    if (projectText !== `${JSON.stringify(project, null, 2)}\n`) issues.push('live project config contains unsupported or non-normalized fields');
  } catch { issues.push('live project config missing or invalid'); }

  let bundle = '';
  try { bundle = await readFile(resolve(output, 'pages/live/index.js'), 'utf8'); } catch { issues.push('live page bundle missing'); }
  if (/(?:@payment-test\/protocol|testing\/shadow|channel-double|fixtures\/)/i.test(bundle)) issues.push('live bundle contains Shadow, channel double, or Fixture dependency');
  if (!manifest.moduleGraph || manifest.moduleGraph.some(isForbiddenLiveModule)) issues.push('live module graph is missing or contains Shadow, channel double, or Fixture dependency');
  if (controlledInvocation || manifest.controlledToolInput === true) issues.push('controlled tool build cannot be used as Live evidence');
  if (manifest.createTradeAdapter === 'unavailable' || bundle.includes('PAYMENT_LIVE_CREATE_TRADE_UNAVAILABLE')) issues.push('real create-trade adapter is not implemented');
  if (manifest.createTradeAdapter !== 'protocol-generated'
    || manifest.createTradeBinding?.method !== CreateTrade.meta.method
    || manifest.createTradeBinding?.path !== CreateTrade.meta.path
    || CreateTrade.meta.method !== 'POST' || CreateTrade.meta.path !== '/api/base/trade/create') {
    issues.push('generated CreateTrade binding is missing or stale');
  }

  try {
    const contract = await readFile(options.contractPath ?? resolve(root, 'docs/engineering/live-create-trade-contract.md'), 'utf8');
    if (!/^Status:\s*ready\s*$/m.test(contract)) issues.push('real create-trade contract is not ready');
    if (manifest.createContractDigest !== sha256(contract)) issues.push('real create-trade contract digest is stale');
  } catch { issues.push('real create-trade contract is not registered'); }

  try {
    const values = parse(await readFile(resolve(configRoot, '.env.live'), 'utf8'));
    const config = parseLiveConfig(values);
    if (!equal(manifest.configKeys, Object.keys(values).sort())) issues.push('live config key list is stale');
    if (manifest.configHash !== sha256(JSON.stringify(config))) issues.push('live config digest is stale');
  } catch { issues.push('live config is missing or invalid'); }
  if (projectText && manifest.projectHash !== sha256(projectText)) issues.push('live project digest is stale');

  try {
    const fingerprints = buildVerificationFingerprints(root);
    if (manifest.sourceDigest !== fingerprints.sourceDigest) issues.push('live source digest is stale');
    if (manifest.specDigest !== fingerprints.specDigest) issues.push('live spec digest is stale');
    if (manifest.idlDigest !== fingerprints.idlDigest) issues.push('live IDL digest is stale');
  } catch { issues.push('live source, Spec, or IDL provenance is missing'); }

  try {
    const expectedSources = await hashFiles(root, liveSourceFiles);
    if (!equal(manifest.sourceFiles, expectedSources)) issues.push('live source graph is stale');
    const sdk = JSON.parse(await readFile(resolve(root, 'packages/payment-sdk/package.json'), 'utf8')) as { version: string };
    const protocol = JSON.parse(await readFile(resolve(root, 'packages/payment-protocol/package.json'), 'utf8')) as { version: string };
    const expectedProducts = {
      sdk: { version: sdk.version, files: await hashFiles(root, ['packages/payment-sdk/dist/index.js', 'packages/payment-sdk/dist/index.cjs']) },
      protocol: { version: protocol.version, files: await hashFiles(root, ['packages/payment-protocol/dist/index.js', 'packages/payment-protocol/dist/index.cjs']) },
    };
    if (!equal(manifest.products, expectedProducts)) issues.push('production SDK/protocol artifacts are stale');
  } catch { issues.push('production SDK/protocol artifacts are missing'); }

  try {
    const expectedOutput = await hashFiles(output, liveOutputFiles);
    if (!equal(manifest.outputFiles, expectedOutput)) issues.push('live output files are missing or stale');
  } catch { issues.push('live output files are missing or stale'); }
  return { issues };
}

type CheckCliIo = Readonly<{ cwd: () => string; log: (value: string) => void; error: (value: string) => void }>;
export const defaultCheckCliIo: CheckCliIo = { cwd: () => process.cwd(), log: value => console.log(value), error: value => console.error(value) };

export async function runCheckCli(input: readonly string[], io: CheckCliIo = defaultCheckCliIo): Promise<number> {
  try {
    const parsed = parseCheckArgs(input);
    const result = await checkLiveHost({ repositoryRoot: io.cwd(), ...parsed });
    io.log(JSON.stringify(result, null, 2));
    return Number(result.issues.length > 0);
  } catch (error) {
    io.error(JSON.stringify({ issues: [cliErrorMessage(error)] }));
    return 1;
  }
}

/* v8 ignore next -- the one-line process dispatch is exercised by the CORE-022 subprocess case; runCheckCli is unit-covered. */
if (import.meta.url === `file://${process.argv[1]}`) void runCheckCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
