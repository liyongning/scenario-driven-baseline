/**
 * 通用 Shadow 路由：只描述方法名、HTTP 方法与路径。
 * 引擎不依赖任何协议来源；ProtoGen 生成描述经 `idl-routes.ts` 转换后显式传给 Shadow 服务器。
 */
export type ShadowRoute = Readonly<{
  methodName: string;
  httpMethod: string;
  path: string;
}>;
