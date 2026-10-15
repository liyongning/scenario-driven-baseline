// web-example:begin
import { createTrade, getTrade, listTrades } from '@daqian/template-openapi/generated/operations';
// web-example:end

type RequestPolicy = Readonly<{ cases: ReadonlyArray<string>; authority: string }>;
type ConsumedOperation = Readonly<{
  method: unknown;
  requestFields: Readonly<Record<string, RequestPolicy>>;
}>;

/** Web 应用声明消费的协议接口；删除示例后保留为空数组骨架。 */
export const consumedOperations: ReadonlyArray<ConsumedOperation> = [
  // web-example:begin
  {
    method: createTrade,
    requestFields: {
      'body.merchant_id': { cases: ['mapped-value'], authority: 'url-context' },
      'body.amount': { cases: ['mapped-value'], authority: 'create-form' },
      'body.channel': { cases: ['fixed-value'], authority: 'web-example' },
      'header.X-Request-Id': { cases: ['generated-value'], authority: 'openapi-client' },
    },
  },
  {
    method: getTrade,
    requestFields: {
      'path.trade_no': { cases: ['mapped-value'], authority: 'current-trade' },
      'header.X-Request-Id': { cases: ['generated-value'], authority: 'openapi-client' },
    },
  },
  {
    method: listTrades,
    requestFields: {
      'path.merchant_id': { cases: ['mapped-value'], authority: 'url-context' },
      'header.X-Request-Id': { cases: ['generated-value'], authority: 'openapi-client' },
    },
  },
  // web-example:end
];
