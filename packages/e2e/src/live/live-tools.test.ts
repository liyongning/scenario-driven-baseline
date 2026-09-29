import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { assertLiveModuleGraph, buildLiveHost, cliErrorMessage, collectLiveModuleGraph, defaultCliIo, isForbiddenLiveModule, parseBuildArgs, parseLiveProjectConfig, runBuildCli } from './build';
import { checkLiveHost, defaultCheckCliIo, parseCheckArgs, runCheckCli } from './check';
import { checkExampleLiveRecord, checkLiveEvidence, defaultEvidenceCliIo, parseEvidenceArgs, requiredLiveCases, runEvidenceCli, type LiveEvidenceExpectations } from './check-evidence';

const roots: string[] = [];
const temp = (prefix: string) => { const path = mkdtempSync(join(tmpdir(), prefix)); roots.push(path); return path; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const validProject = { appid: 'wx-live-test', compileType: 'miniprogram', libVersion: '3.10.3', miniprogramRoot: './', projectname: 'payment-sdk-live-host', setting: { es6: true, minified: false, urlCheck: true } } as const;

function config(root: string, project: unknown = { ...validProject, accessToken: 'must-not-be-copied' }) {
  writeFileSync(join(root, '.env.live'), 'PAYMENT_LIVE_GATEWAY_BASE_URL=https://gateway.example\nPAYMENT_LIVE_CREATE_TRADE_URL=https://trade.example/api/base/trade/create\nPAYMENT_LIVE_PRODUCT_ID=product\nPAYMENT_LIVE_SERVER_ENV=test\n');
  const host = join(root, 'packages/e2e/host/weapp'); mkdirSync(host, { recursive: true });
  writeFileSync(join(host, 'project.live.config.json'), JSON.stringify(project));
}

test('buildLiveHost builds an isolated controlled bundle and validates fixed boundaries', async () => {
  const root = temp('live-tools-build-'); const output = join(root, 'out'); config(root);
  await expect(buildLiveHost({ repositoryRoot: temp('live-tools-defaults-') })).rejects.toThrow();
  await expect(buildLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output })).rejects.toThrow('production Live paths are fixed');
  await expect(buildLiveHost({ repositoryRoot: process.cwd(), configRoot: process.cwd(), output, controlledToolInput: true })).rejects.toThrow('outside the repository');
  await expect(buildLiveHost({ repositoryRoot: process.cwd(), configRoot: `${process.cwd()}/..live-config`, output: `${process.cwd()}/..live-output`, controlledToolInput: true })).rejects.toThrow('outside the repository');
  const result = await buildLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output, controlledToolInput: true });
  expect(result.manifest).toMatchObject({ mode: 'live', controlledToolInput: true, createTradeAdapter: 'protocol-generated', createTradeBinding: { method: 'POST', path: '/api/base/trade/create' } });
  expect(result.manifest.moduleGraph.length).toBeGreaterThan(0);
  expect(Object.keys(result.manifest.outputFiles)).toHaveLength(11);
  const livePage = readFileSync(join(output, 'pages/live/index.wxml'), 'utf8');
  expect(livePage).toContain('发起真实支付');
  expect(livePage).toContain('<view class="field-label">bizType</view>');
  expect(livePage).toContain('id="live-token-input"');
  expect(livePage).toContain('id="live-token-input" password maxlength="-1"');
  expect(livePage).toContain('data-field="bizSnapshot" bindinput="onItemField"');
  expect(livePage).toContain('id="live-create-trade"');
  expect(readFileSync(join(output, 'project.config.json'), 'utf8')).not.toContain('accessToken');
  const tourist = temp('live-tools-tourist-'); config(tourist, { ...validProject, appid: 'touristappid' });
  await expect(buildLiveHost({ repositoryRoot: process.cwd(), configRoot: tourist, output: join(tourist, 'out'), controlledToolInput: true })).rejects.toThrow('non-tourist');
  const unchecked = temp('live-tools-unchecked-'); config(unchecked, { ...validProject, appid: 'wx-live', setting: { ...validProject.setting, urlCheck: false } });
  await expect(buildLiveHost({ repositoryRoot: process.cwd(), configRoot: unchecked, output: join(unchecked, 'out'), controlledToolInput: true })).rejects.toThrow('enable urlCheck');
  const missingApp = temp('live-tools-missing-app-'); config(missingApp, { ...validProject, appid: undefined });
  await expect(buildLiveHost({ repositoryRoot: process.cwd(), configRoot: missingApp, output: join(missingApp, 'out'), controlledToolInput: true })).rejects.toThrow('non-tourist');
});

test('checkLiveHost verifies current hashes and rejects controlled or tampered output', async () => {
  const root = temp('live-tools-check-'); const output = join(root, 'out'); config(root);
  await buildLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output, controlledToolInput: true });
  expect((await checkLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output })).issues).toEqual([
    'controlled tool build cannot be used as Live evidence',
  ]);
  const projectPath = join(output, 'project.config.json'); const normalizedProject = readFileSync(projectPath, 'utf8'); writeFileSync(projectPath, JSON.stringify(validProject));
  expect((await checkLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output })).issues).toContain('live project config contains unsupported or non-normalized fields');
  writeFileSync(projectPath, normalizedProject);
  const manifestPath = join(output, 'live-build-manifest.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const bundlePath = join(output, 'pages/live/index.js'); const originalBundle = readFileSync(bundlePath, 'utf8');
  manifest.createTradeAdapter = 'unavailable'; writeFileSync(manifestPath, JSON.stringify(manifest));
  expect((await checkLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output })).issues).toContain('real create-trade adapter is not implemented');
  manifest.createTradeAdapter = 'protocol-generated'; writeFileSync(manifestPath, JSON.stringify(manifest)); writeFileSync(bundlePath, `${originalBundle}\n/* PAYMENT_LIVE_CREATE_TRADE_UNAVAILABLE */`);
  expect((await checkLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output })).issues).toContain('real create-trade adapter is not implemented');
  writeFileSync(bundlePath, originalBundle); (manifest.createTradeBinding as { path: string }).path = '/wrong'; writeFileSync(manifestPath, JSON.stringify(manifest));
  expect((await checkLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output })).issues).toContain('generated CreateTrade binding is missing or stale');
  const exampleBundlePath = join(output, 'pages/live/example/index.js'); const originalExampleBundle = readFileSync(exampleBundlePath, 'utf8');
  writeFileSync(exampleBundlePath, `${originalExampleBundle}\n/* testing/shadow createPaymentClient */`);
  expect((await checkLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output })).issues).toEqual(expect.arrayContaining(['live example bundle contains Shadow, channel double, or Fixture dependency', 'live example bundle contains payment invocation']));
  writeFileSync(exampleBundlePath, originalExampleBundle);
  (manifest.createTradeBinding as { path: string }).path = '/api/base/trade/create';
  const readyContract = join(root, 'ready-contract.md'); writeFileSync(readyContract, 'Status: ready\n'); manifest.createContractDigest = h('Status: ready\n'); writeFileSync(manifestPath, JSON.stringify(manifest));
  expect((await checkLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output, contractPath: readyContract })).issues).not.toContain('real create-trade contract is not ready');
  writeFileSync(projectPath, JSON.stringify({ appid: 'touristappid', setting: { urlCheck: false } }));
  writeFileSync(bundlePath, `${readFileSync(bundlePath, 'utf8')}\n/* testing/shadow channel-double fixtures/ */`);
  manifest.mode = 'shadow'; manifest.createContractDigest = '0'.repeat(64); manifest.configKeys = []; manifest.configHash = '0'.repeat(64); manifest.sourceDigest = '0'.repeat(64); manifest.specDigest = '0'.repeat(64); manifest.idlDigest = '0'.repeat(64); manifest.sourceFiles = {}; (manifest.products as { sdk: { version: string } }).sdk.version = 'stale'; manifest.extra = 'credential'; writeFileSync(manifestPath, JSON.stringify(manifest));
  expect((await checkLiveHost({ repositoryRoot: process.cwd(), configRoot: root, output })).issues).toEqual(expect.arrayContaining([
    'live project config missing or invalid',
    'live bundle contains Shadow, channel double, or Fixture dependency', 'live project digest is stale',
    'real create-trade contract digest is stale', 'live config key list is stale', 'live config digest is stale', 'live source digest is stale', 'live spec digest is stale', 'live IDL digest is stale', 'live source graph is stale',
    'production SDK/protocol artifacts are stale', 'live output files are missing or stale',
  ]));
  const empty = temp('live-tools-empty-');
  expect((await checkLiveHost({ repositoryRoot: empty })).issues).toEqual(expect.arrayContaining(['live build manifest missing or invalid', 'live project config missing or invalid', 'live page bundle missing', 'real create-trade contract is not registered', 'live config is missing or invalid']));
});

test('Live CLI glue and module/project classifiers enforce their boundaries', async () => {
  expect(parseBuildArgs([])).toEqual({ controlled: false });
  expect(parseCheckArgs([])).toEqual({});
  expect(() => parseBuildArgs(['--bad'])).toThrow('only --controlled-root');
  expect(() => parseCheckArgs(['--bad'])).toThrow('only --controlled-root');
  expect(cliErrorMessage('failure')).toBe('unknown error');
  expect(cliErrorMessage(new Error('failure'))).toBe('failure');
  expect(parseLiveProjectConfig({ ...validProject, ignored: 'local-only' })).toEqual(validProject);
  expect(() => parseLiveProjectConfig(null)).toThrow('must be an object');
  expect(() => parseLiveProjectConfig([])).toThrow('must be an object');
  expect(() => parseLiveProjectConfig({ ...validProject, setting: null })).toThrow('requires setting');
  expect(() => parseLiveProjectConfig({ ...validProject, setting: [] })).toThrow('requires setting');
  expect(() => parseLiveProjectConfig({ ...validProject, appid: 1 })).toThrow('non-tourist');
  expect(() => parseLiveProjectConfig({ ...validProject, appid: '' })).toThrow('non-tourist');
  expect(() => parseLiveProjectConfig({ ...validProject, compileType: 'plugin' })).toThrow('compileType');
  expect(() => parseLiveProjectConfig({ ...validProject, libVersion: '' })).toThrow('libVersion');
  expect(() => parseLiveProjectConfig({ ...validProject, libVersion: 1 })).toThrow('libVersion');
  expect(() => parseLiveProjectConfig({ ...validProject, miniprogramRoot: 'src' })).toThrow('miniprogramRoot');
  expect(() => parseLiveProjectConfig({ ...validProject, projectname: '' })).toThrow('projectname');
  expect(() => parseLiveProjectConfig({ ...validProject, projectname: 1 })).toThrow('projectname');
  expect(() => parseLiveProjectConfig({ ...validProject, setting: { ...validProject.setting, es6: 'yes' } })).toThrow('boolean es6');
  expect(() => parseLiveProjectConfig({ ...validProject, setting: { ...validProject.setting, minified: 'no' } })).toThrow('boolean es6');
  expect(isForbiddenLiveModule('/repo/packages/payment-protocol/testing/shadow/index.ts')).toBe(true);
  expect(isForbiddenLiveModule('/repo/packages/e2e/src/live/build.ts')).toBe(false);
  expect(collectLiveModuleGraph('/repo', [{ output: [{ type: 'asset' }, { type: 'chunk', modules: { '/repo/live.ts?x': {}, '\u0000virtual': {} } }] }])).toEqual(['live.ts', 'virtual']);
  expect(collectLiveModuleGraph('/repo', {})).toEqual([]);
  expect(collectLiveModuleGraph('/repo', { output: [{ type: 'chunk' }] })).toEqual([]);
  expect(() => assertLiveModuleGraph(['/repo/testing/shadow/index.ts'])).toThrow('Live module graph');
  expect(() => assertLiveModuleGraph(['/repo/live.ts'])).not.toThrow();
  const root = temp('live-tools-cli-'); const output = join(root, 'out'); config(root);
  const logs: string[] = []; const errors: string[] = []; const io = { cwd: () => process.cwd(), log: (value: string) => logs.push(value), error: (value: string) => errors.push(value) };
  const missingConfigIo = { ...io, cwd: () => temp('live-tools-missing-config-') };
  expect(await runBuildCli(['--controlled-root', root, '--controlled-output', output], io)).toBe(0);
  expect(await runCheckCli(['--controlled-root', root, '--controlled-output', output], io)).toBe(1);
  expect(await runBuildCli(['--bad'], io)).toBe(1);
  expect(await runCheckCli(['--bad'], io)).toBe(1);
  expect(await runBuildCli([], missingConfigIo)).toBe(1);
  expect(await runCheckCli([], missingConfigIo)).toBe(1);
  expect(logs.join('\n')).toContain('controlledToolInput');
  expect(errors.join('\n')).toContain('only --controlled-root');
  const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined); const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  defaultCliIo.log('x'); defaultCliIo.error('x'); defaultCheckCliIo.log('x'); defaultCheckCliIo.error('x'); defaultEvidenceCliIo.log('x'); defaultEvidenceCliIo.error('x');
  expect(defaultCliIo.cwd()).toBe(process.cwd()); expect(defaultCheckCliIo.cwd()).toBe(process.cwd());
  expect(await runBuildCli(['--bad'])).toBe(1); expect(await runCheckCli(['--bad'])).toBe(1); expect(await runEvidenceCli([])).toBe(1);
  expect(consoleLog).toHaveBeenCalled(); expect(consoleError).toHaveBeenCalled(); consoleLog.mockRestore(); consoleError.mockRestore();
});

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const h = (value: string) => hash(value);
const expected: LiveEvidenceExpectations = { sourceDigest: h('source'), specDigest: h('spec'), idlDigest: h('idl'), createContractDigest: h('contract'), sdkVersion: '0.1.0', protocolVersion: '0.1.0', bundleHash: h('bundle'), configHash: h('config'), buildManifestHash: h('build-manifest') };

test('example record checker accepts created and observed paths and rejects invalid or payment paths', async () => {
  const record = { id: 'LIVE-TEMPLATE-EXAMPLE-001', kind: 'live-example-record', resourceRef: { id: 'r', externalRef: 'e' }, outcome: { end: 'completed', lastState: 'completed' }, requestPaths: ['/api/base/trade/create', '/api/base/trade/query'] };
  expect(await checkExampleLiveRecord(record)).toEqual([]);
  expect(await checkExampleLiveRecord({ ...record, requestPaths: ['https://example.invalid/api/base/trade/create', 'https://example.invalid/api/base/trade/query'] })).toEqual([]);
  expect((await checkExampleLiveRecord({ ...record, requestPaths: ['http://[', '/api/base/trade/query'] })).join(' ')).toContain('create then query');
  expect((await checkExampleLiveRecord({ ...record, requestPaths: [...record.requestPaths, '/api/base/trade/pay'] })).join(' ')).toContain('payment call');
  expect((await checkExampleLiveRecord({ ...record, extra: 'secret' })).join(' ')).toContain('additional properties');
});
type MatrixEntry = { id: string; caseKey: string; status: string; executionId: string; attachments: Array<{ path: string; sha256: string; mode: string; kind: string }> };

function validEvidence(root: string) {
  const services = (serverEnv: string) => ({ serverEnv, gatewayBuild: 'g', tradeBuild: 't', payBuild: 'p' });
  const executions = requiredLiveCases.map(([id, caseKey], index) => {
    const [first, xpayEnv] = caseKey.split('-');
    return id === 'LIVE-PAYSDK-001'
      ? { id: `execution-${index}`, kind: 'device', executedAt: '2026-09-10T00:00:00Z', xpayEnv, device: { platform: first, model: 'device', osVersion: '1', wechatVersion: '1', baseLibraryVersion: '1' }, services: services(first === 'android' && xpayEnv === 'sandbox' ? 'test' : 'prod') }
      : { id: `execution-${index}`, kind: 'service', executedAt: '2026-09-10T00:00:00Z', xpayEnv, services: services(first!) };
  });
  const matrix = requiredLiveCases.map(([id, caseKey], index) => {
    const path = `record-${index}.json`; const content = JSON.stringify({ mode: 'live', id, caseKey, executionId: `execution-${index}` }); writeFileSync(join(root, path), content);
    return { id, caseKey, status: 'passed', executionId: `execution-${index}`, attachments: [{ path, sha256: h(content), mode: 'live', kind: id === 'LIVE-PAYSDK-001' ? 'live-host-record' : 'live-service-record' }] };
  });
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ mode: 'live', runId: 'run', executedAt: '2026-09-10T00:00:00Z', ...expected, executions, authorization: { scope: 'approved test', reviewer: 'reviewer' } }));
  writeFileSync(join(root, 'events.json'), JSON.stringify([0, 1, 2].flatMap(index => [{ sequence: 0, atMs: 0, executionId: `execution-${index}`, correlationId: `execution-${index}-trade-1`, kind: 'trade_created' }, { sequence: 1, atMs: 1, executionId: `execution-${index}`, correlationId: `execution-${index}-trade-1`, kind: 'outcome', attemptId: `a-${index}`, reason: 'confirmed', channelSignal: 'success_hint', snapshot: { state: 'PAID', source: 'server' } }])));
  writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  writeFileSync(join(root, 'review.json'), JSON.stringify({ verdict: 'PASS', reviewer: 'reviewer' }));
  return { proof: matrix[0]!.attachments[0]!.path, sha256: matrix[0]!.attachments[0]!.sha256 };
}

test('checkLiveEvidence validates provenance, event shape, matrix uniqueness, and contained attachments', async () => {
  const root = temp('live-tools-evidence-'); const { proof, sha256 } = validEvidence(root);
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual([]);
  const exampleRecord = { id: 'LIVE-TEMPLATE-EXAMPLE-001', kind: 'live-example-record', resourceRef: { id: 'resource', externalRef: 'reference' }, outcome: { end: 'completed', lastState: 'completed' }, requestPaths: ['/api/base/trade/create', '/api/base/trade/query'] };
  writeFileSync(join(root, 'example-records.json'), JSON.stringify([exampleRecord]));
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual([]);
  writeFileSync(join(root, 'example-records.json'), JSON.stringify([{ ...exampleRecord, requestPaths: [...exampleRecord.requestPaths, '/api/base/trade/pay'] }]));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('Live example record contains payment call');
  writeFileSync(join(root, 'example-records.json'), '{}');
  expect((await checkLiveEvidence(root, { expected })).issues.join(' ')).toContain('schema /exampleRecords');
  writeFileSync(join(root, 'example-records.json'), '{');
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual(['Live example evidence is invalid']);
  rmSync(join(root, 'example-records.json'));
  expect(parseEvidenceArgs(['--run-dir', root])).toBe(root);
  expect(() => parseEvidenceArgs([])).toThrow('--run-dir is required');
  const cliLogs: string[] = []; const cliErrors: string[] = []; const cliIo = { log: (value: string) => cliLogs.push(value), error: (value: string) => cliErrors.push(value) };
  expect(await runEvidenceCli(['--run-dir', root], cliIo, async () => ({ issues: [] }))).toBe(0);
  expect(await runEvidenceCli(['--run-dir', root], cliIo, async () => ({ issues: ['blocked'] }))).toBe(1);
  expect(await runEvidenceCli(['--run-dir', root], cliIo)).toBe(1);
  expect(await runEvidenceCli([], cliIo)).toBe(1);
  expect(cliLogs.join('\n')).toContain('blocked'); expect(cliErrors.join('\n')).toContain('--run-dir is required');
  expect((await checkLiveEvidence(root, { repositoryRoot: root })).issues).toContain('current Live provenance is missing or invalid');
  const buildManifestPath = join(root, 'build-manifest.json');
  writeFileSync(buildManifestPath, JSON.stringify({ controlledToolInput: true, createTradeAdapter: 'unavailable', outputFiles: { 'pages/live/index.js': h('current-bundle') }, configHash: h('current-config') }));
  expect((await checkLiveEvidence(root, { repositoryRoot: process.cwd(), buildManifestPath })).issues).toEqual(expect.arrayContaining(['controlled tool build cannot provide Live provenance', 'real create-trade adapter is not implemented']));
  const pendingContract = join(root, 'pending.md'); writeFileSync(pendingContract, 'Status: pending\n');
  expect((await checkLiveEvidence(root, { repositoryRoot: process.cwd(), buildManifestPath, contractPath: pendingContract })).issues).toEqual(expect.arrayContaining(['real create-trade contract is not ready']));
  const readyContract = join(root, 'ready.md'); writeFileSync(readyContract, 'Status: ready\n');
  writeFileSync(buildManifestPath, JSON.stringify({ controlledToolInput: false, createTradeAdapter: 'real', outputFiles: { 'pages/live/index.js': h('current-bundle') }, configHash: h('current-config') }));
  expect((await checkLiveEvidence(root, { repositoryRoot: process.cwd(), buildManifestPath, contractPath: readyContract, configRoot: process.cwd() })).issues).not.toContain('real create-trade contract is not ready');
  writeFileSync(buildManifestPath, JSON.stringify({ controlledToolInput: false, outputFiles: {}, configHash: '' }));
  expect((await checkLiveEvidence(root, { repositoryRoot: process.cwd(), buildManifestPath, contractPath: readyContract })).issues).toEqual(expect.arrayContaining(['real create-trade adapter is not implemented', 'current Live provenance is missing or invalid']));
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  manifest.sourceDigest = h('stale'); manifest.buildManifestHash = h('stale-build'); writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual(expect.arrayContaining(['stale Live provenance sourceDigest', 'stale Live provenance buildManifestHash']));
  validEvidence(root); const mismatchedManifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as { executions: Array<{ device?: { platform: string } }> }; mismatchedManifest.executions[0]!.device!.platform = 'ios'; writeFileSync(join(root, 'manifest.json'), JSON.stringify(mismatchedManifest));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('execution does not match LIVE-PAYSDK-001/android-sandbox');
  validEvidence(root); const reusedMatrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[]; reusedMatrix[1]!.executionId = reusedMatrix[0]!.executionId; writeFileSync(join(root, 'matrix.json'), JSON.stringify(reusedMatrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('execution reused by multiple cases: execution-0');
  validEvidence(root); const missingExecutionMatrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[]; missingExecutionMatrix[0]!.executionId = 'missing'; writeFileSync(join(root, 'matrix.json'), JSON.stringify(missingExecutionMatrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('missing execution for LIVE-PAYSDK-001/android-sandbox');
  validEvidence(root); const extraManifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as { executions: unknown[] }; extraManifest.executions.push({ ...(extraManifest.executions[0] as object), id: 'unused' }); writeFileSync(join(root, 'manifest.json'), JSON.stringify(extraManifest));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('unreferenced Live execution unused');
  validEvidence(root); const duplicateManifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as { executions: Array<{ id: string }> }; duplicateManifest.executions[1]!.id = duplicateManifest.executions[0]!.id; writeFileSync(join(root, 'manifest.json'), JSON.stringify(duplicateManifest));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('duplicate Live execution execution-0');
  validEvidence(root); const serviceManifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as { executions: Array<{ services: { serverEnv: string } }> }; serviceManifest.executions[3]!.services.serverEnv = 'prod'; writeFileSync(join(root, 'manifest.json'), JSON.stringify(serviceManifest));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('execution does not match LIVE-PAYSDK-002/test-omitted');
  validEvidence(root); writeFileSync(join(root, 'events.json'), JSON.stringify([{ sequence: 1, atMs: 2, executionId: 'execution-0', correlationId: 'missing', kind: 'outcome', attemptId: 'a', reason: 'error', channelSignal: 'unknown', snapshot: { state: 'UNKNOWN', source: 'server' } }, { sequence: 1, atMs: 1, executionId: 'execution-0', correlationId: 'missing', kind: 'query', snapshot: { state: 'PAID', source: 'server' } }]));
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual(expect.arrayContaining(['event sequence mismatch for execution-0 at 0', 'event time moved backwards for execution-0 at 1', 'event lacks prior trade creation for execution-0']));
  validEvidence(root); const duplicateEvents = JSON.parse(readFileSync(join(root, 'events.json'), 'utf8')) as Array<Record<string, unknown>>; duplicateEvents.push({ sequence: 2, atMs: 2, executionId: 'execution-0', correlationId: 'execution-0-trade-1', kind: 'trade_created' }); duplicateEvents.push({ sequence: 0, atMs: 0, executionId: 'unknown', correlationId: 'unknown-trade-1', kind: 'trade_created' }); writeFileSync(join(root, 'events.json'), JSON.stringify(duplicateEvents));
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual(expect.arrayContaining(['duplicate trade correlation for execution-0', 'event references unknown execution unknown']));
  validEvidence(root); const unsuccessfulEvents = JSON.parse(readFileSync(join(root, 'events.json'), 'utf8')) as Array<{ reason?: string; snapshot?: { state: string } }>; unsuccessfulEvents[1]!.reason = 'error'; unsuccessfulEvents[1]!.snapshot!.state = 'UNKNOWN'; writeFileSync(join(root, 'events.json'), JSON.stringify(unsuccessfulEvents));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('device execution lacks confirmed PAID chain: execution-0');
  validEvidence(root); let matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[];
  matrix[1] = structuredClone(matrix[0]!); writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual(expect.arrayContaining(['duplicate matrix case LIVE-PAYSDK-001/android-sandbox', 'missing matrix case LIVE-PAYSDK-001/android-prod']));
  validEvidence(root); matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[]; matrix[0]!.caseKey = 'unexpected'; matrix[0]!.attachments[0]!.path = '/tmp/outside'; writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual(expect.arrayContaining(['unexpected matrix case LIVE-PAYSDK-001/unexpected', 'invalid attachment for LIVE-PAYSDK-001/unexpected']));
  validEvidence(root); writeFileSync(join(root, proof), 'changed'); expect((await checkLiveEvidence(root, { expected })).issues).toContain(`attachment digest mismatch ${proof}`);
  validEvidence(root); matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[]; writeFileSync(join(root, proof), 'not-json'); matrix[0]!.attachments[0]!.sha256 = h('not-json'); writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain(`recognized Live record is invalid: ${proof}`);
  validEvidence(root); matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[]; writeFileSync(join(root, proof), '[]'); matrix[0]!.attachments[0]!.sha256 = h('[]'); writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain(`recognized Live record is invalid: ${proof}`);
  validEvidence(root); matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[]; const sensitiveRecord = JSON.stringify({ mode: 'live', id: matrix[0]!.id, caseKey: matrix[0]!.caseKey, executionId: matrix[0]!.executionId, accessToken: 'secret', signData: 'secret' }); writeFileSync(join(root, proof), sensitiveRecord); matrix[0]!.attachments[0]!.sha256 = h(sensitiveRecord); writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain(`recognized Live record contains unsupported fields: ${proof}`);
  validEvidence(root); matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[]; const visual = 'visual.bin'; writeFileSync(join(root, visual), 'visual'); matrix[0]!.attachments.push({ path: visual, sha256: h('visual'), mode: 'live', kind: 'visual-proof' }); writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toEqual([]);
  matrix[0]!.attachments = [{ path: visual, sha256: h('visual'), mode: 'live', kind: 'visual-proof' }]; writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('missing live-host-record for LIVE-PAYSDK-001/android-sandbox');
  validEvidence(root); matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[];
  const shadow = matrix[0]!.attachments[0]!.path; const shadowContent = JSON.stringify({ mode: 'shadow', id: matrix[0]!.id, caseKey: matrix[0]!.caseKey, executionId: matrix[0]!.executionId }); writeFileSync(join(root, shadow), shadowContent); matrix[0]!.attachments[0]!.sha256 = h(shadowContent); writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain(`Shadow evidence cannot satisfy Live matrix: ${shadow}`);
  validEvidence(root); matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[];
  const outside = temp('live-tools-outside-'); writeFileSync(join(outside, 'proof.txt'), 'proof'); const link = join(root, 'linked-proof.txt'); symlinkSync(join(outside, 'proof.txt'), link); matrix[0]!.attachments[0] = { ...matrix[0]!.attachments[0]!, path: 'linked-proof.txt', sha256 }; writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('invalid attachment for LIVE-PAYSDK-001/android-sandbox');
  matrix[0]!.attachments[0] = { ...matrix[0]!.attachments[0]!, path: 'missing.txt', sha256 }; writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('missing attachment missing.txt');
  matrix[0]!.attachments[0] = { ...matrix[0]!.attachments[0]!, path: '../outside.txt', sha256 }; writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  expect((await checkLiveEvidence(root, { expected })).issues).toContain('invalid attachment for LIVE-PAYSDK-001/android-sandbox');
  validEvidence(root); matrix = JSON.parse(readFileSync(join(root, 'matrix.json'), 'utf8')) as MatrixEntry[];
  const withoutAttachments = matrix.map(entry => entry.caseKey === 'android-sandbox' ? { ...entry, attachments: undefined } : entry); writeFileSync(join(root, 'matrix.json'), JSON.stringify(withoutAttachments));
  expect((await checkLiveEvidence(root, { expected })).issues).not.toContain('missing matrix case LIVE-PAYSDK-001/android-sandbox');
  writeFileSync(join(root, 'matrix.json'), '{}'); expect((await checkLiveEvidence(root, { expected })).issues.join('\n')).toContain('schema /matrix');
  validEvidence(root); writeFileSync(join(root, 'review.json'), JSON.stringify({ verdict: 'PASS', reviewer: 'different' })); expect((await checkLiveEvidence(root, { expected })).issues).toContain('reviewer does not match authorization');
  const falseSchema = join(root, 'false-schema.json'); writeFileSync(falseSchema, 'false'); expect((await checkLiveEvidence(root, { expected, schemaPath: falseSchema })).issues).toContain('schema / boolean schema is false');
  writeFileSync(join(root, 'manifest.json'), '{'); expect((await checkLiveEvidence(root, { expected })).issues).toEqual(['Live evidence files are missing or invalid']);
});
