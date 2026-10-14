import { createHash } from 'node:crypto';
import openapiTS, { astToString } from 'openapi-typescript';
import { parse as parseYaml } from 'yaml';

/** 协议约定模块的规范化输出；生成器与门禁只消费该中立形状。 */
export type NormalizedContractConventions = Readonly<{
  codeTable: Readonly<Record<string, number>>;
  commonCodes: ReadonlyArray<string>;
  operationCodes: Readonly<Record<string, ReadonlyArray<string>>>;
  issues: ReadonlyArray<string>;
}>;

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

type Operation = Readonly<{
  id: string;
  method: string;
  path: string;
  security: ReadonlyArray<unknown>;
  codes: ReadonlyArray<string>;
  declaredCodes: ReadonlyArray<string>;
  implemented: boolean;
}>;

function operations(document: JsonObject, conventions: NormalizedContractConventions): Operation[] {
  const discovered: Operation[] = [];
  for (const [path, pathItem] of Object.entries(object(document.paths) ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
      const operation = object(object(pathItem)?.[method]);
      if (!operation) continue;
      const id = stringValue(operation.operationId);
      const declaredCodes = [...(conventions.operationCodes[id] ?? [])];
      const codes = [...new Set([...declaredCodes, ...conventions.commonCodes])].sort();
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

/** 经约定模块校验契约；约定问题与结构问题的输出顺序稳定。 */
export function checkContractConsistency(
  source: string,
  conventions: NormalizedContractConventions,
) {
  const document = contractDocument(source);
  return { document, issues: [...conventions.issues] };
}

function securitySource(security: ReadonlyArray<unknown>): string {
  return JSON.stringify(security);
}

/** 从契约生成三个精简生产文件；schema 仅含类型，operations 不携带描述或示例。 */
export async function generateContractFiles(
  source: string,
  conventions: NormalizedContractConventions,
): Promise<Record<string, string>> {
  const document = contractDocument(source);
  const schema = astToString(
    await openapiTS(document as unknown as Parameters<typeof openapiTS>[0]),
  );
  const operationList = operations(document, conventions);
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
  const codeEntries = Object.entries(conventions.codeTable);
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
