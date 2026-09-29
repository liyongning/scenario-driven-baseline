import { getPaymentBusinessError, paymentBusinessErrors } from '@daqian/payment-protocol';
import type { CommunicationError, DecodedHttpResponse } from '@daqian/payment-protocol';
import { GoodsType } from '@daqian/payment-protocol/generated/idl/infra/pay/v1/pay';
import { CreateTrade, CreateTradeRequest, QueryTrade, QueryTradeRequest, TradeStatus } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { CanonicalErrorCode } from '@daqian/payment-protocol/generated/idl/common/v1/enums';
import type { CreateTradeResponse, QueryTradeResponse } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import type { ExampleBackend, ExampleBackendResult, ExampleCreated, ExampleObserved, ExampleTradeBackendOptions } from '../ports/backend';

const errorMessages = {
  invalid_input: '示例参数无效', unauthorized: '访问令牌无效或缺失', host: '宿主上下文不可用',
  network: '网络请求失败', timeout: '请求超时', server: '服务端处理失败', protocol: '协议响应无效',
} as const;
function exampleError(category: keyof typeof errorMessages, details: { serverCode?: string; serverDescription?: string } = {}) {
  return { category, message: errorMessages[category], ...(details.serverCode === undefined ? {} : { serverCode: details.serverCode }), ...(details.serverDescription === undefined ? {} : { serverDescription: details.serverDescription }) };
}

function object(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function field(value: Record<string, unknown>, camel: string, snake: string): unknown { return Object.prototype.hasOwnProperty.call(value, camel) ? value[camel] : value[snake]; }
function int64(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return undefined;
}
function communication(error: CommunicationError): ExampleBackendResult<never> {
  switch (error.code) {
    case 'TIMEOUT': return { ok: false, error: exampleError('timeout'), retryable: true };
    case 'NETWORK_ERROR': return { ok: false, error: exampleError('network'), retryable: true };
    case 'EMPTY_ACCESS_TOKEN': return { ok: false, error: exampleError('unauthorized') };
    case 'HOST_CONTEXT_ERROR': return { ok: false, error: exampleError('host') };
    case 'CANCELLED': return { ok: false, cancelled: true };
    case 'CODEC_ERROR':
      if (error.http?.status === 401) return { ok: false, error: exampleError('unauthorized') };
      if (error.http && (error.http.status < 200 || error.http.status >= 300)) return { ok: false, error: { category: 'server', message: `服务端处理失败 (HTTP ${error.http.status})` } };
      return { ok: false, error: exampleError('protocol') };
  }
}
function business(statusCode: bigint, operation: 'create' | 'query'): ExampleBackendFailure {
  const descriptor = getPaymentBusinessError(statusCode);
  const category = descriptor?.canonicalCode === CanonicalErrorCode.CANONICAL_ERROR_CODE_UNAUTHORIZED ? 'unauthorized' : 'server';
  return {
    ok: false,
    error: exampleError(category, { serverCode: statusCode.toString(), ...(descriptor ? { serverDescription: descriptor.bizCodeName } : {}) }),
    ...(operation === 'query' && descriptor?.statusCode === paymentBusinessErrors.ErrInfraTradeQueryTradeUnavailable.statusCode && descriptor.retryable ? { retryable: true } : {}),
  };
}
type ExampleBackendFailure = Extract<ExampleBackendResult<never>, { ok: false }>;
function baseStatus<T extends { baseResp?: { statusCode: bigint } | undefined }>(value: DecodedHttpResponse<T>, operation: 'create' | 'query'): ExampleBackendResult<DecodedHttpResponse<T>> {
  const raw = object(value.wire);
  const rawBase = raw && object(field(raw, 'baseResp', 'base_resp'));
  const rawCode = rawBase && int64(field(rawBase, 'statusCode', 'status_code'));
  const dataCode = value.data.baseResp?.statusCode;
  if (rawCode === undefined || dataCode === undefined || rawCode !== dataCode) return { ok: false, error: exampleError('protocol') };
  if (value.http.status === 401) return { ok: false, error: exampleError('unauthorized') };
  if (dataCode !== 0n) return business(dataCode, operation);
  if (value.http.status < 200 || value.http.status >= 300) return { ok: false, error: { category: 'server', message: `服务端处理失败 (HTTP ${value.http.status})` } };
  return { ok: true, value };
}
function mapStatus(status: TradeStatus): 'pending' | 'completed' | 'closed' | 'unknown' {
  switch (status) {
    case TradeStatus.TRADE_STATUS_CREATED:
    case TradeStatus.TRADE_STATUS_PAYING: return 'pending';
    case TradeStatus.TRADE_STATUS_PAID: return 'completed';
    case TradeStatus.TRADE_STATUS_CLOSED: return 'closed';
    default: return 'unknown';
  }
}

/** 示例唯一的 generated 适配器；中立输入在这里映射为交易请求。 */
export function createExampleTradeBackend(options: ExampleTradeBackendOptions): ExampleBackend {
  return {
    async create(input, context) {
      const total = options.catalog.unitValue * BigInt(input.units);
      const request = CreateTradeRequest.create({
        bizType: options.catalog.kind,
        bizTradeNo: input.externalRef,
        userId: BigInt(input.ownerId),
        goodsType: GoodsType.GOODS_TYPE_VIRTUAL,
        payAmount: total,
        originalAmount: total,
        discountAmount: 0n,
        items: [{ bizOrderNo: `${input.externalRef}-1`, skuId: options.catalog.itemId, skuName: options.catalog.itemName, quantity: input.units, unitPrice: options.catalog.unitValue, discountAmount: 0n, payAmount: total }],
      });
      const result = await options.protocol.request(CreateTrade.meta, request, context);
      if (!result.ok) return communication(result.error);
      const normalized = baseStatus({ ...result.value, data: result.value.data as CreateTradeResponse }, 'create');
      if (!normalized.ok) return normalized;
      const response = normalized.value.data as CreateTradeResponse;
      const wire = object(normalized.value.wire);
      if (!response.tradeNo || field(wire!, 'tradeNo', 'trade_no') !== response.tradeNo) return { ok: false, error: exampleError('protocol') };
      return { ok: true, value: { reference: { id: response.tradeNo, externalRef: input.externalRef } } satisfies ExampleCreated };
    },
    async query(reference, context) {
      const request = QueryTradeRequest.create({ tradeNo: reference.id, syncChannel: false });
      const result = await options.protocol.request(QueryTrade.meta, request, context);
      if (!result.ok) return communication(result.error);
      const normalized = baseStatus({ ...result.value, data: result.value.data as QueryTradeResponse }, 'query');
      if (!normalized.ok) return normalized;
      const response = normalized.value.data as QueryTradeResponse;
      const trade = response.trade;
      const wire = object(normalized.value.wire);
      const rawTrade = wire && object(field(wire, 'trade', 'trade'));
      const rawTradeNo = rawTrade && field(rawTrade, 'tradeNo', 'trade_no');
      if (!trade || trade.tradeNo !== reference.id || rawTradeNo !== reference.id) return { ok: false, error: exampleError('protocol') };
      return { ok: true, value: { reference, state: mapStatus(trade.status) } satisfies ExampleObserved };
    },
  };
}
