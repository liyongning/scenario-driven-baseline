import {
  createProtocolClient, createWechatMiniappHttp,
  type HttpPort, type OperationContext, type ProtocolClientOptions,
} from '@daqian/payment-protocol';
import type { TradeReference } from '@daqian/payment-sdk';
import {
  CreateTrade, TradeStatus, type CreateTradeRequest,
} from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { mapCreateTradeCode } from './create-trade-errors';

export type CreateTradeResult =
  | Readonly<{ kind: 'created'; reference: TradeReference }>
  | Readonly<{ kind: 'failed'; reason: 'auth' | 'invalid_input' | 'conflict' | 'invalid_response' | 'unavailable' | 'cancelled' }>;

export type CreateTradePort = Readonly<{ create(request: CreateTradeRequest, context: OperationContext): Promise<CreateTradeResult> }>;

export const unavailableCreateTradeMarker = 'PAYMENT_LIVE_CREATE_TRADE_UNAVAILABLE';

/** 8-A 失败关闭；真实 DTO/endpoint 只能在服务端契约登记后的 8-B 实现。 */
export function createUnavailableTradePort(): CreateTradePort {
  return { create: async () => { void unavailableCreateTradeMarker; return { kind: 'failed', reason: 'unavailable' }; } };
}

type CreateTradeOptions = Readonly<{
  createTradeUrl: string;
  getAccessToken: ProtocolClientOptions['getAccessToken'];
  requestContext?: ProtocolClientOptions['requestContext'];
  runtime: ProtocolClientOptions['runtime'];
  http?: HttpPort;
}>;

function int64(value: unknown): bigint | undefined {
  if (typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)) {
    const parsed = BigInt(value);
    return parsed <= 9223372036854775807n ? parsed : undefined;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return undefined;
}

const validStatuses = new Set<unknown>([
  1, 2, 3, 4,
  TradeStatus.TRADE_STATUS_CREATED, TradeStatus.TRADE_STATUS_PAYING,
  TradeStatus.TRADE_STATUS_PAID, TradeStatus.TRADE_STATUS_CLOSED,
]);

function validString(value: unknown, max: number): value is string {
  return typeof value === 'string' && Array.from(value).length >= 1 && Array.from(value).length <= max;
}

/** 真实创建只消费 generated metadata/codec；错误分类和成功载荷校验保留在 E2E 宿主。 */
export function createLiveCreateTradePort(options: CreateTradeOptions): CreateTradePort {
  const path = CreateTrade.meta.path;
  const gatewayBaseUrl = options.createTradeUrl.slice(0, -path.length);
  if (CreateTrade.meta.method !== 'POST' || CreateTrade.meta.path !== '/api/base/trade/create'
    || gatewayBaseUrl.length === 0 || gatewayBaseUrl.endsWith('/')
    || `${gatewayBaseUrl}${path}` !== options.createTradeUrl) throw new Error('CreateTrade generated binding does not match live config');
  const protocol = createProtocolClient({
    gatewayBaseUrl,
    getAccessToken: options.getAccessToken,
    ...(options.requestContext ? { requestContext: options.requestContext } : {}),
    runtime: options.runtime,
    http: options.http ?? createWechatMiniappHttp(),
  });
  return {
    async create(request, context) {
      const result = await protocol.request(CreateTrade.meta, request, context);
      if (!result.ok) {
        if (result.error.http?.status === 401) return { kind: 'failed', reason: 'auth' };
        if (result.error.code === 'CANCELLED') return { kind: 'failed', reason: 'cancelled' };
        if (result.error.code === 'EMPTY_ACCESS_TOKEN') return { kind: 'failed', reason: 'auth' };
        if (result.error.code === 'CODEC_ERROR' && result.error.http?.status !== undefined
          && result.error.http.status >= 200 && result.error.http.status < 300) return { kind: 'failed', reason: 'invalid_response' };
        return { kind: 'failed', reason: 'unavailable' };
      }
      const { http, wire, data } = result.value;
      if (http.status === 401) return { kind: 'failed', reason: 'auth' };
      const rawBaseResp = wire.baseResp;
      if (!rawBaseResp || typeof rawBaseResp !== 'object' || Array.isArray(rawBaseResp)) {
        return { kind: 'failed', reason: http.status >= 200 && http.status < 300 ? 'invalid_response' : 'unavailable' };
      }
      const statusCode = int64((rawBaseResp as Record<string, unknown>).statusCode);
      if (statusCode === undefined) return { kind: 'failed', reason: http.status >= 200 && http.status < 300 ? 'invalid_response' : 'unavailable' };
      if (statusCode !== 0n) return { kind: 'failed', reason: mapCreateTradeCode(statusCode) };
      if (http.status < 200 || http.status >= 300) return { kind: 'failed', reason: 'unavailable' };
      const rawOrders = wire.orderNos;
      if (!validString(wire.tradeNo, 25) || !Array.isArray(rawOrders) || rawOrders.length !== request.items.length
        || rawOrders.some(order => !validString(order, 25)) || new Set(rawOrders).size !== rawOrders.length
        || !validStatuses.has(wire.status)
        || !validString(data.tradeNo, 25) || data.orderNos.length !== request.items.length
        || data.status === TradeStatus.TRADE_STATUS_UNSPECIFIED || data.status === TradeStatus.UNRECOGNIZED) {
        return { kind: 'failed', reason: 'invalid_response' };
      }
      return { kind: 'created', reference: { tradeNo: data.tradeNo } };
    },
  };
}
