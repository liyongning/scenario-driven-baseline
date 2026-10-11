import { createHash } from 'node:crypto';
import openapiTS, { astToString } from 'openapi-typescript';
import { parse as parseYaml } from 'yaml';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function array(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** 契约 lock 使用的 sha256 摘要。 */
export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function contractDocument(source: string): JsonObject {
  const parsed = parseYaml(source);
  const document = object(parsed);
  if (!document) throw new Error('OpenAPI contract must be a YAML object');
  return document;
}

/** 从契约读取版本；lock 与 status 共用该口径。 */
export function contractVersion(source: string): string {
  return stringValue(object(contractDocument(source).info)?.version);
}

/** 从契约读取标题；lock 与 status 共用该口径。 */
export function contractTitle(source: string, fallback: string): string {
  return stringValue(object(contractDocument(source).info)?.title, fallback);
}

function codeTable(document: JsonObject): ReadonlyMap<string, number> {
  const table = object(document['x-business-code-table']);
  if (!table) return new Map();
  return new Map(
    Object.entries(table).flatMap(([name, value]) =>
      typeof value === 'number' && Number.isInteger(value) ? [[name, value]] : [],
    ),
  );
}

function envelopeCodes(schema: unknown): number[] {
  const current = object(schema);
  if (!current) return [];
  const direct = object(current.properties)?.code;
  const directEnum = array(object(direct)?.enum).filter(
    (value): value is number => typeof value === 'number',
  );
  return [
    ...directEnum,
    ...array(current.allOf).flatMap((part) => envelopeCodes(part)),
    ...array(current.oneOf).flatMap((part) => envelopeCodes(part)),
  ];
}

function registeredEnvelopeCodes(document: JsonObject): number[] {
  const schemas = object(object(document.components)?.schemas) ?? {};
  return Object.entries(schemas).flatMap(([name, schema]) =>
    /envelope/i.test(name) ? envelopeCodes(schema) : [],
  );
}

type Operation = Readonly<{
  id: string;
  method: string;
  path: string;
  security: ReadonlyArray<unknown>;
  codes: ReadonlyArray<string>;
  declaredCodes: ReadonlyArray<string>;
  implemented: boolean;
}>;

function operations(document: JsonObject): Operation[] {
  const commonCodes = array(document['x-common-business-codes']).map(String);
  const discovered: Operation[] = [];
  for (const [path, pathItem] of Object.entries(object(document.paths) ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
      const operation = object(object(pathItem)?.[method]);
      if (!operation) continue;
      const id = stringValue(operation.operationId);
      const declaredCodes = array(operation['x-business-codes']).map(String);
      const codes = [...new Set([...declaredCodes, ...commonCodes])].sort();
      discovered.push({
        id,
        method,
        path,
        security: array(operation.security ?? document.security),
        codes,
        declaredCodes,
        implemented: operation['x-implemented'] !== false,
      });
    }
  }
  return discovered;
}

/** 校验信封码枚举与码表相等，并保证通用码和接口码都是码表子集。 */
export function checkContractConsistency(source: string) {
  const document = contractDocument(source);
  const issues: string[] = [];
  const table = codeTable(document);
  const tableCodes = [...new Set(table.values())].sort((left, right) => left - right);
  const envelope = [...new Set(registeredEnvelopeCodes(document))].sort(
    (left, right) => left - right,
  );
  if (JSON.stringify(envelope) !== JSON.stringify(tableCodes)) {
    issues.push(
      `envelope code enum ${JSON.stringify(envelope)} does not equal x-business-code-table ${JSON.stringify(tableCodes)}`,
    );
  }
  for (const code of array(document['x-common-business-codes']).map(String))
    if (!table.has(code))
      issues.push(`top-level ${code} is not registered in x-business-code-table`);
  for (const operation of operations(document)) {
    for (const code of operation.declaredCodes)
      if (!table.has(code))
        issues.push(`${operation.id} ${code} is not registered in x-business-code-table`);
  }
  return { document, issues };
}

function securitySource(security: ReadonlyArray<unknown>): string {
  return JSON.stringify(security);
}

/** 从契约生成三个精简生产文件；schema 仅含类型，operations 不携带描述或示例。 */
export async function generateContractFiles(source: string): Promise<Record<string, string>> {
  const document = contractDocument(source);
  const schema = astToString(
    await openapiTS(document as unknown as Parameters<typeof openapiTS>[0]),
  );
  const operationList = operations(document);
  const operationsSource = [
    '// Generated from the registered OpenAPI contract. Do not edit by hand.',
    '',
    ...operationList.flatMap((operation) => [
      `export const ${operation.id} = {`,
      '  meta: {',
      `    id: ${JSON.stringify(operation.id)},`,
      `    method: ${JSON.stringify(operation.method)},`,
      `    path: ${JSON.stringify(operation.path)},`,
      `    security: ${securitySource(operation.security)} as const,`,
      `    codes: ${JSON.stringify(operation.codes)} as const,`,
      `    implemented: ${String(operation.implemented)},`,
      '  },',
      '} as const;',
      '',
    ]),
  ].join('\n');
  const codeEntries = [...codeTable(document).entries()];
  const operationCodeEntries = operationList.map(
    (operation) => [operation.id, operation.codes] as const,
  );
  const codesSource = [
    '// Generated from the registered OpenAPI contract. Do not edit by hand.',
    '',
    'export const businessCodeTable = {',
    ...codeEntries.map(([name, value]) => `  ${name}: ${value},`),
    '} as const;',
    '',
    'export type BusinessCode = keyof typeof businessCodeTable;',
    '',
    'const operationCodeTable = {',
    ...operationCodeEntries.map(([id, codes]) => `  ${id}: ${JSON.stringify(codes)} as const,`),
    '} as const;',
    '',
    'export type OperationCodes<Id extends keyof typeof operationCodeTable> =',
    '  (typeof operationCodeTable)[Id][number];',
    '',
  ].join('\n');
  const normalizedSchema = `${schema.replace(/\n$/, '')}\n`;
  return {
    'src/generated/schema.d.ts': normalizedSchema,
    'src/generated/operations.ts': operationsSource,
    'src/generated/codes.ts': codesSource,
  };
}
