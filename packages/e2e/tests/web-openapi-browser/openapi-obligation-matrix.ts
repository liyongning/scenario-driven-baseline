import type { RestOperation } from '@daqian/template-openapi';
import type { TestContext } from 'vitest';
import type { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import type { RunningShadowServer } from '../../src/shadow/index.ts';
import {
  responseSchema,
  type OpenApiContract,
  type OpenApiOperationContract,
} from '../../../openapi/testing/contract.ts';

type Inventory = Awaited<ReturnType<typeof buildContractInventory>>;
type Obligation = Inventory['obligations'][number];
type MatrixExpect = TestContext['expect'];
type Result = Readonly<{
  kind: 'success' | 'business-failure' | 'transport-failure';
  data?: unknown;
  code?: number | string;
  message?: string;
  reason?: string;
}>;
type ShadowRequestRecord = ReturnType<RunningShadowServer['records']>[number];

export type OpenApiMatrixStep = Readonly<{
  method: string;
  input: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  cancel?: 'before-send';
}>;

const requestIdPattern = /^\d{8}_\d{6}_\d{3}_[a-z]{6}$/;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function resolveSchema(
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
    for (const part of allOf) {
      const resolved = resolveSchema(part, schemas, seen);
      if (!resolved) continue;
      for (const name of Array.isArray(resolved.required) ? resolved.required : [])
        if (typeof name === 'string') required.add(name);
      Object.assign(properties, object(resolved.properties) ?? {});
    }
    return { ...source, ...(required.size > 0 ? { required: [...required] } : {}), properties };
  }
  const alternatives = Array.isArray(source.oneOf)
    ? source.oneOf
    : Array.isArray(source.anyOf)
      ? source.anyOf
      : [];
  return alternatives.length > 0 ? resolveSchema(alternatives[0], schemas, seen) : source;
}

type SampleMode = 'normal' | 'business' | 'nullable';

function sampleValue(
  value: unknown,
  schemas: Readonly<Record<string, unknown>>,
  mode: SampleMode,
  depth = 0,
): unknown {
  if (depth > 12) return null;
  const source = resolveSchema(value, schemas);
  if (!source) return null;
  if (source.nullable === true) return null;
  if (Array.isArray(source.enum) && source.enum.length > 0) return source.enum[0];
  if (Array.isArray(source.oneOf) && source.oneOf.length > 0)
    return sampleValue(source.oneOf[0], schemas, mode, depth + 1);
  if (Array.isArray(source.anyOf) && source.anyOf.length > 0)
    return sampleValue(source.anyOf[0], schemas, mode, depth + 1);
  if (source.type === 'array') return [sampleValue(source.items, schemas, mode, depth + 1)];
  if (source.type === 'integer' || source.type === 'number') return 1;
  if (source.type === 'boolean') return true;
  if (source.type === 'string') return 'fixture-value';
  if (source.type === 'object' || object(source.properties)) {
    const properties = object(source.properties) ?? {};
    const required = new Set(
      (Array.isArray(source.required) ? source.required : []).filter(
        (name): name is string => typeof name === 'string',
      ),
    );
    const optional = Object.keys(properties).find((name) => !required.has(name));
    return Object.fromEntries(
      Object.entries(properties).flatMap(([name, schema]) => {
        if (mode === 'business' && name === optional) return [];
        return [[name, sampleValue(schema, schemas, mode, depth + 1)] as const];
      }),
    );
  }
  return {};
}

function operationContract(contract: OpenApiContract, operation: RestOperation) {
  const found = contract.operations.find((item) => item.id === operation.meta.id);
  if (!found) throw new Error(`OpenAPI 契约中不存在接口 ${operation.meta.id}`);
  return found;
}

/** 从当前产品契约派生矩阵输入；接口名、路径参数与请求体均不写死。 */
export function matrixInput(
  contract: OpenApiContract,
  operation: RestOperation,
): Readonly<Record<string, unknown>> {
  const definition = operationContract(contract, operation);
  const path = Object.fromEntries(
    definition.parameters.flatMap((parameter) =>
      parameter.in === 'path' && typeof parameter.name === 'string'
        ? [[parameter.name, sampleValue(parameter.schema, contract.componentSchemas, 'normal')]]
        : [],
    ),
  );
  const body = definition.requestBody
    ? sampleValue(definition.requestBody, contract.componentSchemas, 'normal')
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
    ? alternatives.map((alternative) =>
        sampleValue(alternative, contract.componentSchemas, 'normal'),
      )
    : [sampleValue(dataSchema, contract.componentSchemas, 'normal')];
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
  return sampleValue(minimal ?? dataSchema, contract.componentSchemas, 'normal');
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

/** 当前产品契约登记的全部 apiKey 头；矩阵断言不再假设方案名或头名。 */
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
    const input = matrixInput(contract, operation);
    return [
      { method, input },
      ...(operation.meta.codes ?? []).map(() => ({ method, input })),
      { method, input },
      { method, input },
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
      const definition = operationContract(contract, operation);
      const dataVariants = responseDataVariants(contract, definition);
      const success = dataVariants[0];
      const minimal = minimalResponseData(contract, definition);
      const responses = [
        { body: { code: 0, message: 'ok', data: success } },
        ...(operation.meta.codes ?? []).map((code, index) => ({
          body: {
            code: contract.businessCodeTable[code],
            message: code,
            data: dataVariants[index % dataVariants.length],
          },
        })),
        { body: { code: 0, message: 'ok', data: minimal } },
        { body: { code: 0, message: 'ok', data: null } },
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

function obligationsFor(inventory: Inventory, operations: Readonly<Record<string, RestOperation>>) {
  const names = new Set(Object.keys(operations));
  return inventory.obligations.filter((item) => {
    const head = item.id.slice(0, item.id.indexOf('#'));
    return names.has(head.slice(head.lastIndexOf('.') + 1));
  });
}

/** 把每条声明的协议义务/case 写入用例 covers，供场景门禁逐项核验。 */
export function matrixCaseCovers(
  inventory: Inventory,
  operations: Readonly<Record<string, RestOperation>>,
) {
  return obligationsFor(inventory, operations).flatMap((obligation) =>
    obligation.cases.map((caseKey) => ({
      id: obligation.id,
      caseKey,
      checks: [`${obligation.id}/${caseKey}`],
    })),
  );
}

export function matrixObligationKeys(
  inventory: Inventory,
  operations: Readonly<Record<string, RestOperation>>,
) {
  return obligationsFor(inventory, operations).flatMap((obligation) =>
    obligation.cases.map((caseKey) => `${obligation.id}/${caseKey}`),
  );
}

type ResultStep = 'normal' | 'nullable' | 'network' | 'timeout' | 'cancelled';

function resultAt(
  results: ReadonlyArray<Result>,
  operation: RestOperation,
  step: ResultStep,
  codeNames: ReadonlyArray<string>,
) {
  const offset =
    step === 'normal'
      ? 0
      : step === 'nullable'
        ? codeNames.length + 2
        : step === 'network'
          ? codeNames.length + 3
          : step === 'timeout'
            ? codeNames.length + 4
            : codeNames.length + 5;
  const value = results[offset];
  if (!value) throw new Error(`${operation.meta.id} 义务矩阵缺少 ${step} 结果`);
  return value;
}

function recordAt(
  records: ReadonlyArray<ShadowRequestRecord>,
  operation: RestOperation,
  step: 'normal' | 'network' | 'timeout',
  codeNames: ReadonlyArray<string>,
) {
  const offset =
    step === 'normal' ? 0 : step === 'network' ? codeNames.length + 3 : codeNames.length + 4;
  const value = records[offset];
  if (!value) throw new Error(`${operation.meta.id} 义务矩阵缺少 ${step} 记录`);
  return value;
}

function bodyValue(body: unknown, key: string): unknown {
  let current = body;
  for (const part of key.slice('body.'.length).split('.')) {
    const source = object(current);
    if (!source) return undefined;
    current = source[part];
  }
  return current;
}

function expectedWireValue(input: Readonly<Record<string, unknown>>, key: string): unknown {
  if (key.startsWith('body.')) return bodyValue(input.body, key);
  if (key.startsWith('path.'))
    return (input.path as Readonly<Record<string, unknown>> | undefined)?.[
      key.slice('path.'.length)
    ];
  if (key.startsWith('header.'))
    return (input.header as Readonly<Record<string, unknown>> | undefined)?.[
      key.slice('header.'.length)
    ];
  throw new Error(`未知 request-fields 键 ${key}`);
}

function pathValue(recordPath: string, template: string, name: string): unknown {
  const actual = new URL(recordPath, 'http://fixture.invalid').pathname.split('/');
  const expected = template.split('/');
  if (actual.length !== expected.length) return undefined;
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index]!;
    if (segment.startsWith('{') && segment.endsWith('}') && segment.slice(1, -1) === name) {
      try {
        return decodeURIComponent(actual[index]!);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function actualWireValue(record: ShadowRequestRecord, pathTemplate: string, key: string): unknown {
  if (key.startsWith('header.')) return record.headers[key.slice('header.'.length).toLowerCase()];
  if (key.startsWith('body.')) return bodyValue(record.rawBody, key);
  if (key.startsWith('path.'))
    return pathValue(record.path, pathTemplate, key.slice('path.'.length));
  throw new Error(`未知 request-fields 键 ${key}`);
}

function dataObjects(results: ReadonlyArray<Result>) {
  return results.flatMap((result) =>
    (result.kind === 'success' || result.kind === 'business-failure') &&
    result.data !== null &&
    typeof result.data === 'object'
      ? [result.data as Record<string, unknown>]
      : [],
  );
}

function propertyName(key: string) {
  return key.slice('data.'.length);
}

function operationPathPattern(path: string) {
  const source = path
    .split(/(\{[^}]+\})/)
    .map((segment) =>
      segment.startsWith('{') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${source}$`);
}

async function checkpointObligation(
  obligation: Obligation,
  caseKey: string,
  context: Readonly<{
    operation: RestOperation;
    input: Readonly<Record<string, unknown>>;
    contract: OpenApiContract;
    identity: ReturnType<typeof matrixIdentity>;
    results: ReadonlyArray<Result>;
    records: ReadonlyArray<ShadowRequestRecord>;
    checkpoint: (name: string, assertion: () => void | Promise<void>) => Promise<void>;
    expect: MatrixExpect;
  }>,
) {
  const { operation, input, contract, identity, results, records, checkpoint, expect } = context;
  const [, category, key = '$'] = obligation.id.split('#');
  const codeNames = operation.meta.codes ?? [];
  await checkpoint(`${obligation.id}/${caseKey}`, () => {
    if (category === 'route') {
      const record = recordAt(records, operation, 'normal', codeNames);
      if (key === '$' && caseKey === 'method') {
        expect(record.methodName).toBe(operation.meta.id);
        expect(operation.meta.method).toMatch(/^(get|post|put|patch|delete)$/);
      } else if (key === '$' && caseKey === 'path') {
        expect(record.path).toMatch(operationPathPattern(operation.meta.path));
      } else {
        const path = input.path as Readonly<Record<string, unknown>> | undefined;
        expect(record.path).toContain(
          encodeURIComponent(String(path?.[key.slice('path.'.length)])),
        );
      }
      return;
    }
    if (category === 'identity') {
      const record = recordAt(records, operation, 'normal', codeNames);
      if (caseKey === 'anonymous') {
        for (const scheme of Object.values(contract.securitySchemes))
          if (typeof scheme.name === 'string')
            expect(record.headers[scheme.name.toLowerCase()]).toBeUndefined();
      } else {
        const scheme = caseKey.slice('header:'.length);
        const header = contract.securitySchemes[scheme]?.name;
        expect(typeof header).toBe('string');
        expect(record.headers[String(header).toLowerCase()]).toBe(identity?.token);
      }
      return;
    }
    if (category === 'request-headers') {
      const record = recordAt(records, operation, 'normal', codeNames);
      if (caseKey === 'content-type') {
        if (input.body === undefined) expect(record.headers['content-type']).toBeUndefined();
        else expect(record.headers['content-type']).toBe('application/json');
      } else if (caseKey === 'x-request-id-name') {
        expect(record.headers.request_id).toBeUndefined();
        expect(record.headers['x-request-id']).toBeDefined();
      } else if (caseKey === 'x-request-id-format') {
        expect(String(record.headers['x-request-id'])).toMatch(requestIdPattern);
      } else if (caseKey.startsWith('identity:')) {
        const scheme = caseKey.slice('identity:'.length);
        const header = contract.securitySchemes[scheme]?.name;
        expect(typeof header).toBe('string');
        expect(record.headers[String(header).toLowerCase()]).toBe(identity?.token);
      }
      return;
    }
    if (category === 'envelope') {
      const normal = resultAt(results, operation, 'normal', codeNames);
      if (caseKey === 'code') {
        expect(
          normal.kind,
          `${operation.meta.id} ${obligation.id}: ${JSON.stringify(normal)}`,
        ).toBe('success');
        expect(normal.code).toBeUndefined();
      } else if (caseKey === 'message') {
        expect(
          normal.kind,
          `${operation.meta.id} ${obligation.id}: ${JSON.stringify(normal)}`,
        ).toBe('success');
      } else {
        expect(
          normal.kind,
          `${operation.meta.id} ${obligation.id}: ${JSON.stringify(normal)}`,
        ).toBe('success');
        const nullable = resultAt(results, operation, 'nullable', codeNames);
        expect(nullable).toEqual({ kind: 'success', data: null });
      }
      return;
    }
    if (category === 'business-code') {
      const index = codeNames.indexOf(key);
      const result = results[index + 1];
      expect(result?.kind).toBe('business-failure');
      expect(result?.code).toBe(contract.businessCodeTable[key]);
      expect(typeof result?.message).toBe('string');
      return;
    }
    if (category === 'transport-failure') {
      const step =
        caseKey === 'network-error' ? 'network' : caseKey === 'timeout' ? 'timeout' : 'cancelled';
      const result = resultAt(results, operation, step, codeNames);
      const reason =
        caseKey === 'network-error'
          ? 'NETWORK_ERROR'
          : caseKey === 'timeout'
            ? 'TIMEOUT'
            : 'CANCELLED';
      expect(result).toEqual({ kind: 'transport-failure', reason });
      return;
    }
    if (category === 'request-fields') {
      const record = recordAt(records, operation, 'normal', codeNames);
      const actual = actualWireValue(record, operation.meta.path, key);
      const expected = expectedWireValue(input, key);
      if (caseKey === 'generated-value') {
        expect(actual).toBe(record.headers['x-request-id']);
        expect(String(actual)).toMatch(requestIdPattern);
      } else if (caseKey === 'omitted') {
        expect(actual).toBeUndefined();
      } else {
        expect(expected, `${operation.meta.id} ${obligation.id} 缺少期望输入`).toBeDefined();
        if (key.startsWith('path.')) expect(String(actual)).toBe(String(expected));
        else expect(actual).toEqual(expected);
      }
      return;
    }
    if (category === 'presence') {
      const objects = dataObjects(results);
      if (key === 'data') {
        expect(resultAt(results, operation, 'normal', codeNames).data).not.toBeNull();
      } else {
        const property = propertyName(key);
        const present = objects.some((item) =>
          Object.prototype.hasOwnProperty.call(item, property),
        );
        const absent = objects.some(
          (item) => !Object.prototype.hasOwnProperty.call(item, property),
        );
        if (caseKey === 'optional')
          expect(absent, `${operation.meta.id} ${obligation.id}: ${JSON.stringify(objects)}`).toBe(
            true,
          );
        else if (caseKey === 'present-or-null') {
          expect(present).toBe(true);
          expect(objects.some((item) => item[property] === null)).toBe(true);
        } else expect(present).toBe(true);
      }
      return;
    }
    throw new Error(`未知义务类别 ${obligation.id}`);
  });
}

/** 逐条义务断言真实结果与 Shadow 记录；结果序列来自公共客户端执行计划。 */
export async function assertMatrixObligations(
  context: Readonly<{
    inventory: Inventory;
    operations: Readonly<Record<string, RestOperation>>;
    results: ReadonlyArray<Result>;
    records: ReadonlyArray<ShadowRequestRecord>;
    contract: OpenApiContract;
    identity: ReturnType<typeof matrixIdentity>;
    expect: MatrixExpect;
    checkpoint: (name: string, assertion: () => void | Promise<void>) => Promise<void>;
  }>,
) {
  const { inventory, operations, results, records, expect, checkpoint, contract, identity } =
    context;
  const methodOrder = Object.keys(operations);
  const covered: string[] = [];
  for (const operation of Object.values(operations)) {
    const method = operation.meta.id;
    const codeNames = operation.meta.codes ?? [];
    const resultCount = codeNames.length + 6;
    const methodIndex = methodOrder.indexOf(method);
    const resultStart = methodOrder
      .slice(0, methodIndex)
      .reduce((count, id) => count + (operations[id]!.meta.codes?.length ?? 0) + 6, 0);
    const methodResults = results.slice(resultStart, resultStart + resultCount);
    const recordCount = codeNames.length + 5;
    const methodRecords = records
      .filter((record) => record.methodName === method)
      .slice(0, recordCount);
    const input = matrixInput(contract, operation);
    for (const obligation of obligationsFor(inventory, operations).filter(
      (item) =>
        item.id
          .slice(0, item.id.indexOf('#'))
          .slice(item.id.slice(0, item.id.indexOf('#')).lastIndexOf('.') + 1) === method,
    ))
      for (const caseKey of obligation.cases) {
        covered.push(`${obligation.id}/${caseKey}`);
        await checkpointObligation(obligation, caseKey, {
          operation,
          input,
          contract,
          identity,
          results: methodResults,
          records: methodRecords,
          checkpoint,
          expect,
        });
      }
  }
  return covered;
}
