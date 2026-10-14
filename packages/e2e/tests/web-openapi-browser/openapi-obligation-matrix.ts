import type { RestOperation } from '@daqian/template-openapi';
import type { TestContext } from 'vitest';
import type { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import type { RunningShadowServer } from '../../src/shadow/index.ts';
import type { OpenApiContract } from '../../../openapi/testing/contract.ts';
import { matrixIdentity, matrixInput } from '../../src/preview/openapi-obligation-matrix.ts';

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

const requestIdPattern = /^\d{8}_\d{6}_\d{3}_[a-z]{6}$/;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
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
