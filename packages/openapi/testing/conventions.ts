type JsonObject = Record<string, unknown>;

/** 约定模块规范化后的固定输出；生成器、适配器与门禁都只消费这一形状。 */
export type NormalizedContractConventions = Readonly<{
  codeTable: Readonly<Record<string, number>>;
  commonCodes: ReadonlyArray<string>;
  operationCodes: Readonly<Record<string, ReadonlyArray<string>>>;
  issues: ReadonlyArray<string>;
}>;

/** 约定模块可登记的单 schema 规范化钩子。 */
export type SchemaNormalizer = (schema: unknown) => unknown;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function array(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function codeName(code: number): string {
  return `CODE_${code}`;
}

function tableEntries(value: unknown): ReadonlyArray<readonly [string, number]> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isObject(item) || typeof item.code !== 'number' || !Number.isInteger(item.code))
        return [];
      const name =
        typeof item.name === 'string' && item.name.length > 0
          ? item.name
          : typeof item.meaning === 'string' && /^[A-Z][A-Z0-9_]*$/.test(item.meaning)
            ? item.meaning
            : codeName(item.code);
      return [[name, item.code] as const];
    });
  }
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([name, code]) =>
    typeof code === 'number' && Number.isInteger(code) ? ([[name, code] as const] as const) : [],
  );
}

function envelopeCodes(schema: unknown): number[] {
  if (!isObject(schema)) return [];
  const direct = isObject(schema.properties) ? schema.properties.code : undefined;
  const directEnum = array(isObject(direct) ? direct.enum : undefined).filter(
    (value): value is number => typeof value === 'number',
  );
  return [
    ...directEnum,
    ...array(schema.allOf).flatMap(envelopeCodes),
    ...array(schema.oneOf).flatMap(envelopeCodes),
  ];
}

function registeredEnvelopeCodes(document: JsonObject): number[] {
  const components = isObject(document.components) ? document.components : {};
  const schemas = isObject(components.schemas) ? (components.schemas as JsonObject) : {};
  return Object.entries(schemas).flatMap(([name, schema]) =>
    /envelope/i.test(name) ? envelopeCodes(schema) : [],
  );
}

function pathOperations(document: JsonObject): ReadonlyArray<JsonObject> {
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
  return Object.values(isObject(document.paths) ? document.paths : {}).flatMap((pathItem) =>
    methods.flatMap((method) => {
      const operation = isObject(pathItem) ? pathItem[method] : undefined;
      return isObject(operation) ? [operation] : [];
    }),
  );
}

function registeredName(
  value: unknown,
  table: ReadonlyMap<string, number>,
  issues: string[],
  location: string,
) {
  if (typeof value === 'string' && table.has(value)) return value;
  if (typeof value === 'number') {
    const found = [...table.entries()].find(([, code]) => code === value);
    if (found) return found[0];
  }
  issues.push(`${location} ${String(value)} 不在 x-business-code-table 中`);
  return undefined;
}

/** 默认团队约定：对象或数组码表、通用码与接口码都规范化为码名。 */
export function normalizeStandardContractConventions(
  value: unknown,
): NormalizedContractConventions {
  const document = isObject(value) ? value : {};
  const issues: string[] = [];
  const entries = tableEntries(document['x-business-code-table']);
  const table = new Map(entries);
  if (table.size !== entries.length) issues.push('x-business-code-table 存在重复码值或码名');
  const tableCodes = [...new Set(table.values())].sort((left, right) => left - right);
  const envelope = [...new Set(registeredEnvelopeCodes(document))].sort(
    (left, right) => left - right,
  );
  if (JSON.stringify(envelope) !== JSON.stringify(tableCodes)) {
    issues.push(
      `envelope code enum ${JSON.stringify(envelope)} does not equal x-business-code-table ${JSON.stringify(tableCodes)}`,
    );
  }
  const commonCodes = array(document['x-common-business-codes']).flatMap((value) => {
    const name = registeredName(value, table, issues, 'top-level');
    return name ? [name] : [];
  });
  const operationCodes: Record<string, string[]> = {};
  for (const operation of pathOperations(document)) {
    const operationId = operation.operationId;
    if (typeof operationId !== 'string') continue;
    operationCodes[operationId] = array(operation['x-business-codes']).flatMap((value) => {
      const name = registeredName(value, table, issues, operationId);
      return name ? [name] : [];
    });
  }
  return {
    codeTable: Object.fromEntries(entries),
    commonCodes,
    operationCodes,
    issues,
  };
}
