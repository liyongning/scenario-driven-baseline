import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildVerificationFingerprints } from '../../../../scripts/lib/fingerprints';
import { cliErrorMessage } from './build';
import { checkLiveHost } from './check';
import { CreateTrade, QueryTrade } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';

export const requiredLiveCases = [
  ['LIVE-PAYSDK-001', 'android-sandbox'], ['LIVE-PAYSDK-001', 'android-prod'], ['LIVE-PAYSDK-001', 'ios-prod'],
  ['LIVE-PAYSDK-002', 'test-omitted'], ['LIVE-PAYSDK-002', 'test-sandbox'], ['LIVE-PAYSDK-002', 'test-prod'],
  ['LIVE-PAYSDK-002', 'prod-omitted'], ['LIVE-PAYSDK-002', 'prod-sandbox'], ['LIVE-PAYSDK-002', 'prod-prod'],
] as const;

export type LiveEvidenceExpectations = Readonly<{
  sourceDigest: string;
  specDigest: string;
  idlDigest: string;
  createContractDigest: string;
  sdkVersion: string;
  protocolVersion: string;
  bundleHash: string;
  configHash: string;
  buildManifestHash: string;
}>;

type EvidenceInput = {
  manifest: Record<string, unknown>;
  events: Array<{ sequence: number; atMs: number; executionId: string; correlationId: string; kind: string; reason?: string; snapshot?: { state?: string } }>;
  matrix: Array<{ id: string; caseKey: string; executionId: string; attachments: Array<{ path: string; sha256: string; mode: string; kind: string }> }>;
  review: { reviewer: string };
  exampleRecords?: Array<{ requestPaths: string[] }>;
};

function examplePathIssues(record: { requestPaths: string[] }): string[] {
  const paths = record.requestPaths.map(value => {
    try { return new URL(value, 'https://example.invalid').pathname; } catch { return value; }
  });
  const issues: string[] = [];
  if (paths.some(path => path === '/api/base/trade/pay')) issues.push('Live example record contains payment call');
  if (paths[0] !== CreateTrade.meta.path || paths.slice(1).some(path => path !== QueryTrade.meta.path)) issues.push('Live example record paths must follow create then query');
  return issues;
}

export async function checkExampleLiveRecord(record: unknown): Promise<string[]> {
  const schema = JSON.parse(await readFile(new URL('./evidence.schema.json', import.meta.url), 'utf8')) as { $defs: Record<string, unknown> };
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile({ $ref: '#/$defs/exampleRecord', $defs: schema.$defs });
  if (!validate(record)) return validate.errors!.map(error => `example schema ${error.instancePath || '/'} ${error.message}`);
  return examplePathIssues(record as { requestPaths: string[] });
}

type LiveExecution = { id: string; kind: string; xpayEnv: string; device?: { platform: string }; services: { serverEnv: string } };

async function currentExpectations(repositoryRoot: string, buildManifestPath?: string, contractPath?: string, configRoot?: string): Promise<{ expected?: LiveEvidenceExpectations; issues: string[] }> {
  const issues: string[] = [];
  try {
    const host = await checkLiveHost({ repositoryRoot, ...(buildManifestPath ? { output: dirname(buildManifestPath) } : {}), ...(contractPath ? { contractPath } : {}), ...(configRoot ? { configRoot } : {}) });
    issues.push(...host.issues.map(issue => `Live host: ${issue}`));
    const fingerprints = buildVerificationFingerprints(repositoryRoot);
    const contract = await readFile(contractPath ?? resolve(repositoryRoot, 'docs/engineering/live-create-trade-contract.md'), 'utf8');
    if (!/^Status:\s*ready\s*$/m.test(contract)) issues.push('real create-trade contract is not ready');
    const sdk = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/payment-sdk/package.json'), 'utf8')) as { version: string };
    const protocol = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/payment-protocol/package.json'), 'utf8')) as { version: string };
    const buildText = await readFile(buildManifestPath ?? resolve(repositoryRoot, 'packages/e2e/host/weapp/.generated-live/live-build-manifest.json'), 'utf8');
    const build = JSON.parse(buildText) as { controlledToolInput?: boolean; createTradeAdapter?: string; outputFiles?: Record<string, string>; configHash?: string };
    if (build.controlledToolInput === true) issues.push('controlled tool build cannot provide Live provenance');
    if (!build.createTradeAdapter || build.createTradeAdapter === 'unavailable') issues.push('real create-trade adapter is not implemented');
    const bundleHash = build.outputFiles?.['pages/live/index.js'];
    if (!bundleHash || !build.configHash) throw new Error('missing build hashes');
    return { expected: {
      sourceDigest: fingerprints.sourceDigest,
      specDigest: fingerprints.specDigest,
      idlDigest: fingerprints.idlDigest,
      createContractDigest: createHash('sha256').update(contract).digest('hex'),
      sdkVersion: sdk.version,
      protocolVersion: protocol.version,
      bundleHash,
      configHash: build.configHash,
      buildManifestHash: createHash('sha256').update(buildText).digest('hex'),
    }, issues };
  } catch { return { issues: [...issues, 'current Live provenance is missing or invalid'] }; }
}

export async function checkLiveEvidence(runDir: string, options: Readonly<{ schemaPath?: string; repositoryRoot?: string; buildManifestPath?: string; contractPath?: string; configRoot?: string; expected?: LiveEvidenceExpectations }> = {}) {
  const issues: string[] = [];
  const root = resolve(runDir);
  const load = async (name: string) => JSON.parse(await readFile(resolve(root, name), 'utf8')) as unknown;
  let input: EvidenceInput;
  try { input = { manifest: await load('manifest.json'), events: await load('events.json'), matrix: await load('matrix.json'), review: await load('review.json') } as EvidenceInput; }
  catch { return { issues: ['Live evidence files are missing or invalid'] }; }
  try { input.exampleRecords = await load('example-records.json') as Array<{ requestPaths: string[] }>; }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) return { issues: ['Live example evidence is invalid'] }; }

  const schemaPath = options.schemaPath ?? new URL('./evidence.schema.json', import.meta.url).pathname;
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(schema);
  if (!validate(input)) {
    issues.push(...validate.errors!.map(error => `schema ${error.instancePath || '/'} ${error.message}`));
    return { issues };
  }
  for (const record of input.exampleRecords ?? []) issues.push(...examplePathIssues(record));

  const provenance = options.expected ? { expected: options.expected, issues: [] } : await currentExpectations(resolve(options.repositoryRoot ?? process.cwd()), options.buildManifestPath, options.contractPath, options.configRoot);
  issues.push(...provenance.issues);
  for (const [key, expected] of Object.entries(provenance.expected ?? {})) {
    if (input.manifest[key] !== expected) issues.push(`stale Live provenance ${key}`);
  }

  const matrix = input.matrix;
  const executions = input.manifest.executions as LiveExecution[];
  const executionsById = new Map<string, LiveExecution>();
  for (const execution of executions) {
    if (executionsById.has(execution.id)) issues.push(`duplicate Live execution ${execution.id}`);
    else executionsById.set(execution.id, execution);
  }
  const eventCounts = new Map<string, number>();
  const eventTimes = new Map<string, number>();
  const correlations = new Map<string, Set<string>>();
  const eventKinds = new Map<string, Set<string>>();
  const successfulCorrelations = new Map<string, Set<string>>();
  for (const event of input.events) {
    const executionId = event.executionId;
    if (!executionsById.has(executionId)) issues.push(`event references unknown execution ${executionId}`);
    const expectedSequence = eventCounts.get(executionId) ?? 0;
    if (event.sequence !== expectedSequence) issues.push(`event sequence mismatch for ${executionId} at ${expectedSequence}`);
    eventCounts.set(executionId, expectedSequence + 1);
    const previousAt = eventTimes.get(executionId);
    if (previousAt !== undefined && event.atMs < previousAt) issues.push(`event time moved backwards for ${executionId} at ${expectedSequence}`);
    eventTimes.set(executionId, event.atMs);
    const known = correlations.get(executionId) ?? new Set<string>(); correlations.set(executionId, known);
    const kinds = eventKinds.get(executionId) ?? new Set<string>(); eventKinds.set(executionId, kinds); kinds.add(event.kind);
    if (event.kind === 'trade_created') {
      if (known.has(event.correlationId)) issues.push(`duplicate trade correlation for ${executionId}`);
      else known.add(event.correlationId);
    } else if (!known.has(event.correlationId)) issues.push(`event lacks prior trade creation for ${executionId}`);
    else if (event.kind === 'outcome' && event.reason === 'confirmed' && event.snapshot?.state === 'PAID') {
      const successful = successfulCorrelations.get(executionId) ?? new Set<string>(); successfulCorrelations.set(executionId, successful); successful.add(event.correlationId);
    }
  }
  const required = new Set(requiredLiveCases.map(([id, caseKey]) => `${id}/${caseKey}`));
  const seen = new Set<string>();
  const referencedExecutions = new Set<string>();
  for (const entry of matrix) {
    const key = `${entry.id}/${entry.caseKey}`;
    if (!required.has(key)) issues.push(`unexpected matrix case ${key}`);
    else if (seen.has(key)) issues.push(`duplicate matrix case ${key}`);
    else seen.add(key);
    const execution = executionsById.get(entry.executionId);
    if (!execution) { issues.push(`missing execution for ${key}`); continue; }
    if (referencedExecutions.has(entry.executionId)) { issues.push(`execution reused by multiple cases: ${entry.executionId}`); continue; }
    referencedExecutions.add(entry.executionId);
    if (entry.id === 'LIVE-PAYSDK-001') {
      const [platform, xpayEnv] = entry.caseKey.split('-');
      if (execution.kind !== 'device' || execution.device?.platform !== platform || execution.xpayEnv !== xpayEnv) issues.push(`execution does not match ${key}`);
    } else {
      const [serverEnv, xpayEnv] = entry.caseKey.split('-');
      if (execution.kind !== 'service' || execution.services?.serverEnv !== serverEnv || execution.xpayEnv !== xpayEnv) issues.push(`execution does not match ${key}`);
    }
  }
  for (const key of required) if (!seen.has(key)) issues.push(`missing matrix case ${key}`);
  for (const id of executionsById.keys()) if (!referencedExecutions.has(id)) issues.push(`unreferenced Live execution ${id}`);
  for (const entry of matrix) if (entry.id === 'LIVE-PAYSDK-001' && entry.executionId) {
    const kinds = eventKinds.get(entry.executionId);
    if (!kinds?.has('trade_created') || !kinds.has('outcome') || (successfulCorrelations.get(entry.executionId)?.size ?? 0) === 0) issues.push(`device execution lacks confirmed PAID chain: ${entry.executionId}`);
  }

  const realRoot = await realpath(root);
  for (const entry of matrix) {
    const key = `${entry.id}/${entry.caseKey}`;
    const requiredKind = entry.id === 'LIVE-PAYSDK-001' ? 'live-host-record' : 'live-service-record';
    if (!entry.attachments.some(attachment => attachment.mode === 'live' && attachment.kind === requiredKind)) issues.push(`missing ${requiredKind} for ${key}`);
    for (const attachment of entry.attachments) {
    if (isAbsolute(attachment.path)) { issues.push(`invalid attachment for ${key}`); continue; }
    const target = resolve(root, attachment.path);
    const local = relative(root, target);
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) { issues.push(`invalid attachment for ${key}`); continue; }
    try {
      const actual = await realpath(target);
      const fromRealRoot = relative(realRoot, actual);
      if (fromRealRoot.startsWith('..') || isAbsolute(fromRealRoot)) { issues.push(`invalid attachment for ${key}`); continue; }
      const content = await readFile(actual);
      if (createHash('sha256').update(content).digest('hex') !== attachment.sha256) issues.push(`attachment digest mismatch ${attachment.path}`);
      if (attachment.kind === 'live-host-record' || attachment.kind === 'live-service-record') {
        try {
          const record = JSON.parse(content.toString()) as unknown;
          if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('invalid record');
          const value = record as { mode?: unknown; id?: unknown; caseKey?: unknown; executionId?: unknown };
          const keys = Object.keys(value).sort();
          if (JSON.stringify(keys) !== JSON.stringify(['caseKey', 'executionId', 'id', 'mode'])) issues.push(`recognized Live record contains unsupported fields: ${attachment.path}`);
          if (value.mode !== 'live') issues.push(`Shadow evidence cannot satisfy Live matrix: ${attachment.path}`);
          if (value.id !== entry.id || value.caseKey !== entry.caseKey || value.executionId !== entry.executionId) issues.push(`attachment case does not match ${key}: ${attachment.path}`);
        } catch { issues.push(`recognized Live record is invalid: ${attachment.path}`); }
      }
    } catch { issues.push(`missing attachment ${attachment.path}`); }
    }
  }
  const reviewer = (input.manifest.authorization as { reviewer?: unknown } | undefined)?.reviewer;
  if (input.review.reviewer !== reviewer) issues.push('reviewer does not match authorization');
  return { issues };
}

export function parseEvidenceArgs(input: readonly string[]): string {
  if (input.length !== 2 || input[0] !== '--run-dir' || !input[1]) throw new Error('--run-dir is required');
  return resolve(input[1]);
}

type EvidenceCliIo = Readonly<{ log: (value: string) => void; error: (value: string) => void }>;
export const defaultEvidenceCliIo: EvidenceCliIo = { log: value => console.log(value), error: value => console.error(value) };

export async function runEvidenceCli(input: readonly string[], io: EvidenceCliIo = defaultEvidenceCliIo, checker = checkLiveEvidence): Promise<number> {
  try {
    const result = await checker(parseEvidenceArgs(input));
    io.log(JSON.stringify(result, null, 2));
    return Number(result.issues.length > 0);
  } catch (error) {
    io.error(JSON.stringify({ issues: [cliErrorMessage(error)] }));
    return 1;
  }
}

/* v8 ignore next -- the one-line process dispatch is exercised by the CORE-022 subprocess case; runEvidenceCli is unit-covered. */
if (import.meta.url === `file://${process.argv[1]}`) void runEvidenceCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
