import { afterEach, vi } from 'vitest';
import { PaymentConfigurationError, type DiagnosticEvent, type PaymentOutcome } from '@daqian/payment-sdk';
import { createWechatMiniappHttp } from '@daqian/payment-protocol';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicHarness, installPublicClientPlatform, successPrepare, successQuery, type HttpPlan } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); vi.restoreAllMocks(); vi.useRealTimers(); });
type Fixture = Readonly<{ tradeNo: string; variant?: string; platform?: string }>;
type D = Readonly<{ ownerId: string; caseKey: string; checks: readonly string[] }>;
const defs: readonly D[] = [
 {ownerId:'TC-PAYSDK-CONTRACT-009',caseKey:'unsupported-h5-method',checks:['unsupported-before-effects','no-payment-side-effects']},
 {ownerId:'TC-PAYSDK-CONTRACT-010',caseKey:'duplicate-active-pay',checks:['busy-on-active-trade','single-prepare-invoke']},

];
const req=(tradeNo:string)=>({reference:{tradeNo},method:'wechat-miniapp-virtual-goods' as const});



for(const d of defs) defineCase({ownerId:d.ownerId,caseId:`task8-${d.caseKey}`,fixtureCase:d.caseKey,environment:'integration',covers:[{id:d.ownerId,caseKey:d.caseKey,checks:d.checks}]},async({fixture:value,checkpoint,expect})=>{
 const f=value as Fixture; const key=d.caseKey; const diagnostics:DiagnosticEvent[]=[];
 let http:HttpPlan[]=[]; let channel: ('success'|'pending')[]=['success']; const token:string|null='fixture-token'; const getAccessToken=():string|null=>token;
 if(key==='duplicate-active-pay') {http=[{path:'/api/base/trade/pay',body:successPrepare(f.tradeNo)},{path:'/api/base/trade/query',body:successQuery(f.tradeNo)}];channel=['pending'];}



 const selectedPlatform=key==='client-platform-ohos-pc'?'ohos_pc':f.platform??(key.replace('client-platform-','')||'ios');
 if(key.startsWith('request-id-')) vi.spyOn(Date,'now').mockReturnValue(1_789_000_000_000);
 if(['default-policy','fieldwise-overrides','per-call-override-isolation'].includes(key)) vi.useFakeTimers({now:0,toFake:['Date','setTimeout','clearTimeout']});
 const platform=installPublicClientPlatform({http,channel,platform:selectedPlatform}); cleanup=platform.restore;
 if(key==='client-platform-exception') (globalThis as {wx?:{getDeviceInfo?:()=>unknown}}).wx!.getDeviceInfo=()=>{throw new Error('fixture');};
 const policy=key==='fieldwise-overrides'?{observation:{intervalMs:7}}:key==='per-call-override-isolation'?{observation:{intervalMs:7,maxWaitMs:30}}:key==='channel-wait-budget'?{requestTimeoutMs:10,observation:{intervalMs:1,maxWaitMs:5}}:key==='provider-hangs'?{requestTimeoutMs:8,observation:{intervalMs:1,maxWaitMs:20}}:undefined;
 if(key.startsWith('invalid-policy-')) {
  const value=key==='invalid-policy-zero'?0:key==='invalid-policy-negative'?-1:key==='invalid-policy-nan'?Number.NaN:Number.POSITIVE_INFINITY;
  let thrown:unknown; try{createPublicHarness({policy:{requestTimeoutMs:value}});}catch(error){thrown=error;}
  for(const check of d.checks) await checkpoint(check,()=>{expect(thrown).toBeInstanceOf(PaymentConfigurationError);expect(platform.httpRecords).toHaveLength(0);}); return;
 }
 const harness=createPublicHarness({getAccessToken:key==='provider-throws'?()=>{throw new Error('fixture-secret');}:key==='provider-hangs'?()=>new Promise(()=>undefined):getAccessToken,...policy?{policy}:{},onDiagnostic:e=>diagnostics.push(e)});
 let outcomes:(PaymentOutcome|unknown)[]=[];
 if(key==='unsupported-h5-method') outcomes=[await harness.client.pay({reference:{tradeNo:f.tradeNo},method:'h5' as never})];
 else if(key==='duplicate-active-pay') {const first=harness.client.pay(req(f.tradeNo));while(!platform.pendingChannels.length)await new Promise(r=>setTimeout(r,0));outcomes=[await harness.client.pay(req(f.tradeNo))];platform.pendingChannels[0]!.success();outcomes.push(await first);}
 else if(key==='provider-hangs') outcomes=[await harness.client.pay(req(f.tradeNo))];
 else if(key==='request-id-multiple-clients') {const second=createPublicHarness();outcomes=[await harness.client.pay(req(f.tradeNo)),await second.client.pay(req(`${f.tradeNo}-second`))];}
 else if(key==='default-policy') {const pending=harness.client.pay(req(f.tradeNo));await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(2_999);expect(platform.httpRecords.filter(record=>record.path.endsWith('/query'))).toHaveLength(1);await vi.advanceTimersByTimeAsync(1);outcomes=[await pending];}
 else if(key==='fieldwise-overrides') {const pending=harness.client.pay(req(f.tradeNo),{policy:{observation:{maxWaitMs:20}}});await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(6);expect(platform.httpRecords.filter(record=>record.path.endsWith('/query'))).toHaveLength(1);await vi.advanceTimersByTimeAsync(1);outcomes=[await pending];}
 else if(key==='per-call-override-isolation') {
  const first=harness.client.pay(req(`${f.tradeNo}-override`),{policy:{observation:{intervalMs:1}}});await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(1);outcomes=[await first];
  const second=harness.client.pay(req(`${f.tradeNo}-base`));await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(6);expect(platform.httpRecords.filter(record=>record.path.endsWith('/query'))).toHaveLength(3);await vi.advanceTimersByTimeAsync(1);outcomes.push(await second);
 }
 else if(key==='channel-wait-budget') {const pending=harness.client.pay(req(f.tradeNo));while(!platform.pendingChannels.length)await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,8));platform.pendingChannels[0]!.success();outcomes=[await pending];}
 else if(key==='independent-query') outcomes=[await harness.client.query({tradeNo:f.tradeNo})];
 else outcomes=[key==='no-extra-phase-values'?await harness.pay(req(f.tradeNo)):await harness.client.pay(req(f.tradeNo))];
 for(const check of d.checks) await checkpoint(check,()=>{
  const out=outcomes[0] as PaymentOutcome;
  if(key==='unsupported-h5-method'){expect(out).toMatchObject({reason:'unsupported',channelSignal:'not_invoked'});expect(platform.httpRecords).toHaveLength(0);}
  else if(key==='duplicate-active-pay'){expect(outcomes[0]).toMatchObject({reason:'busy'});expect(outcomes[1]).toMatchObject({reason:'confirmed'});expect(platform.channelRecords).toHaveLength(1);}


  else if(key==='independent-query'){expect(outcomes[0]).toMatchObject({ok:true,value:{state:'PAID'}});}
  else if(key==='no-extra-phase-values'){expect(harness.phases.map(p=>p.phase)).toEqual(['channel_invoking','confirming']);}
 });
}, {fixtureRoot});


defineCase({ownerId:'TC-PAYSDK-CORE-010',caseId:'task8-protocol-root-factory',fixtureCase:'protocol-root-factory',environment:'integration',covers:[
 {id:'TC-PAYSDK-CORE-010',caseKey:'protocol-root-factory',checks:['protocol-root-factory','lazy-platform-access','package-boundary']},
]},async({checkpoint,expect})=>{delete(globalThis as{wx?:unknown}).wx;const sdk=await import('@daqian/payment-sdk');await checkpoint('protocol-root-factory',()=>expect(createWechatMiniappHttp()).toMatchObject({send:expect.any(Function)}));await checkpoint('protocol-root-source',()=>expect(createWechatMiniappHttp).toBeTypeOf('function'));await checkpoint('lazy-platform-access',()=>expect((globalThis as{wx?:unknown}).wx).toBeUndefined());await checkpoint('package-boundary',()=>expect(sdk).not.toHaveProperty('createWechatMiniappHttp'));},{fixtureRoot});
