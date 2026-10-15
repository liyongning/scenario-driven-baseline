import type { RestOperation } from '@daqian/template-openapi';
import {
  responseSchema,
  type OpenApiContract,
  type OpenApiOperationContract,
} from '../../../openapi/testing/contract.ts';
import { matrixResultIndexes, resolveSchema } from './openapi-obligation-matrix-layout.ts';

export type OpenApiMatrixStep = Readonly<{
  method: string;
  input: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  cancel?: 'before-send';
}>;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function sampleValue(
  value: unknown,
  schemas: Readonly<Record<string, unknown>>,
  depth = 0,
): unknown {
  if (depth > 12) return null;
  const source = resolveSchema(value, schemas);
  if (!source) return null;
  if (source.nullable === true && depth > 0) return null;
  if (Array.isArray(source.enum) && source.enum.length > 0) return source.enum[0];
  if (source.type === 'array') return [sampleValue(source.items, schemas, depth + 1)];
  if (source.type === 'integer' || source.type === 'number') return 1;
  if (source.type === 'boolean') return true;
  if (source.type === 'string') {
    if (typeof source.example === 'string') return source.example;
    const fits = (text: string) =>
      typeof source.pattern !== 'string' || new RegExp(source.pattern).test(text);
    const candidates = [
      'fixture-value',
      '1',
      'ABC',
      '',
      'a'.repeat(32),
      '00000000-0000-0000-0000-000000000000',
      'https://assets.template.invalid/fixture.svg',
    ];
    return candidates.find(fits) ?? 'fixture-value';
  }
  if (source.type === 'object' || object(source.properties)) {
    const properties = object(source.properties) ?? {};
    return Object.fromEntries(
      Object.entries(properties).map(([name, schema]) => [
        name,
        sampleValue(schema, schemas, depth + 1),
      ]),
    );
  }
  return {};
}

function operationContract(contract: OpenApiContract, operation: RestOperation) {
  const found = contract.operations.find((item) => item.id === operation.meta.id);
  if (!found) throw new Error(`OpenAPI 契约中不存在接口 ${operation.meta.id}`);
  return found;
}

/** 从当前契约派生矩阵输入；接口名、路径参数与请求体均不写死。 */
export function matrixInput(
  contract: OpenApiContract,
  operation: RestOperation,
): Readonly<Record<string, unknown>> {
  const definition = operationContract(contract, operation);
  const path = Object.fromEntries(
    definition.parameters.flatMap((parameter) =>
      parameter.in === 'path' && typeof parameter.name === 'string'
        ? [[parameter.name, sampleValue(parameter.schema, contract.componentSchemas)]]
        : [],
    ),
  );
  const body = definition.requestBody
    ? sampleValue(definition.requestBody, contract.componentSchemas)
    : undefined;
  return {
    ...(Object.keys(path).length > 0 ? { path } : {}),
    ...(body === undefined ? {} : { body }),
  };
}

function responseDataVariants(
  contract: OpenApiContract,
  definition: OpenApiOperationContract,
): ReadonlyArray<unknown> {
  const envelope = resolveSchema(responseSchema(definition, 200), contract.componentSchemas);
  const dataSchema = object(envelope?.properties)?.data;
  const source = object(dataSchema);
  const referenced =
    typeof source?.$ref === 'string' && source.$ref.startsWith('#/components/schemas/')
      ? object(contract.componentSchemas[source.$ref.slice('#/components/schemas/'.length)])
      : source;
  const alternatives = Array.isArray(referenced?.oneOf)
    ? referenced.oneOf
    : Array.isArray(referenced?.anyOf)
      ? referenced.anyOf
      : [];
  return alternatives.length > 0
    ? alternatives.map((alternative) => sampleValue(alternative, contract.componentSchemas))
    : [sampleValue(dataSchema, contract.componentSchemas)];
}

function minimalResponseData(
  contract: OpenApiContract,
  definition: OpenApiOperationContract,
): unknown {
  const envelope = resolveSchema(responseSchema(definition, 200), contract.componentSchemas);
  const dataSchema = object(envelope?.properties)?.data;
  const source = object(dataSchema);
  const referenced =
    typeof source?.$ref === 'string' && source.$ref.startsWith('#/components/schemas/')
      ? object(contract.componentSchemas[source.$ref.slice('#/components/schemas/'.length)])
      : source;
  const alternatives = Array.isArray(referenced?.oneOf)
    ? referenced.oneOf
    : Array.isArray(referenced?.anyOf)
      ? referenced.anyOf
      : [];
  const minimal = alternatives.reduce<JsonObject | undefined>((current, candidate) => {
    const schema = resolveSchema(candidate, contract.componentSchemas);
    if (!schema) return current;
    if (!current) return schema;
    const currentRequired = Array.isArray(current.required) ? current.required.length : 0;
    const candidateRequired = Array.isArray(schema.required) ? schema.required.length : 0;
    return candidateRequired < currentRequired ? schema : current;
  }, undefined);
  return sampleValue(minimal ?? dataSchema, contract.componentSchemas);
}

/** 为矩阵客户端选择当前契约中的一个身份方案；匿名接口不会携带该身份。 */
export function matrixIdentity(
  contract: OpenApiContract,
  operations?: Readonly<Record<string, RestOperation>>,
) {
  const declared = operations
    ? new Set(Object.values(operations).map((item) => item.meta.id))
    : undefined;
  const secured = contract.operations
    .filter((operation) => declared === undefined || declared.has(operation.id))
    .flatMap((operation) => operation.security);
  const scheme = secured.flatMap((requirement) => Object.keys(requirement))[0];
  return scheme ? ({ scheme, token: 'fixture-token' } as const) : undefined;
}

/** 当前契约登记的全部 apiKey 头；矩阵断言不再假设方案名或头名。 */
export function matrixSecuritySchemes(contract: OpenApiContract) {
  return Object.fromEntries(
    Object.entries(contract.securitySchemes).flatMap(([name, scheme]) =>
      scheme.type === 'apiKey' && scheme.in === 'header' && typeof scheme.name === 'string'
        ? [[name, { type: 'apiKey', in: 'header', name: scheme.name }] as const]
        : [],
    ),
  );
}

/** 每个声明接口使用同一序列：成功、各业务码、网络失败、超时、取消前发送。 */
export function matrixPlan(
  operations: Readonly<Record<string, RestOperation>>,
  contract: OpenApiContract,
): OpenApiMatrixStep[] {
  return Object.values(operations).flatMap((operation) => {
    const method = operation.meta.id;
    const codes = operation.meta.codes ?? [];
    const input = matrixInput(contract, operation);
    const nullable = matrixResultIndexes(contract, method, codes.length).nullable !== undefined;
    return [
      { method, input },
      ...codes.map(() => ({ method, input })),
      { method, input },
      ...(nullable ? [{ method, input }] : []),
      { method, input },
      { method, input, timeoutMs: 100 },
      { method, input, cancel: 'before-send' as const },
    ];
  });
}

/** Shadow 编排的步骤不包含取消前发送，因为该步骤在访问网络前结束。 */
export function matrixScenario(
  operations: Readonly<Record<string, RestOperation>>,
  contract: OpenApiContract,
) {
  return Object.fromEntries(
    Object.values(operations).map((operation) => {
      const method = operation.meta.id;
      const codes = operation.meta.codes ?? [];
      const definition = operationContract(contract, operation);
      const dataVariants = responseDataVariants(contract, definition);
      const success = dataVariants[0];
      const minimal = minimalResponseData(contract, definition);
      const nullable = matrixResultIndexes(contract, method, codes.length).nullable !== undefined;
      const responses = [
        { body: { code: 0, message: 'ok', data: success } },
        ...codes.map((code, index) => ({
          body: {
            code: contract.businessCodeTable[code],
            message: code,
            data: dataVariants[index % dataVariants.length],
          },
        })),
        { body: { code: 0, message: 'ok', data: minimal } },
        ...(nullable ? [{ body: { code: 0, message: 'ok', data: null } }] : []),
        { partialThenDisconnect: true },
        { delayMs: 250, body: { code: 0, message: 'late', data: success } },
      ];
      return [
        method,
        {
          expectedRequests: responses.map(() => ({ recordOnly: true })),
          steps: responses,
        },
      ];
    }),
  );
}
