/**
 * 通用 Shadow 路由：只描述方法名、HTTP 方法与路径。
 * 引擎不依赖任何协议来源；ProtoGen 生成描述经 `idl-routes.ts` 转换后显式传给 Shadow 服务器。
 */
export type ShadowRoute = Readonly<{
  methodName: string;
  httpMethod: string;
  path: string;
}>;

/**
 * 把路由路径中的 `{name}` 模板规范化为 express 的 `:name` 参数（PC-06）。
 * 转换后仍含 `{` 或 `}` 时抛错，避免注册出静默不可达或语义变化的路由。
 */
export function toExpressRoutePath(path: string): string {
  const converted = path.replace(/\{([^{}]+)\}/g, ':$1');
  if (/[{}]/.test(converted)) throw new Error(`shadow route path still contains braces: ${path}`);
  return converted;
}
