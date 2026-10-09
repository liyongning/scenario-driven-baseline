import type { RpcMethodMeta } from '../../src/generated/std.ts';
import type { ShadowRoute } from './routes.ts';

/** 由 ProtoGen 生成的方法描述；声明派生路由与 IDL 路由来源共用同一入参类型。 */
export type RpcMethodSource = RpcMethodMeta<unknown, unknown>;

/**
 * 把 ProtoGen 生成的方法描述转换为中立 Shadow 路由。
 * 缺少所需方法、路径、HTTP 方法或 request codec 时报错，不静默跳过。
 */
export function routesFromRpcMethods(
  required: ReadonlyArray<RpcMethodSource>,
  candidates: ReadonlyArray<RpcMethodSource>,
): ShadowRoute[] {
  return required.map((method) => {
    const discovered = candidates.find((candidate) => candidate.name === method.name);
    if (!discovered) throw new Error(`generated metadata is missing ${method.name}`);
    if (!discovered.path || !discovered.method || !discovered.requestCodec)
      throw new Error(`generated metadata for ${method.name} is not an HTTP method`);
    return { methodName: method.name, httpMethod: discovered.method, path: discovered.path };
  });
}
