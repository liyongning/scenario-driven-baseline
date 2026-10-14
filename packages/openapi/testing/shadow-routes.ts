import adapter from './adapter.ts';
import { engineContract, operationByIdFrom, productContract } from './contract.ts';

export type OpenApiOperationSource = Readonly<{
  meta: Readonly<{ id: string; method: string; path: string }>;
}>;
export type ShadowRoute = Readonly<{
  methodName: string;
  httpMethod: string;
  path: string;
  validateResponse?: (body: unknown, status: number) => string[];
}>;

export type OpenApiRouteOptions = Readonly<{
  contractCarrier?: 'product' | 'engine';
}>;

/** 把 generated 描述常量转换为中立 Shadow 路由，并注入协议校验器。 */
export function routesFromOpenApiOperations(
  required: ReadonlyArray<OpenApiOperationSource>,
  candidates: ReadonlyArray<OpenApiOperationSource>,
  options: OpenApiRouteOptions = {},
): ShadowRoute[] {
  const contractCarrier = options.contractCarrier ?? 'product';
  const contract = contractCarrier === 'engine' ? engineContract : productContract();
  return required.map((operation) => {
    const id = operation.meta.id;
    const discovered = candidates.find((candidate) => candidate.meta.id === id);
    const operationContract = operationByIdFrom(contract, id);
    if (!discovered || !operationContract)
      throw new Error(`generated OpenAPI metadata is missing ${id}`);
    if (
      discovered.meta.method !== operationContract.method ||
      discovered.meta.path !== operationContract.path
    )
      throw new Error(`generated OpenAPI metadata for ${id} does not match contract`);
    const validateResponse = adapter.responseValidator(discovered, {
      manifest: { contractCarrier },
    });
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
  options: OpenApiRouteOptions = {},
): ShadowRoute[] {
  return routesFromOpenApiOperations(declaration, declaration, options);
}
