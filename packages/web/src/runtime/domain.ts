/** 示例交易的生命周期状态。 */
export type TradeStatus = 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

/** Web 示例使用的交易快照。 */
export interface Trade {
  /** 服务端稳定的交易号。 */
  readonly trade_no: string;
  /** 当前交易状态。 */
  readonly status: TradeStatus;
  /** 交易金额，单位为分。 */
  readonly amount: number;
  /** 交易所属商户编号。 */
  readonly merchant_id: number;
  /** 失败时的可读原因。 */
  readonly failure_reason?: string | null;
}

/** 示例页面面向用户展示的业务结果类别。 */
export type Outcome =
  'success' | 'invalid-request' | 'trade-not-found' | 'trade-conflict' | 'amount-limit-exceeded';

/** 判断交易是否已经到达不再轮询的终态。 */
export function isTerminalTrade(trade: Trade): boolean {
  return trade.status === 'SUCCEEDED' || trade.status === 'FAILED' || trade.status === 'CANCELLED';
}
