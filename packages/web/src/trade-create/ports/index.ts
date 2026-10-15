import type { Outcome, Trade } from '../../runtime/domain';

/** 创建交易表单提交的公开输入。 */
export interface CreateTradeInput {
  /** 当前 URL 指定的商户编号。 */
  readonly merchantId: number;
  /** 用户输入的整数金额，单位为分。 */
  readonly amount: number;
  /** Web 示例固定的下单渠道。 */
  readonly channel: 'WEB';
}

/** 创建交易的页面结果。 */
export type CreateTradeResult =
  | Readonly<{ kind: 'success'; trade: Trade }>
  | Readonly<{ kind: 'business-failure'; outcome: Exclude<Outcome, 'success'> }>
  | Readonly<{ kind: 'transport-failure' }>;

/** 创建交易端口；页面不感知协议包与网络适配器。 */
export interface CreateTradePort {
  submit(input: CreateTradeInput): Promise<CreateTradeResult>;
}
