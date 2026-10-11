import type { RpcMethodMeta } from '@daqian/template-protocol/generated/std';
// template-example:begin
import {
  CreateTrade,
  QueryTrade,
} from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';
// template-example:end

/**
 * 产品包消费的协议方法描述：generated 中由 `createMethod` 产出的方法常量。
 * 只有 `defineMethodSpec` 产出的方法没有 HTTP 元数据，派生协议义务时报错。
 */
export type ConsumedMethod = Readonly<{
  /** 方法常量携带的 `RpcMethodMeta`：接口名、HTTP 方法、路径、请求与响应类型及 codec。 */
  readonly meta: RpcMethodMeta<unknown, unknown>;
}>;

/** 请求字段的映射策略。 */
export type ConsumedRequestField = Readonly<{
  /** 已评审的映射方式：`mapped-value`、`fixed-value`、`omitted`、`generated-value`、`configured-value`。 */
  cases: ReadonlyArray<string>;
  /** 该映射方式的评审依据。 */
  authority: string;
}>;

/** 一条消费接口声明。 */
export type ConsumedOperation = Readonly<{
  /** 该接口的 generated 方法常量（由 `createMethod` 产出）。 */
  method: ConsumedMethod;
  /** 请求字段路径到映射策略的映射。 */
  requestFields: Readonly<Record<string, ConsumedRequestField>>;
}>;

// template-example:begin
/** 请求字段策略的评审依据；门禁不再按方法名保存这张表。 */
const requestAuthority =
  'protocol-contract Spec PC-01；本 Change Design“IDL 义务派生改为针对示例接口（任务 2）”';
// template-example:end

/** 产品包消费的协议接口：门禁据此派生协议义务并做声明与调用的双向对账。 */
export const consumedOperations: ReadonlyArray<ConsumedOperation> = [
  // template-example:begin
  {
    method: CreateTrade,
    requestFields: {
      biz_type: { cases: ['mapped-value'], authority: requestAuthority },
      biz_trade_no: { cases: ['mapped-value'], authority: requestAuthority },
      user_id: { cases: ['mapped-value'], authority: requestAuthority },
      goods_type: { cases: ['fixed-value'], authority: requestAuthority },
      pay_amount: { cases: ['mapped-value'], authority: requestAuthority },
      items: { cases: ['mapped-value'], authority: requestAuthority },
      'items.biz_order_no': { cases: ['mapped-value'], authority: requestAuthority },
      'items.sku_id': { cases: ['mapped-value'], authority: requestAuthority },
      'items.sku_name': { cases: ['mapped-value'], authority: requestAuthority },
      'items.quantity': { cases: ['mapped-value'], authority: requestAuthority },
      'items.unit_price': { cases: ['mapped-value'], authority: requestAuthority },
      'items.pay_amount': { cases: ['mapped-value'], authority: requestAuthority },
      'items.discount_amount': { cases: ['fixed-value'], authority: requestAuthority },
      'items.sku_snapshot': { cases: ['omitted'], authority: requestAuthority },
      'items.sku_snapshot.wechat_virtual_product_id': {
        cases: ['omitted'],
        authority: requestAuthority,
      },
      'items.sku_snapshot.biz_snapshot': { cases: ['omitted'], authority: requestAuthority },
      original_amount: { cases: ['mapped-value'], authority: requestAuthority },
      discount_amount: { cases: ['fixed-value'], authority: requestAuthority },
      base_req: { cases: ['generated-value'], authority: requestAuthority },
      'base_req.request_id': { cases: ['generated-value'], authority: requestAuthority },
      'base_req.product_id': {
        cases: ['configured-value', 'omitted'],
        authority: requestAuthority,
      },
    },
  },
  {
    method: QueryTrade,
    requestFields: {
      trade_no: { cases: ['mapped-value'], authority: requestAuthority },
      biz_type: { cases: ['omitted'], authority: requestAuthority },
      biz_trade_no: { cases: ['omitted'], authority: requestAuthority },
      sync_channel: { cases: ['omitted'], authority: requestAuthority },
      base_req: { cases: ['generated-value'], authority: requestAuthority },
      'base_req.request_id': { cases: ['generated-value'], authority: requestAuthority },
      'base_req.product_id': {
        cases: ['configured-value', 'omitted'],
        authority: requestAuthority,
      },
    },
  },
  // template-example:end
];
