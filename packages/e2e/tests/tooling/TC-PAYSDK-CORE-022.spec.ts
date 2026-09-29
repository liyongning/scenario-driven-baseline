import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { defineCase } from '../../src/cases/define-case';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const run = (args: string[]) => spawnSync(resolve('node_modules/.bin/tsx'), args, { cwd: process.cwd(), encoding: 'utf8' });
const temp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

function liveConfig(root: string) {
  writeFileSync(join(root, '.env.live'), 'PAYMENT_LIVE_GATEWAY_BASE_URL=https://gateway.example\nPAYMENT_LIVE_CREATE_TRADE_URL=https://trade.example/api/base/trade/create\nPAYMENT_LIVE_PRODUCT_ID=product\nPAYMENT_LIVE_SERVER_ENV=test\n');
  const host = join(root, 'packages/e2e/host/weapp'); mkdirSync(host, { recursive: true });
  writeFileSync(join(host, 'project.live.config.json'), JSON.stringify({ appid: 'wx-live-test', compileType: 'miniprogram', libVersion: '3.10.3', miniprogramRoot: './', projectname: 'payment-sdk-live-host', setting: { es6: true, minified: false, urlCheck: true } }));
}

defineCase({ ownerId: 'TC-PAYSDK-CORE-022', caseId: 'isolated-live-build', fixtureCase: 'isolated-live-build', environment: 'integration', covers: [{ id: 'TC-PAYSDK-CORE-022', caseKey: 'isolated-live-build', checks: ['live-build-boundary'] }] }, async ({ checkpoint, expect }) => {
  const root = temp('payment-live-build-'); const output = join(root, 'out'); liveConfig(root);
  const built = run(['packages/e2e/src/live/build.ts', '--controlled-root', root, '--controlled-output', output]);
  const baseProject = { appid: 'wx-live', compileType: 'miniprogram', libVersion: '3.10.3', miniprogramRoot: './', projectname: 'payment-sdk-live-host', setting: { es6: true, minified: false, urlCheck: true } };
  const tourist = temp('payment-live-tourist-'); liveConfig(tourist); writeFileSync(join(tourist, 'packages/e2e/host/weapp/project.live.config.json'), JSON.stringify({ ...baseProject, appid: 'touristappid' }));
  const touristBuild = run(['packages/e2e/src/live/build.ts', '--controlled-root', tourist, '--controlled-output', join(tourist, 'out')]);
  const unchecked = temp('payment-live-unchecked-'); liveConfig(unchecked); writeFileSync(join(unchecked, 'packages/e2e/host/weapp/project.live.config.json'), JSON.stringify({ ...baseProject, setting: { ...baseProject.setting, urlCheck: false } }));
  const uncheckedBuild = run(['packages/e2e/src/live/build.ts', '--controlled-root', unchecked, '--controlled-output', join(unchecked, 'out')]);
  await checkpoint('live-build-boundary', () => {
    expect(built.status).toBe(0);
    const bundle = readFileSync(join(output, 'pages/live/index.js'), 'utf8');
    expect(bundle).not.toMatch(/@payment-test\/protocol|testing\/shadow|channel-double|fixtures\//i);
    expect(JSON.parse(readFileSync(join(output, 'live-build-manifest.json'), 'utf8'))).toMatchObject({ mode: 'live', controlledToolInput: true, productionEntrypoints: ['@daqian/payment-sdk', '@daqian/payment-protocol'] });
    expect(JSON.parse(readFileSync(join(output, 'project.config.json'), 'utf8')).setting.urlCheck).toBe(true);
    expect(touristBuild.status).toBe(1); expect(touristBuild.stderr).toContain('non-tourist');
    expect(uncheckedBuild.status).toBe(1); expect(uncheckedBuild.stderr).toContain('enable urlCheck');
  });
  const manifestPath = join(output, 'live-build-manifest.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); manifest.moduleGraph.push('packages/payment-protocol/testing/shadow/index.ts'); writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(join(output, 'pages/live/index.js'), `${readFileSync(join(output, 'pages/live/index.js'), 'utf8')}\n/* testing/shadow */`);
  const contaminated = run(['packages/e2e/src/live/check.ts', '--controlled-root', root, '--controlled-output', output]);
  await checkpoint('live-build-boundary', () => { expect(contaminated.status).toBe(1); expect(contaminated.stdout).toMatch(/Shadow|stale/); });
}, { fixtureRoot });

defineCase({ ownerId: 'TC-PAYSDK-CORE-022', caseId: 'missing-create-contract', fixtureCase: 'missing-create-contract', environment: 'integration', covers: [{ id: 'TC-PAYSDK-CORE-022', caseKey: 'missing-create-contract', checks: ['contract-readiness'] }] }, async ({ checkpoint, expect }) => {
  const root = temp('payment-live-check-'); const output = join(root, 'out'); liveConfig(root);
  expect(run(['packages/e2e/src/live/build.ts', '--controlled-root', root, '--controlled-output', output]).status).toBe(0);
  const manifestPath = join(output, 'live-build-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.createTradeBinding.path = '/unreviewed/create';
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const checked = run(['packages/e2e/src/live/check.ts', '--controlled-root', root, '--controlled-output', output]);
  await checkpoint('contract-readiness', () => { expect(checked.status).toBe(1); expect(checked.stdout).toContain('generated CreateTrade binding is missing or stale'); });
}, { fixtureRoot });

defineCase({ ownerId: 'TC-PAYSDK-CORE-022', caseId: 'live-evidence-validation', fixtureCase: 'live-evidence-validation', environment: 'integration', covers: [{ id: 'TC-PAYSDK-CORE-022', caseKey: 'live-evidence-validation', checks: ['live-evidence-gate', 'business-independent'] }] }, async ({ checkpoint, expect }) => {
  const root = temp('payment-live-evidence-'); mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ mode: 'shadow', runId: 'sample' }));
  writeFileSync(join(root, 'events.json'), '[]'); writeFileSync(join(root, 'matrix.json'), '[]'); writeFileSync(join(root, 'review.json'), '{}');
  const rejected = run(['packages/e2e/src/live/check-evidence.ts', '--run-dir', root]);
  const cases = [
    ['LIVE-PAYSDK-001', 'android-sandbox'], ['LIVE-PAYSDK-001', 'android-prod'], ['LIVE-PAYSDK-001', 'ios-prod'],
    ['LIVE-PAYSDK-002', 'test-omitted'], ['LIVE-PAYSDK-002', 'test-sandbox'], ['LIVE-PAYSDK-002', 'test-prod'],
    ['LIVE-PAYSDK-002', 'prod-omitted'], ['LIVE-PAYSDK-002', 'prod-sandbox'], ['LIVE-PAYSDK-002', 'prod-prod'],
  ] as const;
  const fakeHash = 'a'.repeat(64);
  const executions = cases.map(([id, caseKey], index) => { const [first, xpayEnv] = caseKey.split('-'); const services = { serverEnv: id === 'LIVE-PAYSDK-002' ? first : 'test', gatewayBuild: 'g', tradeBuild: 't', payBuild: 'p' }; return id === 'LIVE-PAYSDK-001' ? { id: `e-${index}`, kind: 'device', executedAt: '2026-09-10T00:00:00Z', xpayEnv, device: { platform: first, model: 'controlled', osVersion: '1', wechatVersion: '1', baseLibraryVersion: '1' }, services } : { id: `e-${index}`, kind: 'service', executedAt: '2026-09-10T00:00:00Z', xpayEnv, services }; });
  const matrix = cases.map(([id, caseKey], index) => { const path = `renamed-${index}.json`; const content = JSON.stringify({ mode: 'shadow', id, caseKey, executionId: `e-${index}` }); writeFileSync(join(root, path), content); return { id, caseKey, status: 'passed', executionId: `e-${index}`, attachments: [{ path, sha256: createHash('sha256').update(content).digest('hex'), mode: 'live', kind: id === 'LIVE-PAYSDK-001' ? 'live-host-record' : 'live-service-record' }] }; });
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ mode: 'live', runId: 'sample', executedAt: '2026-09-10T00:00:00Z', sourceDigest: fakeHash, specDigest: fakeHash, idlDigest: fakeHash, createContractDigest: fakeHash, sdkVersion: '0.1.0', protocolVersion: '0.1.0', bundleHash: fakeHash, configHash: fakeHash, buildManifestHash: fakeHash, executions, authorization: { scope: 'controlled tool sample', reviewer: 'test' } }));
  writeFileSync(join(root, 'events.json'), JSON.stringify([0, 1, 2].flatMap(index => [{ sequence: 0, atMs: 0, executionId: `e-${index}`, correlationId: `e-${index}-trade-1`, kind: 'trade_created' }, { sequence: 1, atMs: 1, executionId: `e-${index}`, correlationId: `e-${index}-trade-1`, kind: 'outcome', attemptId: `a-${index}`, reason: 'confirmed', channelSignal: 'success_hint', snapshot: { state: 'PAID', source: 'server' } }])));
  writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  writeFileSync(join(root, 'review.json'), JSON.stringify({ verdict: 'PASS', reviewer: 'test' }));
  const shadow = run(['packages/e2e/src/live/check-evidence.ts', '--run-dir', root]);
  writeFileSync(join(root, matrix[0]!.attachments[0]!.path), 'changed');
  const drifted = run(['packages/e2e/src/live/check-evidence.ts', '--run-dir', root]);
  matrix[0]!.attachments[0]!.path = 'missing.txt'; writeFileSync(join(root, 'matrix.json'), JSON.stringify(matrix));
  const missing = run(['packages/e2e/src/live/check-evidence.ts', '--run-dir', root]);
  await checkpoint('live-evidence-gate', () => {
    expect(rejected.status).toBe(1); expect(rejected.stdout).toMatch(/schema|missing matrix case/);
    expect(shadow.status).toBe(1); expect(shadow.stdout).toContain('Shadow evidence cannot satisfy Live matrix');
    expect(drifted.status).toBe(1); expect(drifted.stdout).toContain('attachment digest mismatch');
    expect(missing.status).toBe(1); expect(missing.stdout).toContain('missing attachment');
  });
  await checkpoint('business-independent', () => { expect(readFileSync('openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk/spec.md', 'utf8')).toContain('业务权益、UI、构建、上线和实际 npm 发布不作为本 Change 完成条件'); });
}, { fixtureRoot });
