import type { RpcMethodMeta } from '../../src/generated/std.ts';
import { CreateTradePay, QueryTrade } from '../../src/generated/idl/infra/trade/v1/trade.ts';

export type ShadowRoute = Readonly<{
  methodName: 'CreateTradePay' | 'CreateTrade' | 'QueryTrade';
  httpMethod: string;
  path: string;
  meta: RpcMethodMeta<unknown, unknown>;
}>;

const consumed = [CreateTradePay.meta, QueryTrade.meta] as const;

/** 从 Consumer 生成 metadata 发现 SDK 实际消费的两个公网方法。 */
export function discoverPaymentRoutes(
  candidates: ReadonlyArray<RpcMethodMeta<unknown, unknown>> = consumed,
): ShadowRoute[] {
  return consumed.map(required => {
    const discovered = candidates.find(candidate => candidate.name === required.name);
    if (!discovered) throw new Error(`generated metadata is missing ${required.name}`);
    if (!discovered.path || !discovered.method || !discovered.requestCodec) {
      throw new Error(`generated metadata for ${required.name} is not an HTTP method`);
    }
    return {
      methodName: required.name as ShadowRoute['methodName'],
      httpMethod: discovered.method,
      path: discovered.path,
      meta: discovered,
    };
  });
}
