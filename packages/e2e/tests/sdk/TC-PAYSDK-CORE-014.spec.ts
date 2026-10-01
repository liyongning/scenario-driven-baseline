import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicHarness, installPublicClientPlatform, successQuery } from './public-client-harness.ts';

const root = resolve(import.meta.dirname, '../../../..');
const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
type PackedManifest = Readonly<{ version: string; dependencies: Readonly<Record<string, string>> }>;
type PackageState = Readonly<{ root: string; sdkConsumer: string; protocolConsumer: string; sdkTar: string; protocolTar: string; sdkFiles: string[]; protocolFiles: string[]; sdkManifest: PackedManifest }>;
let state: PackageState;
let cleanupPlatform: (() => void) | undefined;

function run(command: string, args: string[], cwd = root): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function sdkRuntimeConsumer(moduleLine: string): string {
  return `${moduleLine}
const requests=[];
globalThis.wx={
  getDeviceInfo:()=>({platform:'ios'}),
  canIUse:value=>value==='requestVirtualPayment',
  request(input){
    const body=JSON.parse(input.data||'{}'); const path=new URL(input.url).pathname;
    requests.push({path,body,headers:input.header});
    const response=path.endsWith('/pay')
      ? {baseResp:{statusCode:'0',success:true},tradeNo:body.tradeNo,paymentNo:'payment-'+body.tradeNo,channel:'CHANNEL_WECHAT_VIRTUAL',expireTime:'1800000000000',payParams:{wechatVirtual:{mode:'short_series_goods',signData:'sign-'+body.tradeNo,paySig:'sig-'+body.tradeNo,signature:'signature-'+body.tradeNo}}}
      : {baseResp:{statusCode:'0',success:true},trade:{tradeNo:body.tradeNo,status:'TRADE_STATUS_PAID',expireTime:'1800000000000'}};
    queueMicrotask(()=>input.success({statusCode:200,header:{},data:JSON.stringify(response)})); return {abort(){}};
  },
  requestVirtualPayment(input){queueMicrotask(input.success);}
};
const client=createPaymentClient({runtime:'wechat-miniapp',gatewayBaseUrl:'https://fixture.invalid',appId:'app',enabledMethods:['wechat-miniapp-virtual-goods'],getAccessToken:()=> 'token'});
const inputs=[undefined,'sandbox','prod']; const outcomes=[]; const phases=[];
for(const [index,xpayEnv] of inputs.entries()) outcomes.push(await client.pay({reference:{tradeNo:'tarball-'+index},method:'wechat-miniapp-virtual-goods',...(xpayEnv?{xpayEnv}:{})},index===2?{onPhase:event=>phases.push(event)}:undefined));
console.log(JSON.stringify({exports:Object.keys(subject).sort(),outcomes,requests,phases}));
`;
}

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'payment-task7-consumer-'));
  const packDir = join(directory, 'packs');
  await mkdir(packDir);
  const protocolTar = resolve(packDir, run('pnpm', ['--filter', '@daqian/payment-protocol', 'pack', '--pack-destination', packDir]).split('\n').at(-1)!);
  const sdkTar = resolve(packDir, run('pnpm', ['--filter', '@daqian/payment-sdk', 'pack', '--pack-destination', packDir]).split('\n').at(-1)!);
  async function install(name: string, dependency: string, tarball: string, overrideName?: string, overrideTar?: string) {
    const cwd = join(directory, name); await mkdir(cwd);
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name, private: true, type: 'module', dependencies: { [dependency]: `file:${tarball}` },
      ...(overrideName ? { pnpm: { overrides: { [overrideName]: `file:${overrideTar}` } } } : {}) }));
    run('pnpm', ['install', '--ignore-workspace'], cwd);
    return cwd;
  }
  const sdkConsumer = await install('sdk-only-consumer', '@daqian/payment-sdk', sdkTar, '@daqian/payment-protocol', protocolTar);
  const protocolConsumer = await install('protocol-consumer', '@daqian/payment-protocol', protocolTar);
  const sdkManifest = JSON.parse(run('tar', ['-xOf', sdkTar, 'package/package.json']));
  state = { root: directory, sdkConsumer, protocolConsumer, sdkTar, protocolTar,
    sdkFiles: run('tar', ['-tf', sdkTar]).split('\n'), protocolFiles: run('tar', ['-tf', protocolTar]).split('\n'), sdkManifest };
}, 30_000);

afterEach(() => cleanupPlatform?.());
afterAll(async () => { if (state) await rm(state.root, { recursive: true, force: true }); });

const caseChecks: Record<string, string[]> = {
  'sdk-esm-consumer': ['dual-module-consumption', 'production-package-clean'],
  'sdk-commonjs-consumer': ['dual-module-consumption', 'production-package-clean'],
  'sdk-types-consumer': ['dual-module-consumption'],
};

for (const [caseKey, checks] of Object.entries(caseChecks)) defineCase({
  ownerId: 'TC-PAYSDK-CORE-014', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CORE-014', caseKey, checks }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as { sdkVersion: string; protocolVersion: string; sdkExports: string[]; protocolExport: string };
  const sdkCase = caseKey.startsWith('sdk-') && !caseKey.includes('does-not') || caseKey === 'package-boundaries';
  if (caseKey.endsWith('esm-consumer')) {
    const cwd = sdkCase ? state.sdkConsumer : state.protocolConsumer;
    const name = sdkCase ? '@daqian/payment-sdk' : '@daqian/payment-protocol';
    await writeFile(join(cwd, 'consumer.mjs'), sdkCase
      ? sdkRuntimeConsumer(`import * as subject from '${name}'; const {createPaymentClient}=subject;`)
      : `import * as subject from '${name}'; console.log(JSON.stringify(Object.keys(subject).sort())); subject.createWechatMiniappHttp();`);
    const result = JSON.parse(run('node', ['consumer.mjs'], cwd)) as string[] | { exports: string[]; outcomes: Array<{ attemptId: string; reason: string; snapshot: { state: string } }>; requests: Array<{ path: string; body: Record<string, unknown> }>; phases: Array<{ attemptId: string; phase: string }> };
    const exports = Array.isArray(result) ? result : result.exports;
    await checkpoint(checks[0]!, () => {
      expect(exports).toContain(sdkCase ? 'createPaymentClient' : fixture.protocolExport);
      if (!Array.isArray(result)) {
        expect(result.outcomes.map(outcome => [outcome.reason, outcome.snapshot.state])).toEqual([['confirmed', 'PAID'], ['confirmed', 'PAID'], ['confirmed', 'PAID']]);
        const prepares = result.requests.filter(record => record.path.endsWith('/pay'));
        expect(prepares.map(record => record.body.xpayEnv)).toEqual([undefined, 'XPAY_ENV_SANDBOX', 'XPAY_ENV_PROD']);
        expect(result.requests.filter(record => record.path.endsWith('/query')).every(record => !Object.prototype.hasOwnProperty.call(record.body, 'xpayEnv'))).toBe(true);
        expect(result.requests.map(record => record.body.tradeNo)).toEqual(['tarball-0', 'tarball-0', 'tarball-1', 'tarball-1', 'tarball-2', 'tarball-2']);
        expect(result.phases.map(event => event.phase)).toEqual(['channel_invoking', 'confirming']);
        expect(new Set(result.phases.map(event => event.attemptId))).toEqual(new Set([result.outcomes[2]!.attemptId]));
      }
    });
    if (checks[1]) await checkpoint(checks[1], () => expect(state.sdkFiles.every(file => !/(testing|fixtures|e2e)/.test(file))).toBe(true));
  } else if (caseKey.endsWith('commonjs-consumer')) {
    const cwd = sdkCase ? state.sdkConsumer : state.protocolConsumer;
    const name = sdkCase ? '@daqian/payment-sdk' : '@daqian/payment-protocol';
    await writeFile(join(cwd, 'consumer.cjs'), sdkCase
      ? `(async()=>{${sdkRuntimeConsumer(`const subject=require('${name}'); const {createPaymentClient}=subject;`)}})().catch(error=>{console.error(error);process.exitCode=1});`
      : `const subject=require('${name}'); console.log(JSON.stringify(Object.keys(subject).sort())); subject.createWechatMiniappHttp();`);
    const result = JSON.parse(run('node', ['consumer.cjs'], cwd)) as string[] | { exports: string[]; outcomes: Array<{ attemptId: string; reason: string; snapshot: { state: string } }>; requests: Array<{ path: string; body: Record<string, unknown> }>; phases: Array<{ attemptId: string; phase: string }> };
    const exports = Array.isArray(result) ? result : result.exports;
    await checkpoint(checks[0]!, () => {
      expect(exports).toContain(sdkCase ? 'createPaymentClient' : fixture.protocolExport);
      if (!Array.isArray(result)) {
        expect(result.outcomes.map(outcome => [outcome.reason, outcome.snapshot.state])).toEqual([['confirmed', 'PAID'], ['confirmed', 'PAID'], ['confirmed', 'PAID']]);
        expect(result.requests.filter(record => record.path.endsWith('/pay')).map(record => record.body.xpayEnv)).toEqual([undefined, 'XPAY_ENV_SANDBOX', 'XPAY_ENV_PROD']);
        expect(result.requests.filter(record => record.path.endsWith('/query')).every(record => !Object.prototype.hasOwnProperty.call(record.body, 'xpayEnv'))).toBe(true);
        expect(result.requests.map(record => record.body.tradeNo)).toEqual(['tarball-0', 'tarball-0', 'tarball-1', 'tarball-1', 'tarball-2', 'tarball-2']);
        expect(result.phases.map(event => event.phase)).toEqual(['channel_invoking', 'confirming']);
        expect(new Set(result.phases.map(event => event.attemptId))).toEqual(new Set([result.outcomes[2]!.attemptId]));
      }
    });
    if (checks[1]) await checkpoint(checks[1], () => expect(state.sdkFiles.every(file => !/(testing|fixtures|e2e)/.test(file))).toBe(true));
  } else if (caseKey.endsWith('types-consumer')) {
    const cwd = sdkCase ? state.sdkConsumer : state.protocolConsumer;
    const name = sdkCase ? '@daqian/payment-sdk' : '@daqian/payment-protocol';
    await writeFile(join(cwd, 'consumer.ts'), sdkCase
      ? `import {createPaymentClient, type PaymentClient} from '${name}'; const value: PaymentClient=createPaymentClient({runtime:'wechat-miniapp',gatewayBaseUrl:'https://fixture.invalid',appId:'a',enabledMethods:['wechat-miniapp-virtual-goods'],getAccessToken:()=>null}); void value;`
      : `import {createWechatMiniappHttp, type HttpPort} from '${name}'; const value: HttpPort=createWechatMiniappHttp(); void value;`);
    await writeFile(join(cwd, 'consumer.cts'), `import subject = require('${name}'); void subject.${sdkCase ? 'createPaymentClient' : 'createWechatMiniappHttp'};`);
    await writeFile(join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2020' }, include: ['consumer.ts', 'consumer.cts'] }));
    await checkpoint(checks[0]!, () => expect(() => run('pnpm', ['exec', 'tsc', '-p', join(cwd, 'tsconfig.json')], root)).not.toThrow());
  }
}, { fixtureRoot });

defineCase({ ownerId: 'TC-PAYSDK-CORE-014', caseId: 'concurrent-clients', fixtureCase: 'concurrent-clients', environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CORE-014', caseKey: 'concurrent-clients', checks: ['client-isolation'] }],
}, async ({ checkpoint, expect }) => {
  const platform = installPublicClientPlatform({ http: [
    { path: '/api/base/trade/query', body: successQuery('client-a') }, { path: '/api/base/trade/query', body: successQuery('client-b') },
  ] }); cleanupPlatform = platform.restore;
  const a = createPublicHarness({ gatewayBaseUrl: 'https://a.fixture.invalid', getAccessToken: () => 'token-a', requestContext: { lane: 'a' } }).client;
  const b = createPublicHarness({ gatewayBaseUrl: 'https://b.fixture.invalid', getAccessToken: () => 'token-b', requestContext: { lane: 'b' } }).client;
  await Promise.all([a.query({ tradeNo: 'client-a' }), b.query({ tradeNo: 'client-b' })]);
  await checkpoint('client-isolation', () => expect(platform.httpRecords.map(record => [record.headers.Authorization, record.headers.lane])).toEqual([['Bearer token-a', 'a'], ['Bearer token-b', 'b']]));
}, { fixtureRoot });
