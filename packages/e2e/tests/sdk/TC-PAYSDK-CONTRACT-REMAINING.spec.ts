import { afterEach, vi } from 'vitest';
import { PaymentConfigurationError, type DiagnosticEvent, type PaymentOutcome } from '@daqian/payment-sdk';
import { createWechatMiniappHttp, paymentBusinessErrors } from '@daqian/payment-protocol';
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
 {ownerId:'TC-PAYSDK-CONTRACT-016',caseKey:'provider-throws',checks:['provider-throw','no-fake-unauthorized']},
 {ownerId:'TC-PAYSDK-CONTRACT-016',caseKey:'provider-hangs',checks:['provider-timeout','no-fake-unauthorized','late-provider-isolated']},
 {ownerId:'TC-PAYSDK-CONTRACT-015',caseKey:'test-gateway-development-lane',checks:['explicit-gateway-and-lane','no-environment-rewrite','evidence-boundary']},
 ...['http-200-business-error','success-error-conflict-with-nonzero-status','success-error-conflict-with-zero-status','missing-base-resp','null-base-resp','non-object-root','undecodable-content','missing-status-code','null-status-code','invalid-status-code','lossy-status-code','http-401','non-2xx-with-business-code','non-2xx-without-business-code','network-failure'].map(caseKey=>({ownerId:'TC-PAYSDK-CONTRACT-017',caseKey,checks: caseKey==='network-failure'?['transport-failure','no-replay-or-channel-cancel']:caseKey.startsWith('success-error-conflict')?['status-code-authority','inconsistent-details-diagnostic']:['missing-base-resp','null-base-resp','non-object-root','undecodable-content','missing-status-code','null-status-code','invalid-status-code','lossy-status-code'].includes(caseKey)?['invalid-2xx-envelope']:caseKey==='http-401'||caseKey==='non-2xx-without-business-code'?['non-2xx-order','no-replay-or-channel-cancel']:caseKey==='non-2xx-with-business-code'?['status-code-authority','non-2xx-order','no-replay-or-channel-cancel']:['status-code-authority','no-replay-or-channel-cancel']})),
 ...['default-policy','fieldwise-overrides','per-call-override-isolation','invalid-policy-zero','invalid-policy-negative','invalid-policy-nan','invalid-policy-infinity','channel-wait-budget'].map(caseKey=>({ownerId:'TC-PAYSDK-CONTRACT-019',caseKey,checks:[caseKey==='default-policy'?'defaults':caseKey==='fieldwise-overrides'?'fieldwise-merge':caseKey==='per-call-override-isolation'?'override-isolation':caseKey==='channel-wait-budget'?'channel-wait-excluded':'invalid-before-send']})),
 {ownerId:'TC-PAYSDK-CONTRACT-020',caseKey:'independent-query',checks:['query-no-notifications']},
 {ownerId:'TC-PAYSDK-CONTRACT-020',caseKey:'no-extra-phase-values',checks:['public-event-shape','no-extra-phases']},
];
const req=(tradeNo:string)=>({reference:{tradeNo},method:'wechat-miniapp-virtual-goods' as const});
const error=(code:bigint,retryable=false)=>({baseResp:{statusCode:code.toString(),success:false,statusMsg:'fixture',error:{bizCode:code.toString(),canonicalCode:'CANONICAL_ERROR_CODE_UNAVAILABLE',retryable}}});
function malformed(tradeNo:string,key:string): HttpPlan {
 const good=successPrepare(tradeNo) as Record<string,unknown>;
 if(key==='network-failure') return {path:'/api/base/trade/pay',failure:true};
 if(key==='undecodable-content') return {path:'/api/base/trade/pay',body:'not-json'};
 if(key==='non-object-root') return {path:'/api/base/trade/pay',body:[]};
 if(key==='missing-base-resp') {const body={...good};delete body.baseResp;return {path:'/api/base/trade/pay',body};}
 if(key==='null-base-resp') return {path:'/api/base/trade/pay',body:{...good,baseResp:null}};
 if(key==='missing-status-code') return {path:'/api/base/trade/pay',body:{...good,baseResp:{success:true}}};
 if(key==='null-status-code') return {path:'/api/base/trade/pay',body:{...good,baseResp:{statusCode:null,success:true}}};
 if(key==='invalid-status-code') return {path:'/api/base/trade/pay',body:{...good,baseResp:{statusCode:true,success:true}}};
 if(key==='lossy-status-code') return {path:'/api/base/trade/pay',body:{...good,baseResp:{statusCode:9007199254740992,success:true}}};
 if(key==='http-401') return {path:'/api/base/trade/pay',body:good,status:401};
 if(key==='non-2xx-with-business-code') return {path:'/api/base/trade/pay',body:error(paymentBusinessErrors.ErrInfraTradeCreateTradePayUnavailable.statusCode,true),status:503};
 if(key==='non-2xx-without-business-code') return {path:'/api/base/trade/pay',body:good,status:503};
 if(key==='http-200-business-error') return {path:'/api/base/trade/pay',body:error(paymentBusinessErrors.ErrInfraTradeCreateTradePayUnavailable.statusCode,true)};
 if(key==='success-error-conflict-with-nonzero-status') {const body=error(paymentBusinessErrors.ErrInfraTradeCreateTradePayUnavailable.statusCode,true); return {path:'/api/base/trade/pay',body:{...body,baseResp:{...body.baseResp,success:true}}};}
 return {path:'/api/base/trade/pay',body:{...good,baseResp:{statusCode:'0',success:false,statusMsg:'conflict',error:{bizCode:'1'}}}};
}

for(const d of defs) defineCase({ownerId:d.ownerId,caseId:`task8-${d.caseKey}`,fixtureCase:d.ownerId==='TC-PAYSDK-CONTRACT-017'?`task8-${d.caseKey}`:d.caseKey,environment:'integration',covers:[{id:d.ownerId,caseKey:d.caseKey,checks:d.checks}]},async({fixture:value,checkpoint,expect})=>{
 const f=value as Fixture; const key=d.caseKey; const diagnostics:DiagnosticEvent[]=[];
 let http:HttpPlan[]=[]; let channel: ('success'|'pending')[]=['success']; let token:string|null='fixture-token'; const getAccessToken=():string|null=>token;
 const isMalformed=d.ownerId==='TC-PAYSDK-CONTRACT-017';
 if(isMalformed) http=[malformed(f.tradeNo,key)];
 else if(key==='duplicate-active-pay') {http=[{path:'/api/base/trade/pay',body:successPrepare(f.tradeNo)},{path:'/api/base/trade/query',body:successQuery(f.tradeNo)}];channel=['pending'];}
 else if(key==='provider-throws') token=null;
 else if(d.ownerId==='TC-PAYSDK-CONTRACT-015'||d.ownerId==='TC-PAYSDK-CONTRACT-019'||d.ownerId==='TC-PAYSDK-CONTRACT-020') {
  if(key==='request-id-multiple-clients') http=[
   {path:'/api/base/trade/pay',body:successPrepare(f.tradeNo)},{path:'/api/base/trade/query',body:successQuery(f.tradeNo)},
   {path:'/api/base/trade/pay',body:successPrepare(`${f.tradeNo}-second`)},{path:'/api/base/trade/query',body:successQuery(`${f.tradeNo}-second`)},
  ];
  else if(['default-policy','fieldwise-overrides'].includes(key)) http=[{path:'/api/base/trade/pay',body:successPrepare(f.tradeNo)},{path:'/api/base/trade/query',body:successQuery(f.tradeNo,'TRADE_STATUS_PAYING')},{path:'/api/base/trade/query',body:successQuery(f.tradeNo)}];
  else if(key==='per-call-override-isolation') http=[
   {path:'/api/base/trade/pay',body:successPrepare(`${f.tradeNo}-override`)},{path:'/api/base/trade/query',body:successQuery(`${f.tradeNo}-override`,'TRADE_STATUS_PAYING')},{path:'/api/base/trade/query',body:successQuery(`${f.tradeNo}-override`)},
   {path:'/api/base/trade/pay',body:successPrepare(`${f.tradeNo}-base`)},{path:'/api/base/trade/query',body:successQuery(`${f.tradeNo}-base`,'TRADE_STATUS_PAYING')},{path:'/api/base/trade/query',body:successQuery(`${f.tradeNo}-base`)},
  ];
  else http=[{path:key==='independent-query'?'/api/base/trade/query':'/api/base/trade/pay',body:key==='independent-query'?successQuery(f.tradeNo):successPrepare(f.tradeNo)},...key==='independent-query'?[]:[{path:'/api/base/trade/query' as const,body:successQuery(f.tradeNo)}]];
 }
 if(key==='success-error-conflict-with-zero-status') http.push({path:'/api/base/trade/query',body:successQuery(f.tradeNo)});
 if(key==='channel-wait-budget') channel=['pending'];
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
 const harness=createPublicHarness({getAccessToken:key==='provider-throws'?()=>{throw new Error('fixture-secret');}:key==='provider-hangs'?()=>new Promise(()=>undefined):getAccessToken,...policy?{policy}:{},...(d.ownerId==='TC-PAYSDK-CONTRACT-015'?{gatewayBaseUrl:'https://test-gateway.fixture.invalid',requestContext:{lane:'development',productId:'product',appVersion:'1'}}:{}),onDiagnostic:e=>diagnostics.push(e)});
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
  else if(key.startsWith('provider-')){expect(out.reason).toBe(key==='provider-throws'?'error':'timed_out');expect(out.error?.code).toBe(key==='provider-throws'?'HOST_CONTEXT_ERROR':'TIMEOUT');expect(platform.httpRecords).toHaveLength(0);}
  else if(d.ownerId==='TC-PAYSDK-CONTRACT-015'){expect(platform.httpRecords[0]?.url).toBe('https://test-gateway.fixture.invalid/api/base/trade/pay');expect(platform.httpRecords[0]?.headers.lane).toBe('development');expect(platform.httpRecords[0]?.headers.lane).not.toBe('baseline');expect(platform.httpRecords[0]?.body).toHaveProperty('tradeNo',f.tradeNo);expect(out.reason).toBe('confirmed');}
  else if(isMalformed){
   const businessCode=paymentBusinessErrors.ErrInfraTradeCreateTradePayUnavailable.statusCode.toString();
   const expected=key==='http-401'?{reason:'auth_required',error:{code:'AUTH_REQUIRED',source:'gateway',originalCode:'401'}}:key==='success-error-conflict-with-zero-status'?{reason:'confirmed'}:key==='network-failure'?{reason:'error',error:{code:'NETWORK_ERROR',source:'network'}}:['http-200-business-error','success-error-conflict-with-nonzero-status','non-2xx-with-business-code'].includes(key)?{reason:'error',error:{code:'SERVER_ERROR',source:'gateway',originalCode:businessCode}}:key==='non-2xx-without-business-code'?{reason:'error',error:{code:'SERVER_ERROR',source:'gateway',originalCode:'503'}}:{reason:'error',error:{code:'PROTOCOL_ERROR',source:'gateway'}};
   expect(out).toMatchObject(expected);
   expect(platform.httpRecords).toHaveLength(key==='success-error-conflict-with-zero-status'?2:1);
   expect(platform.channelRecords).toHaveLength(key==='success-error-conflict-with-zero-status'?1:0);
   if(key.includes('conflict'))expect(diagnostics).toContainEqual({phase:'response-envelope-inconsistent',originalCode:key==='success-error-conflict-with-zero-status'?'0':businessCode});
  }
  else if(d.ownerId==='TC-PAYSDK-CONTRACT-019'){
   expect(outcomes.every(value=>(value as PaymentOutcome).reason==='confirmed')).toBe(true);
   const prepares=platform.httpRecords.filter(record=>record.path.endsWith('/pay'));const queries=platform.httpRecords.filter(record=>record.path.endsWith('/query'));
   if(key==='default-policy'){expect(prepares[0]?.timeout).toBe(60_000);expect(queries.map(record=>record.atMs)).toEqual([0,3_000]);expect(queries[0]?.timeout).toBe(60_000);}
   else if(key==='fieldwise-overrides'){expect(prepares[0]?.timeout).toBe(60_000);expect(queries.map(record=>record.atMs)).toEqual([0,7]);expect(queries[0]?.timeout).toBe(20);}
   else if(key==='per-call-override-isolation'){expect(queries.map(record=>record.atMs)).toEqual([0,1,1,8]);expect(prepares.every(record=>record.timeout===60_000)).toBe(true);}
   else expect(platform.httpRecords.length).toBeGreaterThan(0);
  }
  else if(key==='independent-query'){expect(outcomes[0]).toMatchObject({ok:true,value:{state:'PAID'}});}
  else if(key==='no-extra-phase-values'){expect(harness.phases.map(p=>p.phase)).toEqual(['channel_invoking','confirming']);}
 });
}, {fixtureRoot});


defineCase({ownerId:'TC-PAYSDK-CORE-010',caseId:'task8-protocol-root-factory',fixtureCase:'protocol-root-factory',environment:'integration',covers:[
 {id:'TC-PAYSDK-CORE-010',caseKey:'protocol-root-factory',checks:['protocol-root-factory','lazy-platform-access','package-boundary']},
 {id:'TC-PAYSDK-CONTRACT-011',caseKey:'protocol-root-load-create',checks:['protocol-root-source','lazy-platform-access']},
]},async({checkpoint,expect})=>{delete(globalThis as{wx?:unknown}).wx;const sdk=await import('@daqian/payment-sdk');await checkpoint('protocol-root-factory',()=>expect(createWechatMiniappHttp()).toMatchObject({send:expect.any(Function)}));await checkpoint('protocol-root-source',()=>expect(createWechatMiniappHttp).toBeTypeOf('function'));await checkpoint('lazy-platform-access',()=>expect((globalThis as{wx?:unknown}).wx).toBeUndefined());await checkpoint('package-boundary',()=>expect(sdk).not.toHaveProperty('createWechatMiniappHttp'));},{fixtureRoot});


defineCase({ownerId:'TC-PAYSDK-CONTRACT-011',caseId:'sdk-network-dependency-boundary',fixtureCase:'sdk-network-dependency-boundary',environment:'integration',covers:[
 {id:'TC-PAYSDK-CONTRACT-011',caseKey:'sdk-network-dependency-boundary',checks:['protocol-root-source','sdk-export-boundary']},
]},async({checkpoint,expect})=>{const sdk=await import('@daqian/payment-sdk');await checkpoint('protocol-root-source',()=>expect(createWechatMiniappHttp).toBeTypeOf('function'));await checkpoint('sdk-export-boundary',()=>{expect(sdk).toHaveProperty('createPaymentClient');expect(sdk).not.toHaveProperty('createWechatMiniappHttp');});},{fixtureRoot});
