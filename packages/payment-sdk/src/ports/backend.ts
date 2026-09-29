import type { OperationContext } from '@daqian/payment-protocol';
import type { PaymentError, PaymentRequest, TradeReference, TradeSnapshot } from '../contracts';
export type ChannelPaymentParams = Readonly<{
  kind: 'wechat_virtual';
  mode: 'short_series_goods';
  signData: string;
  paySig: string;
  signature: string;
}>;
export type PreparedPayment = Readonly<{
  reference: TradeReference;
  paymentNo: string;
  method: string;
  payParams: ChannelPaymentParams;
  expiresAtMs?: number;
}>;
/** SDK 内部适配结果；查询恢复标签与通信取消不得泄漏到公开结果。 */
export type BackendResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{
  ok: false;
  error: PaymentError;
  /** 本次 QueryTrade 精确命中已确认可恢复的错误，仅由 backend 赋值。 */
  cause?: 'query_unavailable';
}> | Readonly<{
  /** 本次未取得业务结果，且没有可归为 PaymentError 的错误。 */
  ok: false;
  /** 中性通信取消信号，不证明宿主停止、超时或渠道取消。 */
  cancelled: true;
}>;
export interface PaymentBackend {
  prepare(request: PaymentRequest, context: OperationContext): Promise<BackendResult<PreparedPayment>>;
  query(reference: TradeReference, context: OperationContext): Promise<BackendResult<TradeSnapshot>>;
}
