import type { RpcMethodMeta } from '../../../src/generated/std.ts';
import { CreateTrade, QueryTrade } from '../../../src/generated/idl/infra/trade/v1/trade.ts';
import type { ShadowRoute } from '../routes.ts';

const consumed = [CreateTrade.meta, QueryTrade.meta] as const;

/** 从 generated metadata 发现示例创建与查询路由，测试基础设施不复制协议路径或 codec。 */
export function discoverExampleRoutes(candidates: ReadonlyArray<RpcMethodMeta<unknown, unknown>> = consumed): ShadowRoute[] {
  return consumed.map(required => {
    const discovered = candidates.find(candidate => candidate.name === required.name);
    if (!discovered) throw new Error(`generated metadata is missing ${required.name}`);
    if (!discovered.path || !discovered.method || !discovered.requestCodec) throw new Error(`generated metadata for ${required.name} is not an HTTP method`);
    return { methodName: required.name as ShadowRoute['methodName'], httpMethod: discovered.method, path: discovered.path, meta: discovered };
  });
}
