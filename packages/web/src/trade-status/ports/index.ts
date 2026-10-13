import type { Outcome, Trade } from '../../runtime/domain';

/** 查询当前交易状态的页面结果。 */
export type TradeStatusResult =
  | Readonly<{ kind: 'success'; trade: Trade }>
  | Readonly<{ kind: 'business-failure'; outcome: Exclude<Outcome, 'success'> }>
  | Readonly<{ kind: 'transport-failure' }>;

/** 交易状态端口；页面只消费已归一化的结果。 */
export interface TradeStatusPort {
  get(tradeNo: string): Promise<TradeStatusResult>;
}
