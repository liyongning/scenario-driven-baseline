/** 协议侧产出的中立路由：只使用引擎公开的结构字段，不依赖测试包。 */
export type ShadowRoute = Readonly<{
  methodName: string;
  httpMethod: string;
  path: string;
  validateResponse?: (body: unknown, status: number) => string[];
}>;
