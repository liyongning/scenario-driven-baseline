import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach } from 'vitest';
import { buildLiveHost } from '../../src/live/build.ts';
import { checkLiveHost } from '../../src/live/check.ts';
import { checkExampleLiveRecord } from '../../src/live/check-evidence.ts';
import { defineCase } from '../../src/cases/define-case.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

defineCase({ ownerId: 'SCN-TEMPLATE-EXAMPLE-010', caseId: 'live-example-build', fixtureCase: 'live-example-build', environment: 'integration', covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-010', caseKey: 'live-example-build', checks: ['live-build-whitelist', 'no-payment-call'] }] }, async ({ checkpoint, expect }) => {
  const directory = await mkdtemp(join(tmpdir(), 'example-live-build-')); directories.push(directory);
  const output = join(directory, 'out');
  const host = join(directory, 'packages/e2e/host/weapp'); await mkdir(host, { recursive: true });
  await writeFile(join(directory, '.env.live'), 'PAYMENT_LIVE_GATEWAY_BASE_URL=https://gateway.example\nPAYMENT_LIVE_CREATE_TRADE_URL=https://gateway.example/api/base/trade/create\nPAYMENT_LIVE_PRODUCT_ID=product\nPAYMENT_LIVE_SERVER_ENV=test\nLIVE_EXAMPLE_KIND=fixture\nLIVE_EXAMPLE_ITEM_ID=sku\nLIVE_EXAMPLE_ITEM_NAME=Fixture\nLIVE_EXAMPLE_UNIT_VALUE=100\n');
  await writeFile(join(host, 'project.live.config.json'), JSON.stringify({ appid: 'wx-example-test', compileType: 'miniprogram', libVersion: '3.10.3', miniprogramRoot: './', projectname: 'example-live', setting: { es6: true, minified: false, urlCheck: true } }));
  const built = await buildLiveHost({ repositoryRoot, configRoot: directory, output, controlledToolInput: true });
  const check = await checkLiveHost({ repositoryRoot, configRoot: directory, output });
  const bundle = await readFile(join(output, 'pages/live/example/index.js'), 'utf8');
  const page = await readFile(join(output, 'pages/live/example/index.wxml'), 'utf8');
  await checkpoint('live-build-whitelist', () => { expect(Object.keys(built.manifest.outputFiles)).toContain('pages/live/example/index.js'); expect(check.issues).toEqual(['controlled tool build cannot be used as Live evidence']); expect(page).toContain('创建并观察'); expect(bundle).not.toContain('fixture-token'); });
  await checkpoint('no-payment-call', () => { expect(bundle).not.toContain('createPaymentClient'); expect(bundle).not.toContain('requestVirtualPayment'); });
}, { fixtureRoot });

defineCase({ ownerId: 'SCN-TEMPLATE-EXAMPLE-010', caseId: 'live-example-evidence', fixtureCase: 'live-example-evidence', environment: 'integration', covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-010', caseKey: 'live-example-evidence', checks: ['offline-evidence-check'] }] }, async ({ checkpoint, expect }) => {
  const valid = { id: 'LIVE-TEMPLATE-EXAMPLE-001', kind: 'live-example-record', resourceRef: { id: 'resource-1', externalRef: 'ref-1' }, outcome: { end: 'completed', lastState: 'completed' }, requestPaths: ['/api/base/trade/create', '/api/base/trade/query'] };
  await checkpoint('offline-evidence-check', async () => {
    expect(await checkExampleLiveRecord(valid)).toEqual([]);
    expect((await checkExampleLiveRecord({ ...valid, requestPaths: [...valid.requestPaths, '/api/base/trade/pay'] })).join(' ')).toContain('payment call');
    expect(await checkExampleLiveRecord({ ...valid, requestPaths: ['https://gateway.example/api/base/trade/create', 'https://gateway.example/api/base/trade/query'] })).toEqual([]);
    expect((await checkExampleLiveRecord({ ...valid, requestPaths: ['http://[', '/api/base/trade/query'] })).join(' ')).toContain('create then query');
    expect((await checkExampleLiveRecord({ ...valid, requestPaths: ['/api/base/trade/query', '/api/base/trade/create'] })).join(' ')).toContain('create then query');
    expect((await checkExampleLiveRecord({ ...valid, accessToken: 'secret' })).join(' ')).toContain('additional properties');
  });
}, { fixtureRoot });
