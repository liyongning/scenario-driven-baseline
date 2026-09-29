import { expect, test } from 'vitest';
import { BaseResp } from './generated/idl/base';
import { CanonicalErrorCode } from './generated/idl/common/v1/enums';
import { PayParams, XpayEnv, xpayEnvFromJSON } from './generated/idl/infra/pay/v1/pay';
import { CreateTradePay, CreateTradePayRequest, QueryTrade } from './generated/idl/infra/trade/v1/trade';

test('生成请求保留省略、沙箱和现网三态，未设置不编码为零值', () => {
  const omitted = CreateTradePayRequest.create();
  expect(omitted.xpayEnv).toBeUndefined();
  expect(CreateTradePayRequest.toJSON(omitted)).not.toHaveProperty('xpayEnv');
  expect(CreateTradePayRequest.toJSON({ ...omitted, xpayEnv: undefined })).not.toHaveProperty('xpayEnv');
  for (const xpayEnv of [XpayEnv.XPAY_ENV_SANDBOX, XpayEnv.XPAY_ENV_PROD]) {
    const wire = CreateTradePayRequest.toJSON({ ...omitted, xpayEnv });
    expect(wire).toHaveProperty('xpayEnv', xpayEnv);
    expect(CreateTradePayRequest.fromJSON(wire).xpayEnv).toBe(xpayEnv);
  }
  expect(xpayEnvFromJSON(1)).toBe(XpayEnv.XPAY_ENV_SANDBOX);
  expect(xpayEnvFromJSON(2)).toBe(XpayEnv.XPAY_ENV_PROD);
});

test('支付参数生成结构化 oneof，保留虚拟支付分支', () => {
  const params = PayParams.fromJSON({ wechatVirtual: {} });
  expect(params.params?.$case).toBe('wechatVirtual');
  expect(PayParams.toJSON(params)).toEqual({ wechatVirtual: {} });
});

test('实际消费方法直接提供请求与响应 codec，不调用全局 handler', () => {
  expect(CreateTradePay.meta).toMatchObject({ name: 'CreateTradePay', method: 'POST', path: '/api/base/trade/pay' });
  expect(QueryTrade.meta).toMatchObject({ name: 'QueryTrade', method: 'POST', path: '/api/base/trade/query' });
  expect(CreateTradePay.meta.requestCodec).toBe(CreateTradePayRequest);
  expect(CreateTradePay.meta.responseCodec.fromJSON({}).baseResp).toBeUndefined();
  expect(QueryTrade.meta.responseCodec.fromJSON({}).baseResp).toBeUndefined();
});

test('公共错误信封保留 int64 权威状态与 CanonicalErrorCode', () => {
  const decoded = BaseResp.fromJSON({ statusCode: '0', error: { canonicalCode: 'CANONICAL_ERROR_CODE_UNAUTHORIZED' } });
  expect(decoded.statusCode).toBe(0n);
  expect(decoded.error?.canonicalCode).toBe(CanonicalErrorCode.CANONICAL_ERROR_CODE_UNAUTHORIZED);
  expect(BaseResp.toJSON(decoded)).toHaveProperty('error.canonicalCode', 'CANONICAL_ERROR_CODE_UNAUTHORIZED');
});
