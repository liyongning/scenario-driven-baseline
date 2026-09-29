// TC CORE-011/012；CONTRACT-002–006/008/012–018/022–024；FLOW-006/008 的映射输入。
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createProtocolClient, type HttpRequest, type ProtocolClientOptions } from '@daqian/payment-protocol';
import * as subject from './backend';
import { createDefaultRuntime } from '../../runtime/default';
import type { DiagnosticEvent, PaymentError, PaymentRequest } from '../../contracts';
const valid = JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-014/valid.json', 'utf8'));
const omitted = JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-023/omitted.json', 'utf8'));
const sandbox = JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-023/sandbox.json', 'utf8'));
const prod = JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-023/prod.json', 'utf8'));
const query = JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-023/query-no-env.json', 'utf8'));
const same = JSON.parse(readFileSync('packages/e2e/tests/fixtures/FLOW-PAYSDK-006/same-payment.json', 'utf8'));
const different = JSON.parse(readFileSync('packages/e2e/tests/fixtures/FLOW-PAYSDK-006/different-payment.json', 'utf8'));
const messages: Readonly<Record<PaymentError['code'], string>> = {
 AUTH_REQUIRED:'登录状态已失效，请重新登录', IDENTITY_REQUIRED:'缺少微信支付身份，请先完成绑定', CHANNEL_SESSION_REQUIRED:'支付会话已失效，请重新发起支付',
 UNSUPPORTED:'当前环境或支付方式不受支持', BUSY:'当前交易正在支付中，请勿重复操作', INVALID_INPUT:'支付参数无效', HOST_CONTEXT_ERROR:'获取支付上下文失败',
 NETWORK_ERROR:'网络请求失败，请稍后重试', PROTOCOL_ERROR:'支付响应格式异常', CHANNEL_ERROR:'支付渠道调用失败', SERVER_ERROR:'支付服务处理失败',
 CONFLICT:'当前支付操作存在冲突', TIMEOUT:'支付请求超时，请稍后确认支付结果',
};
function expectedError(code:PaymentError['code'],source:PaymentError['source'],details:Partial<Omit<PaymentError,'code'|'source'|'message'>>={}):PaymentError {
 return {code,source,message:messages[code],...details};
}

const request:PaymentRequest={reference:{tradeNo:'trade-fixture-001'},method:'wechat-miniapp-virtual-goods'};
function setup(response: {status:number;body:unknown}=valid, overrides:Partial<ProtocolClientOptions>={}) {
 expect(subject).toHaveProperty('createPaymentBackend');
 const requests:HttpRequest[]=[]; const diagnostics:DiagnosticEvent[]=[]; const runtime=createDefaultRuntime();
 const client=createProtocolClient({gatewayBaseUrl:'https://fixture.invalid',getAccessToken:()=> 'fixture-token',requestContext:{productId:'fixture-product'},runtime:{...runtime,nextRequestId:()=> 'pay-fixture-1'},http:{send:async req=>{requests.push(req);return {ok:true,value:{...response,headers:{}}};}},...overrides});
 const backend=subject.createPaymentBackend({protocol:client,appId:'app-fixture',deviceInfo:{clientPlatform:()=> 'ios'},runtime,onDiagnostic:(event:DiagnosticEvent)=>{diagnostics.push(event);}});
 return {backend,requests,diagnostics};
}
function run(response: {status:number;body:unknown}, method:'prepare'|'query'='prepare') {
 const context=setup(response);return { ...context, result: method==='prepare'?context.backend.prepare(request,{deadlineAtMs:2000}):context.backend.query(request.reference,{deadlineAtMs:2000}) };
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(1000);});afterEach(()=>vi.useRealTimers());

test.each([[undefined,omitted],['sandbox',sandbox],['prod',prod]] as const)('prepare 唯一映射已有交易/method/appId/xpayEnv %s，签名逐字保持',async(env,fixture)=>{
 const {backend,requests}=setup(); expect(requests).toEqual([]);
 expect(await backend.prepare({...request,xpayEnv:env},{deadlineAtMs:2000})).toEqual({ok:true,value:{reference:request.reference,paymentNo:'payment-fixture-001',method:request.method,expiresAtMs:1800000000000,payParams:{kind:'wechat_virtual',...valid.body.payParams.wechatVirtual}}});
 expect(requests).toHaveLength(1);expect(JSON.parse(requests[0]!.body!)).toEqual(fixture.request);
 expect(requests[0]!.url).toBe('https://fixture.invalid/api/base/trade/pay');
});
test('query 只映射原交易事实，PAID 没有权益字段且不发送环境',async()=>{
 const response=JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-003/TRADE_STATUS_PAID.json','utf8'));
 const {backend,requests}=setup(response);
 expect(await backend.query(request.reference,{deadlineAtMs:2000})).toEqual({ok:true,value:{reference:request.reference,state:'PAID',source:'server',observedAtMs:1000,expiresAtMs:1800000000000}});
 expect(JSON.parse(requests[0]!.body!)).toEqual(query.request); expect(requests[0]!.url).toBe('https://fixture.invalid/api/base/trade/query');
});
test.each(['CREATED','PAYING','CLOSED','UNKNOWN','UNRECOGNIZED',99])('查询状态 %s 保留服务端事实；未知不伪造失败',async state=>{
 const body=structuredClone(query.response); (body.trade as {status:unknown}).status= typeof state==='number'?state:`TRADE_STATUS_${state}`;
 expect(await run({status:200,body},'query').result).toMatchObject({ok:true,value:{state:['CREATED','PAYING','CLOSED'].includes(String(state))?state:'UNKNOWN',source:'server'}});
});
test.each([same,different])('显式再次准备消费本次完整参数，不比较 paymentNo',async response=>{
 const replies=[valid,response];const requests:HttpRequest[]=[];
 const {backend}=setup(valid,{http:{send:async req=>{requests.push(req);return {ok:true,value:{...replies.shift()!,headers:{}}};}}});
 await backend.prepare(request,{deadlineAtMs:2000});
 expect(await backend.prepare(request,{deadlineAtMs:2000})).toMatchObject({ok:true,value:{paymentNo:response.body.paymentNo,payParams:{signature:response.body.payParams.wechatVirtual.signature,signData:valid.body.payParams.wechatVirtual.signData,paySig:valid.body.payParams.wechatVirtual.paySig}}});
 expect(requests).toHaveLength(2);
});
const errors=[
 ['ErrGatewayProxyInvalidParameter','INVALID_INPUT'],['ErrGatewayProxyUnauthorized','AUTH_REQUIRED'],['ErrGatewayProxyNotFound','SERVER_ERROR'],
 ['ErrInfraTradeCreateTradePayUnauthorized','AUTH_REQUIRED'],['ErrInfraTradeCreateTradePayNotFound','SERVER_ERROR'],['ErrInfraTradeCreateTradePayChannelUnavailable','UNSUPPORTED'],['ErrInfraTradeCreateTradePayConflict','CONFLICT'],['ErrInfraTradeCreateTradePayInvalidParameter','INVALID_INPUT'],['ErrInfraTradeCreateTradePayChannelPolicyInvalidParameter','CHANNEL_ERROR'],['ErrInfraTradeCreateTradePaySessionExpiredInvalidParameter','CHANNEL_SESSION_REQUIRED'],['ErrInfraTradeCreateTradePayChannelRejectedInvalidParameter','CHANNEL_ERROR'],['ErrInfraTradeCreateTradePayWxIdentityNotFound','IDENTITY_REQUIRED'],['ErrInfraTradeCreateTradePayUnavailable','SERVER_ERROR'],['ErrInfraTradeQueryTradeUnauthorized','AUTH_REQUIRED'],['ErrInfraTradeQueryTradeInvalidParameter','INVALID_INPUT'],['ErrInfraTradeQueryTradeNotFound','SERVER_ERROR'],['ErrInfraTradeQueryTradeUnavailable','SERVER_ERROR'],
] as const;
test.each(errors)('完整 Go wire 错误 %s → %s，不被 null payParams 覆盖',async(name,code)=>{
 const response=JSON.parse(readFileSync(`packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-017/${name}.json`,'utf8'));
 const {result,requests}=run(response,name.startsWith('ErrInfraTradeQuery')?'query':'prepare');
 expect(await result).toEqual({ok:false,error:expectedError(code,'gateway',{originalCode:response.body.baseResp.statusCode,retryable:name==='ErrInfraTradeCreateTradePayUnavailable'||name==='ErrInfraTradeQueryTradeUnavailable'}),...(name==='ErrInfraTradeQueryTradeUnavailable'?{cause:'query_unavailable'}:{})});
 expect(requests).toHaveLength(1);
});
test.each([[401,'AUTH_REQUIRED'],[403,'SERVER_ERROR'],[500,'SERVER_ERROR']])('HTTP %s 在状态 0/非法信封前判为 %s',async(status,code)=>{
 for(const body of [valid.body,{baseResp:{statusCode:'0'}},'not-json',null,{}]) {
  expect(await run({status:status as number,body}).result).toEqual({ok:false,error:expectedError(code as PaymentError['code'],'gateway',{originalCode:String(status)})});
 }
});
test.each([400,500])('非2xx %s 仍优先保留合法非零业务错误',async status=>{
 const response=JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-017/ErrInfraTradeCreateTradePayWxIdentityNotFound.json','utf8'));
 expect(await run({...response,status}).result).toMatchObject({ok:false,error:{code:'IDENTITY_REQUIRED',originalCode:'10100801002120',retryable:false}});
});
test.each([undefined,null,{},'bad','',true,false,{},[],9007199254740992,'9223372036854775808','-9223372036854775809','1.5','1e3'])('statusCode 原始非法值 %j 不能经 codec 默认/转换成功',async statusCode=>{
 const body={...valid.body,baseResp:{statusCode,success:true}};
 expect(await run({status:200,body}).result).toEqual({ok:false,error:expectedError('PROTOCOL_ERROR','gateway')});
});
test.each([null,{},[],false,'not-json',{baseResp:null},{baseResp:[]}])('无有效 2xx 信封 %j 返回协议错误',async body=>{
 expect(await run({status:200,body}).result).toEqual({ok:false,error:expectedError('PROTOCOL_ERROR','gateway')});
});
test('安全数字形式的 statusCode 与 expireTime 可无损消费',async()=>{
 const body={...valid.body,expireTime:1800000000000,baseResp:{statusCode:0,success:true}};
 expect(await run({status:200,body}).result).toMatchObject({ok:true,value:{expiresAtMs:1800000000000}});
});
test.each([false,undefined])('success=%s 与 statusCode=0 冲突只输出脱敏诊断',async success=>{
 const body={...valid.body,baseResp:{statusCode:'0',success,statusMsg:'sensitive',error:{bizCode:'20200002001020',message:'sensitive'}}};
 const {result,diagnostics}=run({status:200,body});expect(await result).toMatchObject({ok:true});
 expect(diagnostics).toEqual([{phase:'response-envelope-inconsistent',originalCode:'0'}]);
});
test('statusCode 非零是权威，矛盾 error 与 success 不改变身份与 retryable',async()=>{
 const body={...valid.body,baseResp:{statusCode:'10100801002100',success:true,error:{bizCode:'20200002001020',canonicalCode:'CANONICAL_ERROR_CODE_UNAUTHORIZED',retryable:true}}};
 const {result,diagnostics}=run({status:200,body});expect(await result).toMatchObject({ok:false,error:{code:'CHANNEL_SESSION_REQUIRED',retryable:false}});expect(diagnostics).toHaveLength(1);
});
test.each([true,false,undefined,'true'])('未知非零码仅采纳同码结构化布尔 retryable %s',async retryable=>{
 const body={baseResp:{statusCode:'9223372036854775807',success:false,error:{bizCode:'9223372036854775807',retryable}}};
 const expected=expectedError('SERVER_ERROR','gateway',{originalCode:'9223372036854775807',...(typeof retryable==='boolean'?{retryable}:{})});
 expect(await run({status:200,body}).result).toEqual({ok:false,error:expected});
});
test.each([undefined,'1'])('未知码缺少/矛盾 error 不猜重试或身份 %s',async bizCode=>{
 const body={baseResp:{statusCode:'99999999999999',success:false,error:bizCode?{bizCode,retryable:true,canonicalCode:'CANONICAL_ERROR_CODE_UNAUTHORIZED'}:undefined}};
 expect(await run({status:200,body}).result).toEqual({ok:false,error:expectedError('SERVER_ERROR','gateway',{originalCode:'99999999999999'})});
});
test.each([null,{},'{}',{unknown:{}},{wechatJsapi:{}},{wechatVirtual:valid.body.payParams.wechatVirtual,wechatNative:{}},{wechatVirtual:null}])('拒绝非法/缺失/多 oneof %j',async payParams=>{
 expect(await run({status:200,body:{...valid.body,payParams}}).result).toEqual({ok:false,error:expectedError('PROTOCOL_ERROR','gateway')});
});
test.each(['mode','signData','paySig','signature'])('拒绝四参数 %s 缺失/空/错类型',async field=>{
 for(const value of [undefined,null,'',false,123,{},[]]) {
  const body=structuredClone(valid.body);Object.assign(body.payParams.wechatVirtual,{[field]:value});
  expect(await run({status:200,body}).result).toEqual({ok:false,error:expectedError('PROTOCOL_ERROR','gateway')});
 }
});
test.each([['tradeNo','wrong'],['tradeNo',null],['paymentNo',''],['paymentNo',12],['channel','CHANNEL_WECHAT_NATIVE'],['expireTime','9007199254740992'],['expireTime',true],['expireTime',null]])('prepare 关联/时间 %s=%s 不合法',async(field,value)=>{
 expect(await run({status:200,body:{...valid.body,[field]:value}}).result).toEqual({ok:false,error:expectedError('PROTOCOL_ERROR','gateway')});
});
test('拒绝未知 mode，不能解析 signData 补字段',async()=>{
 const body=structuredClone(valid.body);body.payParams.wechatVirtual.mode='unknown';expect(await run({status:200,body}).result).toMatchObject({ok:false,error:{code:'PROTOCOL_ERROR'}});
});
test.each([null,{}, {tradeNo:'wrong',status:'TRADE_STATUS_PAID',expireTime:'1'}, {tradeNo:'trade-fixture-001',status:'TRADE_STATUS_PAID',expireTime:'9007199254740992'}])('query 非法快照 %j 不合成 PAID',async trade=>{
 expect(await run({status:200,body:{baseResp:{statusCode:'0',success:true},trade}},'query').result).toMatchObject({ok:false,error:{code:'PROTOCOL_ERROR'}});
});
test.each(['EMPTY_ACCESS_TOKEN','HOST_CONTEXT_ERROR','NETWORK_ERROR','TIMEOUT','CODEC_ERROR'] as const)('通信错误 %s 映射且没有隐式请求',async code=>{
 expect(subject).toHaveProperty('createPaymentBackend');
 const backend=subject.createPaymentBackend({protocol:{request:async()=>({ok:false,error:{code}})},appId:'app-fixture',deviceInfo:{clientPlatform:()=> 'unknown'},runtime:createDefaultRuntime()});
 const expected={EMPTY_ACCESS_TOKEN:['AUTH_REQUIRED','host'],HOST_CONTEXT_ERROR:['HOST_CONTEXT_ERROR','host'],NETWORK_ERROR:['NETWORK_ERROR','network'],TIMEOUT:['TIMEOUT','network'],CODEC_ERROR:['PROTOCOL_ERROR','gateway']}[code];
 expect(await backend.query(request.reference,{deadlineAtMs:2000})).toEqual({ok:false,error:expectedError(expected[0] as PaymentError['code'],expected[1] as PaymentError['source'])});
});
test.each([null,0,1,2,'','UNSPECIFIED','XPAY_ENV_SANDBOX','other'])('非法逐次环境 %s 在外部请求前拒绝',async xpayEnv=>{
 const {backend,requests}=setup();
 expect(await backend.prepare({...request,xpayEnv} as PaymentRequest,{deadlineAtMs:2000})).toEqual({ok:false,error:expectedError('INVALID_INPUT','sdk')});
 expect(requests).toEqual([]);
});
test('未知 method 不猜协议渠道',async()=>{
 const {backend,requests}=setup();expect(await backend.prepare({...request,method:'unknown'} as unknown as PaymentRequest,{deadlineAtMs:2000})).toEqual({ok:false,error:expectedError('UNSUPPORTED','sdk')});expect(requests).toEqual([]);
});

// CONTRACT-025：内部取消与时间错误分别验证两个入口，不由核心掩盖适配缺口。
test.each(['prepare','query'] as const)('%s 中性传递 CANCELLED，不能附加 PaymentError',async method=>{
 expect(subject).toHaveProperty('createPaymentBackend');
 const backend=subject.createPaymentBackend({protocol:{request:async()=>({ok:false,error:{code:'CANCELLED'}})},appId:'app-fixture',deviceInfo:{clientPlatform:()=> 'unknown'},runtime:createDefaultRuntime()});
 const result=method==='prepare'?await backend.prepare(request,{deadlineAtMs:2000}):await backend.query(request.reference,{deadlineAtMs:2000});
 expect(result).toEqual({ok:false,cancelled:true});
});
test.each(['prepare','query'] as const)('%s 保留通信 TIMEOUT，不变成 cancelled',async method=>{
 expect(subject).toHaveProperty('createPaymentBackend');
 const backend=subject.createPaymentBackend({protocol:{request:async()=>({ok:false,error:{code:'TIMEOUT'}})},appId:'app-fixture',deviceInfo:{clientPlatform:()=> 'unknown'},runtime:createDefaultRuntime()});
 const result=method==='prepare'?await backend.prepare(request,{deadlineAtMs:2000}):await backend.query(request.reference,{deadlineAtMs:2000});
 expect(result).toEqual({ok:false,error:expectedError('TIMEOUT','network')});
});

test.each(['absent','throw','reject'] as const)('矛盾信封诊断 %s 不改变支付结果，也不泄露 wire',async kind=>{
 const body={...valid.body,baseResp:{statusCode:'0',success:false}};
 const runtime=createDefaultRuntime();
 const onDiagnostic=vi.fn(()=>{if(kind==='throw') throw new Error('fixture diagnostic');return Promise.reject(new Error('fixture diagnostic'));});
 const protocol=createProtocolClient({gatewayBaseUrl:'https://fixture.invalid',getAccessToken:()=> 'fixture',runtime,http:{send:async()=>({ok:true,value:{status:200,headers:{},body}})}});
 const backend=subject.createPaymentBackend({protocol,appId:'fixture-app',deviceInfo:{clientPlatform:()=> 'unknown'},runtime,...(kind==='absent'?{}:{onDiagnostic})});
 expect(await backend.prepare(request,{deadlineAtMs:2000})).toMatchObject({ok:true});
 await vi.advanceTimersByTimeAsync(0);
 if(kind!=='absent') expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({phase:'response-envelope-inconsistent',originalCode:'0'});
});
test('双实例交错时网关、凭据、appId、设备、requestContext 和固定时钟 Request ID 均隔离',async()=>{
 const requests:HttpRequest[]=[];
 const runtimes=[createDefaultRuntime(),createDefaultRuntime()];
 const clients=['a','b'].map((name,index)=>{
  const runtime=runtimes[index]!;
  const protocol=createProtocolClient({gatewayBaseUrl:`https://${name}.invalid`,getAccessToken:()=>`fixture-${name}`,requestContext:{productId:name,lane:name,appVersion:name},runtime,http:{send:async value=>{requests.push(value);return {ok:true,value:{...valid,headers:{}}};}}});
  return subject.createPaymentBackend({protocol,appId:`app-${name}`,deviceInfo:{clientPlatform:()=>name==='a'?'ios':'android'},runtime});
 });
 await Promise.all([clients[0]!.prepare({...request,xpayEnv:'sandbox'},{deadlineAtMs:2000}),clients[1]!.prepare({...request,xpayEnv:'prod'},{deadlineAtMs:2000})]);
 await clients[0]!.prepare(request,{deadlineAtMs:2000});
 expect(requests).toHaveLength(3);
 expect(new Set(requests.map(value=>value.headers.request_id)).size).toBe(3);
 requests.forEach((value,index)=>{
  const name=index===1?'b':'a';const body=JSON.parse(value.body!);
  expect(value.headers.request_id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  expect(body).not.toHaveProperty('openId');expect(body).not.toHaveProperty('open_id');expect(body).not.toHaveProperty('userId');expect(body).not.toHaveProperty('user_id');
  expect(value.url).toBe(`https://${name}.invalid/api/base/trade/pay`);
  expect(value.headers).toMatchObject({Authorization:`Bearer fixture-${name}`,'X-Product-ID':name,lane:name,app_version:name});
  expect(body).toMatchObject({appId:`app-${name}`,clientPlatform:name==='a'?'ios':'android',baseReq:{productId:name,requestId:value.headers.request_id}});
  expect(body.baseReq).not.toHaveProperty('xpayEnv');expect(value.headers).not.toHaveProperty('xpayEnv');
 });
 expect(JSON.parse(requests[2]!.body!)).not.toHaveProperty('xpayEnv');
});

test.each(['wrong-trade','empty-payment','wrong-channel','unsafe-time','missing-oneof','legacy-string','wrong-oneof','multiple-oneof','missing-mode','missing-signData','missing-paySig','missing-signature'])('版本化完整防御 Fixture %s 拒绝进入渠道参数分支',async name=>{
 const fixture=JSON.parse(readFileSync(`packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-014/${name}.json`,'utf8'));
 expect(await run(fixture).result).toEqual({ok:false,error:expectedError('PROTOCOL_ERROR','gateway')});
});
test('服务端 CREATED 即使本地已过到期时间仍是 CREATED',async()=>{
 const fixture=JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-003/TRADE_STATUS_CREATED.json','utf8'));
 fixture.body.trade.expireTime='1';
 expect(await run(fixture,'query').result).toMatchObject({ok:true,value:{state:'CREATED',expiresAtMs:1}});
});

test('ProtoJSON 原字段名也通过生成 codec 无损解码，wire 只补 presence 校验',async()=>{
 const body={trade_no:valid.body.tradeNo,payment_no:valid.body.paymentNo,channel:valid.body.channel,expire_time:valid.body.expireTime,base_resp:{status_code:'0',success:true},pay_params:{wechat_virtual:{mode:valid.body.payParams.wechatVirtual.mode,sign_data:valid.body.payParams.wechatVirtual.signData,pay_sig:valid.body.payParams.wechatVirtual.paySig,signature:valid.body.payParams.wechatVirtual.signature}}};
 expect(await run({status:200,body}).result).toMatchObject({ok:true,value:{paymentNo:valid.body.paymentNo,payParams:{signData:valid.body.payParams.wechatVirtual.signData}}});
});
test('HTTP401 即使携带其他合法非零业务错误仍归业务鉴权',async()=>{
 const response=JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-017/ErrInfraTradeCreateTradePayWxIdentityNotFound.json','utf8'));
 expect(await run({...response,status:401}).result).toEqual({ok:false,error:expectedError('AUTH_REQUIRED','gateway',{originalCode:'401'})});
});
test('已知错误缺少 error 详情，仍使用固定 IDL 分类与 retryable',async()=>{
 const response=JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-017/ErrInfraTradeQueryTradeUnavailable.json','utf8'));
 delete response.body.baseResp.error;
 expect(await run(response,'query').result).toEqual({ok:false,error:expectedError('SERVER_ERROR','gateway',{originalCode:response.body.baseResp.statusCode,retryable:true}),cause:'query_unavailable'});
});

// CONTRACT-026：内部 cause 只标记已确认的本次查询语义，公开 error 保持原形。
const queryUnavailable = JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-017/ErrInfraTradeQueryTradeUnavailable.json', 'utf8'));
const prepareUnavailable = JSON.parse(readFileSync('packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-017/ErrInfraTradeCreateTradePayUnavailable.json', 'utf8'));
const queryUnavailableError = expectedError('SERVER_ERROR','gateway',{originalCode:queryUnavailable.body.baseResp.statusCode,retryable:true});

test.each([200,503])('CONTRACT-026 query HTTP %s 精确已知 Unavailable 添加内部恢复标签',async status=>{
 const {result,requests}=run({...queryUnavailable,status},'query');
 const actual=await result;
 expect(actual).toEqual({ok:false,error:queryUnavailableError,cause:'query_unavailable'});
 expect(actual).toHaveProperty('error',queryUnavailableError);
 expect(Object.keys('error' in actual?actual.error:{}).sort()).toEqual(['code','message','originalCode','retryable','source']);
 expect(requests).toHaveLength(1);
});
test.each(['conflict','missing'] as const)('CONTRACT-026 已知查询码 error 详情 %s 仍以固定 IDL 描述标记',async mode=>{
 const response=structuredClone(queryUnavailable);
 if(mode==='missing') delete response.body.baseResp.error;
 else {
  response.body.baseResp.success=true;
  response.body.baseResp.error={bizCode:prepareUnavailable.body.baseResp.statusCode,retryable:false,canonicalCode:'CANONICAL_ERROR_CODE_UNAUTHORIZED'};
 }
 expect(await run(response,'query').result).toEqual({ok:false,error:queryUnavailableError,cause:'query_unavailable'});
});
test.each([queryUnavailable,prepareUnavailable])('CONTRACT-026 prepare 收到任一 Unavailable 均不添加 cause 或重放',async response=>{
 const {result,requests}=run(response,'prepare');
 expect(await result).toEqual({ok:false,error:expectedError('SERVER_ERROR','gateway',{originalCode:response.body.baseResp.statusCode,retryable:true})});
 expect(requests).toHaveLength(1);
});
test('CONTRACT-026 query 收到其他方法 Unavailable，即使 retryable=true 也不添加 cause',async()=>{
 const {result,requests}=run(prepareUnavailable,'query');
 expect(await result).toEqual({ok:false,error:expectedError('SERVER_ERROR','gateway',{originalCode:prepareUnavailable.body.baseResp.statusCode,retryable:true})});
 expect(requests).toHaveLength(1);
});
test('CONTRACT-026 未知同码结构化 retryable=true 不冒充已确认查询恢复',async()=>{
 const response={status:200,body:{baseResp:{statusCode:'9876543210',success:false,error:{bizCode:'9876543210',retryable:true}}}};
 const {result,requests}=run(response,'query');
 expect(await result).toEqual({ok:false,error:expectedError('SERVER_ERROR','gateway',{originalCode:'9876543210',retryable:true})});
 expect(requests).toHaveLength(1);
});
test('CONTRACT-026 HTTP401 优先于可恢复业务码，无标签',async()=>{
 expect(await run({...queryUnavailable,status:401},'query').result).toEqual({ok:false,error:expectedError('AUTH_REQUIRED','gateway',{originalCode:'401'})});
});
test.each([{}, {baseResp:{statusCode:'0'}}, 'fixture invalid JSON'])('CONTRACT-026 HTTP503 无有效非零业务码 case %# 无标签',async body=>{
 expect(await run({status:503,body},'query').result).toEqual({ok:false,error:expectedError('SERVER_ERROR','gateway',{originalCode:'503'})});
});
test.each(['EMPTY_ACCESS_TOKEN','HOST_CONTEXT_ERROR','NETWORK_ERROR','TIMEOUT','CODEC_ERROR','CANCELLED'] as const)('CONTRACT-026 通信 %s 不产生查询业务 cause',async code=>{
 const backend=subject.createPaymentBackend({protocol:{request:async()=>({ok:false,error:{code}})},appId:'fixture',deviceInfo:{clientPlatform:()=> 'unknown'},runtime:createDefaultRuntime()});
 const result=await backend.query(request.reference,{deadlineAtMs:2000});
 expect(result.ok).toBe(false);expect(result).not.toHaveProperty('cause');
 if('error' in result) expect(result.error).not.toHaveProperty('cause');
});
test('不同预算实例交错等待 provider：短预算结束不取消长预算，迟到凭据不重放',async()=>{
 const make=(name:string)=>setup({status:200,body:query.response},{gatewayBaseUrl:`https://${name}.invalid`,getAccessToken:async()=>{
  await new Promise(resolve=>setTimeout(resolve,150));return `fixture-${name}`;
 }});
 const short=make('short');const long=make('long');
 const first=short.backend.query(request.reference,{deadlineAtMs:1100});
 const second=long.backend.query(request.reference,{deadlineAtMs:1400});
 await vi.advanceTimersByTimeAsync(100);
 expect(await first).toEqual({ok:false,error:expectedError('TIMEOUT','network')});
 expect(short.requests).toHaveLength(0);expect(long.requests).toHaveLength(0);
 await vi.advanceTimersByTimeAsync(50);
 expect(await second).toMatchObject({ok:true});
 expect(short.requests).toHaveLength(0);
 expect(long.requests).toHaveLength(1);
 expect(long.requests[0]).toMatchObject({url:'https://long.invalid/api/base/trade/query',timeoutMs:250,headers:{Authorization:'Bearer fixture-long'}});
 const third=short.backend.query(request.reference,{deadlineAtMs:1600});
 await vi.advanceTimersByTimeAsync(150);
 expect(await third).toMatchObject({ok:true});
 expect(short.requests).toHaveLength(1);
 expect(short.requests[0]).toMatchObject({url:'https://short.invalid/api/base/trade/query',timeoutMs:300,headers:{Authorization:'Bearer fixture-short'}});
 expect(long.requests).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
});
