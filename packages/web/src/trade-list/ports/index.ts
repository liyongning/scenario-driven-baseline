import type { Outcome, Trade } from '../../runtime/domain';

/** 查询商户交易列表的页面结果。 */
export type TradeListResult =
  | Readonly<{ kind: 'success'; items: ReadonlyArray<Trade> }>
  | Readonly<{ kind: 'business-failure'; outcome: Exclude<Outcome, 'success'> }>
  | Readonly<{ kind: 'transport-failure' }>;

/** 交易列表端口；页面不拼接协议路径。 */
export interface TradeListPort {
  list(merchantId: number): Promise<TradeListResult>;
}
