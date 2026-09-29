import { getPaymentBusinessError, paymentBusinessErrors as errors } from '@daqian/payment-protocol';
import type { CommunicationError, CommunicationResult, DecodedHttpResponse, ProtocolClient } from '@daqian/payment-protocol';
import type { BaseResp } from '@daqian/payment-protocol/generated/idl/base';
import { Channel, XpayEnv } from '@daqian/payment-protocol/generated/idl/infra/pay/v1/pay';
import { CreateTradePay, CreateTradePayRequest, QueryTrade, QueryTradeRequest, TradeStatus } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import type { DiagnosticEvent, PaymentError, TradeState } from '../../contracts';
import type { BackendResult, PaymentBackend } from '../../ports/backend';
import type { DeviceInfoPort } from '../../ports/device-info';
import type { RuntimePort } from '../../ports/runtime';
import { createPaymentError } from '../../errors/payment-error';

type BackendOptions = Readonly<{
  protocol: ProtocolClient;
  appId: string;
  deviceInfo: DeviceInfoPort;
  runtime: Pick<RuntimePort, 'nowMs'>;
  onDiagnostic?: (event: DiagnosticEvent) => void;
}>;
type Failure = Extract<BackendResult<never>, { error: PaymentError }>;

// 支付错误分类的唯一映射。只比较 IDL 原始完整码，绝不从 canonical、文案或位段猜身份。
const classifications = new Map<bigint, PaymentError['code']>([
  [errors.ErrGatewayProxyUnauthorized.statusCode, 'AUTH_REQUIRED'],
  [errors.ErrInfraTradeCreateTradePayUnauthorized.statusCode, 'AUTH_REQUIRED'],
  [errors.ErrInfraTradeQueryTradeUnauthorized.statusCode, 'AUTH_REQUIRED'],
  [errors.ErrInfraTradeCreateTradePayWxIdentityNotFound.statusCode, 'IDENTITY_REQUIRED'],
  [errors.ErrInfraTradeCreateTradePaySessionExpiredInvalidParameter.statusCode, 'CHANNEL_SESSION_REQUIRED'],
  [errors.ErrInfraTradeCreateTradePayConflict.statusCode, 'CONFLICT'],
  [errors.ErrInfraTradeCreateTradePayChannelUnavailable.statusCode, 'UNSUPPORTED'],
  [errors.ErrGatewayProxyInvalidParameter.statusCode, 'INVALID_INPUT'],
  [errors.ErrInfraTradeCreateTradePayInvalidParameter.statusCode, 'INVALID_INPUT'],
  [errors.ErrInfraTradeQueryTradeInvalidParameter.statusCode, 'INVALID_INPUT'],
  [errors.ErrInfraTradeCreateTradePayChannelPolicyInvalidParameter.statusCode, 'CHANNEL_ERROR'],
  [errors.ErrInfraTradeCreateTradePayChannelRejectedInvalidParameter.statusCode, 'CHANNEL_ERROR'],
  [errors.ErrGatewayProxyNotFound.statusCode, 'SERVER_ERROR'],
  [errors.ErrInfraTradeCreateTradePayNotFound.statusCode, 'SERVER_ERROR'],
  [errors.ErrInfraTradeQueryTradeNotFound.statusCode, 'SERVER_ERROR'],
  [errors.ErrInfraTradeCreateTradePayUnavailable.statusCode, 'SERVER_ERROR'],
  [errors.ErrInfraTradeQueryTradeUnavailable.statusCode, 'SERVER_ERROR'],
]);
function failure(code: PaymentError['code'], source: PaymentError['source'], originalCode?: string): Failure {
  return { ok: false, error: createPaymentError(code, source, originalCode === undefined ? {} : { originalCode }) };
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
// wire 只补充生成 codec 可能抹去的 presence/类型信息；兼容 ProtoJSON 原始字段名。
function field(wire: Record<string, unknown>, camel: string, proto: string): unknown {
  return Object.prototype.hasOwnProperty.call(wire, camel) ? wire[camel] : wire[proto];
}
function int64(value: unknown): bigint | undefined {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return undefined;
  } else if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return undefined;
  const number = BigInt(value);
  return number >= -9223372036854775808n && number <= 9223372036854775807n ? number : undefined;
}
function milliseconds(value: unknown): number | undefined {
  const integer = int64(value);
  if (integer === undefined) return undefined;
  const number = Number(integer);
  return Number.isSafeInteger(number) ? number : undefined;
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function httpFailure(status: number): Failure {
  return failure(status === 401 ? 'AUTH_REQUIRED' : 'SERVER_ERROR', 'gateway', String(status));
}
function communication(error: CommunicationError): Exclude<BackendResult<never>, { ok: true }> {
  switch (error.code) {
    // CONTRACT-025：backend 只传递取消，不猜测停止原因，不携带伪造的 TIMEOUT。
    case 'CANCELLED': return { ok: false, cancelled: true };
    case 'EMPTY_ACCESS_TOKEN': return failure('AUTH_REQUIRED', 'host');
    case 'HOST_CONTEXT_ERROR': return failure('HOST_CONTEXT_ERROR', 'host');
    case 'NETWORK_ERROR': return failure('NETWORK_ERROR', 'network', error.originalCode);
    case 'TIMEOUT': return failure('TIMEOUT', 'network', error.originalCode);
    case 'CODEC_ERROR':
      return error.http && (error.http.status < 200 || error.http.status >= 300)
        ? httpFailure(error.http.status) : failure('PROTOCOL_ERROR', 'gateway');
  }
}
function businessError(statusCode: bigint, rawError: Record<string, unknown> | undefined, operation: 'prepare' | 'query'): Failure {
  const known = getPaymentBusinessError(statusCode);
  // 未知码只有在结构化详情与权威码一致时才保留布尔 retryable；分类仍为 SERVER_ERROR。
  const retryable = known ? known.retryable
    : rawError && int64(field(rawError, 'bizCode', 'biz_code')) === statusCode && typeof rawError.retryable === 'boolean' ? rawError.retryable : undefined;
  // 仅本次 query、权威完整码、固定 IDL 可恢复描述共同授权内部标签；wire 提示不能补授权。
  const queryUnavailable = errors.ErrInfraTradeQueryTradeUnavailable;
  const recoverableQuery = operation === 'query' && statusCode === queryUnavailable.statusCode && queryUnavailable.retryable === true;
  return { ok: false, ...(recoverableQuery ? { cause: 'query_unavailable' as const } : {}), error: createPaymentError(
    classifications.get(statusCode) ?? 'SERVER_ERROR', 'gateway', {
      originalCode: statusCode.toString(), ...(retryable === undefined ? {} : { retryable }),
    },
  ) };
}
function tradeState(status: TradeStatus): TradeState {
  switch (status) {
    case TradeStatus.TRADE_STATUS_CREATED: return 'CREATED';
    case TradeStatus.TRADE_STATUS_PAYING: return 'PAYING';
    case TradeStatus.TRADE_STATUS_PAID: return 'PAID';
    case TradeStatus.TRADE_STATUS_CLOSED: return 'CLOSED';
    // 未识别状态是 UNKNOWN，不认定失败，也不由本地到期合成 CLOSED。
    default: return 'UNKNOWN';
  }
}

/** 支付语义适配的唯一入口；Header/BaseReq/codec 归协议包，运行结束与恢复动作归核心。 */
export function createPaymentBackend(options: BackendOptions): PaymentBackend {
  const { protocol, appId, deviceInfo, runtime, onDiagnostic } = options;
  function inconsistent(statusCode: bigint): void {
    if (!onDiagnostic) return;
    try {
      // 仅输出阶段和原码；异常与异步拒绝隔离，绝不携带消息、wire 或支付签名。
      void Promise.resolve(onDiagnostic({ phase: 'response-envelope-inconsistent', originalCode: statusCode.toString() })).catch(() => {});
    } catch { /* 诊断回调不能改变支付响应判定。 */ }
  }
  function normalize<T extends { baseResp?: BaseResp | undefined }>(result: CommunicationResult<DecodedHttpResponse<T>>, operation: 'prepare' | 'query'): BackendResult<DecodedHttpResponse<T>> {
    if (!result.ok) return communication(result.error);
    const { http, wire, data } = result.value;
    if (http.status === 401) return httpFailure(http.status);
    const base = object(field(wire, 'baseResp', 'base_resp'));
    const statusCode = base && int64(field(base, 'statusCode', 'status_code'));
    const invalid = statusCode === undefined || data.baseResp?.statusCode !== statusCode;
    // 非 2xx 不能进入业务成功分支；可解码的非零业务码仍优先保留精确语义。
    if ((http.status < 200 || http.status >= 300) && (invalid || statusCode === 0n)) return httpFailure(http.status);
    if (invalid || !base) return failure('PROTOCOL_ERROR', 'gateway');
    const rawError = object(base.error);
    const descriptor = getPaymentBusinessError(statusCode);
    const errorConflict = rawError && (int64(field(rawError, 'bizCode', 'biz_code')) !== statusCode
      || descriptor !== undefined && data.baseResp?.error?.canonicalCode !== descriptor.canonicalCode);
    const statusMsg = field(base, 'statusMsg', 'status_msg');
    if (base.success !== (statusCode === 0n) || errorConflict
      || (statusCode === 0n ? base.error != null || statusMsg != null : statusMsg == null)) inconsistent(statusCode);
    if (statusCode !== 0n) return businessError(statusCode, rawError, operation);
    return result;
  }
  return {
    async prepare(request, context) {
      if (request.method !== 'wechat-miniapp-virtual-goods') return failure('UNSUPPORTED', 'sdk');
      if (request.xpayEnv !== undefined && request.xpayEnv !== 'sandbox' && request.xpayEnv !== 'prod') return failure('INVALID_INPUT', 'sdk');
      const req = CreateTradePayRequest.create({ tradeNo: request.reference.tradeNo, channel: Channel.CHANNEL_WECHAT_VIRTUAL, appId, clientPlatform: deviceInfo.clientPlatform() });
      // 本次选择唯一映射为 generated 具名枚举；省略分支不赋值，不改写任何签名原文。
      if (request.xpayEnv === 'sandbox') req.xpayEnv = XpayEnv.XPAY_ENV_SANDBOX;
      else if (request.xpayEnv === 'prod') req.xpayEnv = XpayEnv.XPAY_ENV_PROD;
      const result = normalize(await protocol.request(CreateTradePay.meta, req, context), 'prepare');
      if (!result.ok) return result;
      const { data, wire } = result.value;
      const rawParams = object(field(wire, 'payParams', 'pay_params'));
      const rawVirtual = rawParams && object(field(rawParams, 'wechatVirtual', 'wechat_virtual'));
      const params = data.payParams?.params;
      const expiresAtMs = milliseconds(field(wire, 'expireTime', 'expire_time'));
      // 先按 BaseResp 判错再校验成功参数；拒绝旧外层 string、多/错 oneof 与 codec 隐式转换。
      if (field(wire, 'tradeNo', 'trade_no') !== request.reference.tradeNo || data.tradeNo !== request.reference.tradeNo
        || !nonempty(field(wire, 'paymentNo', 'payment_no')) || !nonempty(data.paymentNo)
        || data.channel !== Channel.CHANNEL_WECHAT_VIRTUAL || !rawParams || Object.keys(rawParams).length !== 1
        || !rawVirtual || params?.$case !== 'wechatVirtual' || expiresAtMs === undefined
        || rawVirtual.mode !== 'short_series_goods'
        || !nonempty(field(rawVirtual, 'signData', 'sign_data')) || !nonempty(field(rawVirtual, 'paySig', 'pay_sig')) || !nonempty(rawVirtual.signature)) return failure('PROTOCOL_ERROR', 'gateway');
      return { ok: true, value: {
        reference: { tradeNo: data.tradeNo }, paymentNo: data.paymentNo, method: request.method, expiresAtMs,
        payParams: { kind: 'wechat_virtual', mode: 'short_series_goods', signData: params.wechatVirtual.signData, paySig: params.wechatVirtual.paySig, signature: params.wechatVirtual.signature },
      } };
    },
    async query(reference, context) {
      const result = normalize(await protocol.request(QueryTrade.meta, QueryTradeRequest.create({ tradeNo: reference.tradeNo }), context), 'query');
      if (!result.ok) return result;
      const { data, wire } = result.value;
      const rawTrade = object(wire.trade);
      const expiresAtMs = rawTrade && milliseconds(field(rawTrade, 'expireTime', 'expire_time'));
      if (!rawTrade || !data.trade || field(rawTrade, 'tradeNo', 'trade_no') !== reference.tradeNo || data.trade.tradeNo !== reference.tradeNo || expiresAtMs === undefined) return failure('PROTOCOL_ERROR', 'gateway');
      return { ok: true, value: { reference: { tradeNo: data.trade.tradeNo }, state: tradeState(data.trade.status), source: 'server', observedAtMs: runtime.nowMs(), expiresAtMs } };
    },
  };
}
