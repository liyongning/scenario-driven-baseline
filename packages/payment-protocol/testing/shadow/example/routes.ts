import type { RpcMethodMeta } from '../../../src/generated/std.ts';
import { CreateTrade, QueryTrade } from '../../../src/generated/idl/infra/trade/v1/trade.ts';
import { routesFromRpcMethods } from '../idl-routes.ts';
import type { ShadowRoute } from '../routes.ts';

/** 示例协议消费的方法描述；测试基础设施不复制协议路径或 codec。 */
export const exampleRpcMethods = [CreateTrade.meta, QueryTrade.meta] as const;

/** 从 generated metadata 发现示例创建与查询路由，经 IDL 路由来源转换为中立路由。 */
export function discoverExampleRoutes(candidates: ReadonlyArray<RpcMethodMeta<unknown, unknown>> = exampleRpcMethods): ShadowRoute[] {
  return routesFromRpcMethods(exampleRpcMethods, candidates);
}
