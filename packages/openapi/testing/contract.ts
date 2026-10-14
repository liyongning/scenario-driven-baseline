import { readFileSync } from 'node:fs';
import { normalizeContractConventions as normalizeProductContractConventions } from '../contracts/conventions.ts';
import {
  normalizeStandardContractConventions,
  type NormalizedContractConventions,
} from './conventions.ts';

type JsonObject = Record<string, unknown>;

/** 运行时代理契约保留组件、码表与精简接口，供路由、适配器和响应校验共同消费。 */
export type OpenApiContract = Readonly<{
  bundle: OpenApiBundle;
  name: string;
  operations: ReadonlyArray<OpenApiOperationContract>;
  businessCodeTable: Readonly<Record<string, number>>;
  commonBusinessCodes: ReadonlyArray<string>;
  securitySchemes: Readonly<Record<string, JsonObject>>;
  componentSchemas: Readonly<Record<string, unknown>>;
}>;

export type OpenApiOperationContract = Readonly<{
  id: string;
  method: string;
  path: string;
  security: ReadonlyArray<Readonly<Record<string, readonly string[]>>>;
  codes: ReadonlyArray<string>;
  implemented: boolean;
  parameters: ReadonlyArray<JsonObject>;
  requestBody?: JsonObject;
  responses: Readonly<Record<string, JsonObject>>;
  codeTable: Readonly<Record<string, number>>;
  componentSchemas: Readonly<Record<string, unknown>>;
}>;

export type OpenApiBundle = Readonly<{
  info: Readonly<{ title: string }>;
  paths: Record<string, JsonObject>;
  components: Readonly<{
    securitySchemes?: Record<string, JsonObject>;
    schemas?: Record<string, unknown>;
  }>;
  'x-common-business-codes'?: ReadonlyArray<string | number>;
  'x-business-code-table'?: Readonly<Record<string, number>> | ReadonlyArray<JsonObject>;
}>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function requestBody(operation: JsonObject): JsonObject | undefined {
  const body = object(operation.requestBody);
  const content = object(body?.content);
  const json = object(content?.['application/json']);
  return object(json?.schema);
}

/** 从 bundle 与约定模块构造运行时契约；该对象不依赖模块位置之外的产品契约。 */
export function createOpenApiContract(
  bundle: OpenApiBundle,
  normalize: (value: unknown) => NormalizedContractConventions,
): OpenApiContract {
  const normalized = normalize(bundle);
  const componentSchemas = bundle.components.schemas ?? {};
  const securitySchemes = bundle.components.securitySchemes ?? {};
  const operations = Object.entries(bundle.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).flatMap(([method, value]) => {
      const operation = object(value);
      const id = operation?.operationId;
      if (!operation || typeof id !== 'string') return [];
      const parameters: JsonObject[] = [];
      if (Array.isArray(operation.parameters))
        for (const item of operation.parameters) {
          const parsed = object(item);
          if (parsed) parameters.push(parsed);
        }
      const specific = normalized.operationCodes[id] ?? [];
      const bodySchema = requestBody(operation);
      return [
        {
          id,
          method,
          path,
          security: Array.isArray(operation.security)
            ? (operation.security as OpenApiOperationContract['security'])
            : [],
          codes: [...new Set([...normalized.commonCodes, ...specific])],
          implemented: operation['x-implemented'] !== false,
          parameters,
          ...(bodySchema ? { requestBody: bodySchema } : {}),
          responses: Object.fromEntries(
            Object.entries(object(operation.responses) ?? {}).flatMap(([status, response]) => {
              const responseValue = object(response);
              return responseValue ? [[status, responseValue]] : [];
            }),
          ),
          codeTable: normalized.codeTable,
          componentSchemas,
        } satisfies OpenApiOperationContract,
      ];
    }),
  );
  return {
    bundle,
    name: bundle.info.title,
    operations,
    businessCodeTable: normalized.codeTable,
    commonBusinessCodes: normalized.commonCodes,
    securitySchemes,
    componentSchemas,
  };
}

function readBundle(path: URL): OpenApiBundle {
  return JSON.parse(readFileSync(path, 'utf8')) as OpenApiBundle;
}

/** 模板初始产品契约；使用方替换契约后只有本 bundle 变化，引擎契约不受影响。 */
export function productContract(): OpenApiContract {
  return createOpenApiContract(
    readBundle(new URL('./contract.bundle.json', import.meta.url)),
    normalizeProductContractConventions,
  );
}

/** 引擎测试契约；所有 OAS/BRW 引擎证据默认使用它。 */
export const engineContract = createOpenApiContract(
  readBundle(new URL('./engine/contract.bundle.json', import.meta.url)),
  normalizeStandardContractConventions,
);

export const contract = engineContract.bundle;
export const contractName = engineContract.name;
export const businessCodeTable = engineContract.businessCodeTable;
export const commonBusinessCodes = engineContract.commonBusinessCodes;
export const securitySchemes = engineContract.securitySchemes;
export const componentSchemas = engineContract.componentSchemas;
export const operations = engineContract.operations;

export function operationById(id: string): OpenApiOperationContract | undefined {
  return operations.find((operation) => operation.id === id);
}

export function operationByIdFrom(
  source: OpenApiContract,
  id: string,
): OpenApiOperationContract | undefined {
  return source.operations.find((operation) => operation.id === id);
}

export function responseSchema(
  operation: OpenApiOperationContract,
  status: number,
): unknown | undefined {
  const response = operation.responses[String(status)];
  const content = object(response?.content);
  const json = object(content?.['application/json']);
  return json?.schema;
}

export function schemaProperties(schema: unknown): Readonly<Record<string, unknown>> {
  return object(object(schema)?.properties) ?? {};
}

export function schemaRequired(schema: unknown): ReadonlyArray<string> {
  const required = object(schema)?.required;
  return Array.isArray(required)
    ? required.filter((item): item is string => typeof item === 'string')
    : [];
}

/** 解析本地 JSON Pointer；只接受 `#/components/schemas/...`。 */
export function resolveSchemaReference(
  reference: unknown,
  schemas: Readonly<Record<string, unknown>> = componentSchemas,
): unknown {
  if (typeof reference !== 'string' || !reference.startsWith('#/components/schemas/'))
    return undefined;
  const name = reference.slice('#/components/schemas/'.length);
  return schemas[name];
}

/** 合并 OpenAPI 常见的一层 allOf 对象字段，供 presence 派生读取。 */
export function mergeObjectSchema(
  schema: unknown,
  schemas: Readonly<Record<string, unknown>> = componentSchemas,
): JsonObject {
  const source = object(schema) ?? {};
  const allOf = Array.isArray(source.allOf) ? source.allOf : [];
  if (allOf.length === 0) return source;
  const required = new Set<string>();
  const properties: Record<string, unknown> = {};
  for (const part of allOf) {
    const reference = object(part)?.$ref;
    const resolved = reference ? resolveSchemaReference(reference, schemas) : part;
    const objectPart = object(resolved) ?? {};
    const mergedPart = objectPart.allOf ? mergeObjectSchema(objectPart, schemas) : objectPart;
    for (const name of schemaRequired(mergedPart)) required.add(name);
    Object.assign(properties, schemaProperties(mergedPart));
  }
  return { ...source, required: [...required], properties };
}
