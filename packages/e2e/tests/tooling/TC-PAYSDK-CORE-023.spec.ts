import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreateTrade, CreateTradeRequest } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { paymentBusinessErrors } from '@daqian/payment-protocol';
import { defineCase } from '../../src/cases/define-case';
import { buildLiveHost } from '../../src/live/build';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const source = JSON.parse(readFileSync(`${fixtureRoot}/TC-PAYSDK-CORE-023/source-manifest.json`, 'utf8'));
const requestWire = JSON.parse(readFileSync(`${fixtureRoot}/TC-PAYSDK-CORE-023/wire-request.json`, 'utf8'));
const boundary = JSON.parse(readFileSync(`${fixtureRoot}/TC-PAYSDK-CORE-023/generated-create-boundary.json`, 'utf8'));

function filesUnder(path: string): string {
  return readdirSync(path).flatMap(name => {
    const target = join(path, name);
    return statSync(target).isDirectory() ? filesUnder(target) : name.endsWith('.ts') ? readFileSync(target, 'utf8') : '';
  }).join('\n');
}

defineCase({ ownerId: 'TC-PAYSDK-CORE-023', caseId: 'generated-create-boundary', fixtureCase: 'generated-create-boundary', environment: 'integration', covers: [{ id: 'TC-PAYSDK-CORE-023', caseKey: 'generated-create-boundary', checks: ['create-scope', 'create-wire'] }] }, async ({ checkpoint, expect }) => {
  await checkpoint('create-wire', () => {
    expect(source.idlCommit).toBe('67266349aef2dc589e68541f042ff845749b3363');
    expect(boundary).toMatchObject({ method: CreateTrade.meta.method, path: CreateTrade.meta.path, liveOnly: true });
    expect(CreateTrade.meta.requestCodec?.toJSON(CreateTradeRequest.fromJSON(requestWire))).toEqual(requestWire);
  });

  const configRoot = mkdtempSync(join(tmpdir(), 'payment-core023-config-'));
  const output = mkdtempSync(join(tmpdir(), 'payment-core023-output-'));
  writeFileSync(join(configRoot, '.env.live'), 'PAYMENT_LIVE_GATEWAY_BASE_URL=https://gateway.example\nPAYMENT_LIVE_CREATE_TRADE_URL=https://trade.example/api/base/trade/create\nPAYMENT_LIVE_PRODUCT_ID=product\nPAYMENT_LIVE_SERVER_ENV=test\n');
  const host = join(configRoot, 'packages/e2e/host/weapp'); mkdirSync(host, { recursive: true });
  writeFileSync(join(host, 'project.live.config.json'), JSON.stringify({ appid: 'wx-live-test', compileType: 'miniprogram', libVersion: '3.10.3', miniprogramRoot: './', projectname: 'payment-sdk-live-host', setting: { es6: true, minified: false, urlCheck: true } }));
  const built = await buildLiveHost({ repositoryRoot: process.cwd(), configRoot, output, controlledToolInput: true });
  const sdkSource = filesUnder('packages/payment-sdk/src');
  const shadowSource = filesUnder('packages/payment-protocol/testing/shadow');
  const liveSource = filesUnder('packages/e2e/host/weapp/live');
  await checkpoint('create-scope', () => {
    expect(built.manifest).toMatchObject({ createTradeAdapter: 'protocol-generated', createTradeBinding: { method: 'POST', path: '/api/base/trade/create' }, productionEntrypoints: ['@daqian/payment-sdk', '@daqian/payment-protocol'] });
    expect(Object.keys(paymentBusinessErrors)).toHaveLength(17);
    expect(sdkSource).not.toMatch(/\bCreateTrade\b(?!Pay)/);
    expect(shadowSource).not.toMatch(/\bCreateTrade\b(?!Pay)/);
    expect(liveSource).not.toContain('QueryOrder');
    expect(built.manifest.moduleGraph).not.toEqual(expect.arrayContaining([expect.stringMatching(/fixtures|testing\/shadow|channel-double/)]));
  });
}, { fixtureRoot });
