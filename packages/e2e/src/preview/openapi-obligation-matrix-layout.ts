import {
  responseSchema,
  type OpenApiContract,
  type OpenApiOperationContract,
} from '../../../openapi/testing/contract.ts';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

export function resolveSchema(
  value: unknown,
  schemas: Readonly<Record<string, unknown>>,
  seen = new Set<string>(),
): JsonObject | undefined {
  const source = object(value);
  if (!source) return undefined;
  if (typeof source.$ref === 'string' && source.$ref.startsWith('#/components/schemas/')) {
    const name = source.$ref.slice('#/components/schemas/'.length);
    if (seen.has(name)) return undefined;
    return resolveSchema(schemas[name], schemas, new Set([...seen, name]));
  }
  const allOf = Array.isArray(source.allOf) ? source.allOf : [];
  if (allOf.length > 0) {
    const required = new Set<string>();
    const properties: JsonObject = {};
    const merged: JsonObject = {};
    for (const part of allOf) {
      const resolved = resolveSchema(part, schemas, seen);
      if (!resolved) continue;
      for (const [key, value] of Object.entries(resolved)) {
        if (key === 'properties') {
          Object.assign(properties, object(value) ?? {});
          continue;
        }
        if (key === 'required') {
          for (const name of Array.isArray(value) ? value : [])
            if (typeof name === 'string') required.add(name);
          continue;
        }
        if (key === 'enum' && Array.isArray(merged.enum) && Array.isArray(value)) {
          merged.enum = merged.enum.filter((item) => value.includes(item));
          continue;
        }
        if (merged[key] === undefined) merged[key] = value;
      }
    }
    return {
      ...merged,
      ...source,
      ...(required.size > 0 ? { required: [...required] } : {}),
      properties,
    };
  }
  const alternatives = Array.isArray(source.oneOf)
    ? source.oneOf
    : Array.isArray(source.anyOf)
      ? source.anyOf
      : [];
  return alternatives.length > 0 ? resolveSchema(alternatives[0], schemas, seen) : source;
}

function schemaAllowsNull(
  value: unknown,
  schemas: Readonly<Record<string, unknown>>,
  seen = new Set<string>(),
): boolean {
  const source = object(value);
  if (!source) return false;
  if (typeof source.$ref === 'string' && source.$ref.startsWith('#/components/schemas/')) {
    const name = source.$ref.slice('#/components/schemas/'.length);
    if (seen.has(name)) return false;
    return schemaAllowsNull(schemas[name], schemas, new Set([...seen, name]));
  }
  if (
    source.nullable === true &&
    (typeof source.type === 'string' ||
      Array.isArray(source.type) ||
      Array.isArray(source.enum) ||
      Array.isArray(source.oneOf) ||
      Array.isArray(source.anyOf))
  )
    return true;
  if (source.type === 'null' || (Array.isArray(source.type) && source.type.includes('null')))
    return true;
  if (Array.isArray(source.enum) && source.enum.includes(null)) return true;
  const alternatives = Array.isArray(source.oneOf)
    ? source.oneOf
    : Array.isArray(source.anyOf)
      ? source.anyOf
      : [];
  if (alternatives.length > 0)
    return alternatives.some((alternative) => schemaAllowsNull(alternative, schemas, seen));
  const allOf = Array.isArray(source.allOf) ? source.allOf : [];
  return allOf.length > 0 ? allOf.every((part) => schemaAllowsNull(part, schemas, seen)) : false;
}

function successfulResponseDataSchema(
  contract: OpenApiContract,
  definition: OpenApiOperationContract,
): unknown {
  const envelope = resolveSchema(responseSchema(definition, 200), contract.componentSchemas);
  return object(envelope?.properties)?.data;
}

function successfulResponseDataAllowsNull(
  contract: OpenApiContract,
  definition: OpenApiOperationContract,
): boolean {
  return schemaAllowsNull(
    successfulResponseDataSchema(contract, definition),
    contract.componentSchemas,
  );
}

function operationContract(contract: OpenApiContract, operationId: string) {
  const found = contract.operations.find((item) => item.id === operationId);
  if (!found) throw new Error(`OpenAPI 契约中不存在接口 ${operationId}`);
  return found;
}

export type OpenApiMatrixResultStep = 'normal' | 'nullable' | 'network' | 'timeout' | 'cancelled';

export type OpenApiMatrixRecordStep = 'normal' | 'network' | 'timeout';

export type OpenApiMatrixResultIndexes = Readonly<{
  normal: number;
  nullable?: number;
  network: number;
  timeout: number;
  cancelled: number;
}>;

/** 返回客户端结果序列中各步骤的索引；成功 data 不允许 null 时省略 nullable 步骤。 */
export function matrixResultIndexes(
  contract: OpenApiContract,
  operationId: string,
  codeCount: number,
): OpenApiMatrixResultIndexes {
  const nullable = successfulResponseDataAllowsNull(
    contract,
    operationContract(contract, operationId),
  );
  const network = codeCount + (nullable ? 3 : 2);
  return {
    normal: 0,
    ...(nullable ? { nullable: codeCount + 2 } : {}),
    network,
    timeout: network + 1,
    cancelled: network + 2,
  };
}

export function matrixResultCount(
  contract: OpenApiContract,
  operationId: string,
  codeCount: number,
): number {
  return matrixResultIndexes(contract, operationId, codeCount).cancelled + 1;
}

export function matrixRecordIndexes(
  contract: OpenApiContract,
  operationId: string,
  codeCount: number,
): Readonly<Record<OpenApiMatrixRecordStep, number>> {
  const indexes = matrixResultIndexes(contract, operationId, codeCount);
  return { normal: indexes.normal, network: indexes.network, timeout: indexes.timeout };
}

export function matrixRecordCount(
  contract: OpenApiContract,
  operationId: string,
  codeCount: number,
): number {
  return matrixRecordIndexes(contract, operationId, codeCount).timeout + 1;
}
