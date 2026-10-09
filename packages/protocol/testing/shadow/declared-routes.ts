import { routesFromRpcMethods, type RpcMethodSource } from './idl-routes.ts';
import type { ShadowRoute } from './routes.ts';

/**
 * 消费接口声明里的一条元素：只需要方法描述的 `meta`。
 * 类型从 IDL 路由来源派生，本文件不直接导入 generated，保证与协议来源解耦。
 */
export type DeclaredOperation = Readonly<{ readonly meta: RpcMethodSource }>;

/**
 * 由产品包的消费接口声明生成中立 Shadow 路由（PC-01）。
 * 声明为空时不产生路由；接口名、HTTP 方法与路径只从方法描述的 `meta` 读取，
 * 缺少方法、路径或请求 codec 时报错，不静默跳过。
 */
export function discoverDeclaredRoutes(
  declaration: ReadonlyArray<DeclaredOperation>,
): ShadowRoute[] {
  const methods = declaration.map((operation) => operation.meta);
  return routesFromRpcMethods(methods, methods);
}
