import type { RpcMethodMeta } from '../../src/generated/std.ts';

/** 通用 Shadow 路由；由各业务按 generated metadata 发现后显式传给 Shadow 服务器。 */
export type ShadowRoute = Readonly<{
  methodName: string;
  httpMethod: string;
  path: string;
  meta: RpcMethodMeta<unknown, unknown>;
}>;
