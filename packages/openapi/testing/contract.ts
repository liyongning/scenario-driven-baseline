import { readFileSync } from 'node:fs';

type JsonObject = Record<string, unknown>;
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
}>;

type Bundle = Readonly<{
  info: Readonly<{ title: string }>;
  paths: Record<string, JsonObject>;
  components: Readonly<{
    securitySchemes?: Record<string, JsonObject>;
    schemas?: Record<string, unknown>;
  }>;
  'x-common-business-codes'?: ReadonlyArray<string>;
  'x-business-code-table'?: Readonly<Record<string, number>>;
}>;

export const contract = JSON.parse(
  readFileSync(new URL('./contract.bundle.json', import.meta.url), 'utf8'),
) as Bundle;

export const contractName = contract.info.title;
export const businessCodeTable = contract['x-business-code-table'] ?? {};
export const commonBusinessCodes = contract['x-common-business-codes'] ?? [];
export const securitySchemes = contract.components.securitySchemes ?? {};
export const componentSchemas = contract.components.schemas ?? {};

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

export const operations = Object.entries(contract.paths).flatMap(([path, pathItem]) =>
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
    const specific = Array.isArray(operation['x-business-codes'])
      ? operation['x-business-codes'].filter((item): item is string => typeof item === 'string')
      : [];
    const bodySchema = requestBody(operation);
    return [
      {
        id,
        method,
        path,
        security: Array.isArray(operation.security)
          ? (operation.security as OpenApiOperationContract['security'])
          : [],
        codes: [...new Set([...commonBusinessCodes, ...specific])],
        implemented: operation['x-implemented'] !== false,
        parameters,
        ...(bodySchema ? { requestBody: bodySchema } : {}),
        responses: Object.fromEntries(
          Object.entries(object(operation.responses) ?? {}).flatMap(([status, response]) => {
            const responseValue = object(response);
            return responseValue ? [[status, responseValue]] : [];
          }),
        ),
      } satisfies OpenApiOperationContract,
    ];
  }),
);

export function operationById(id: string): OpenApiOperationContract | undefined {
  return operations.find((operation) => operation.id === id);
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
export function resolveSchemaReference(reference: unknown): unknown {
  if (typeof reference !== 'string' || !reference.startsWith('#/components/schemas/'))
    return undefined;
  const name = reference.slice('#/components/schemas/'.length);
  return componentSchemas[name];
}

/** 合并 OpenAPI 常见的一层 allOf 对象字段，供 presence 派生读取。 */
export function mergeObjectSchema(schema: unknown): JsonObject {
  const source = object(schema) ?? {};
  const allOf = Array.isArray(source.allOf) ? source.allOf : [];
  if (allOf.length === 0) return source;
  const required = new Set<string>();
  const properties: Record<string, unknown> = {};
  for (const part of allOf) {
    const resolved = object(part)?.$ref ? resolveSchemaReference(object(part)?.$ref) : part;
    const objectPart = object(resolved) ?? {};
    const mergedPart = objectPart.allOf ? mergeObjectSchema(objectPart) : objectPart;
    for (const name of schemaRequired(mergedPart)) required.add(name);
    Object.assign(properties, schemaProperties(mergedPart));
  }
  return { ...source, required: [...required], properties };
}
