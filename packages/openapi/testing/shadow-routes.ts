import adapter from './adapter.ts';
import { operationById } from './contract.ts';

export type OpenApiOperationSource = Readonly<{
  meta: Readonly<{ id: string; method: string; path: string }>;
}>;
export type ShadowRoute = Readonly<{
  methodName: string;
  httpMethod: string;
  path: string;
  validateResponse?: (body: unknown, status: number) => string[];
}>;

/** 把 generated 描述常量转换为中立 Shadow 路由，并注入协议校验器。 */
export function routesFromOpenApiOperations(
  required: ReadonlyArray<OpenApiOperationSource>,
  candidates: ReadonlyArray<OpenApiOperationSource>,
): ShadowRoute[] {
  return required.map((operation) => {
    const id = operation.meta.id;
    const discovered = candidates.find((candidate) => candidate.meta.id === id);
    const contract = operationById(id);
    if (!discovered || !contract) throw new Error(`generated OpenAPI metadata is missing ${id}`);
    if (discovered.meta.method !== contract.method || discovered.meta.path !== contract.path)
      throw new Error(`generated OpenAPI metadata for ${id} does not match contract`);
    const validateResponse = adapter.responseValidator(discovered);
    if (!validateResponse)
      throw new Error(`generated OpenAPI metadata for ${id} has no response validator`);
    return {
      methodName: id,
      httpMethod: discovered.meta.method,
      path: discovered.meta.path,
      validateResponse,
    };
  });
}

/** 消费接口声明中的 `method` 已经是 generated 常量，直接遍历声明。 */
export function discoverOpenApiRoutes(
  declaration: ReadonlyArray<OpenApiOperationSource>,
): ShadowRoute[] {
  return routesFromOpenApiOperations(declaration, declaration);
}
