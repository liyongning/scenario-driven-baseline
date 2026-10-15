type JsonObject = Record<string, unknown>;

type CodeTableEntry = Readonly<{ code: number; meaning: string; message: string }>;

/** 产品契约替换后的约定输出；字段名保持模板约定的稳定形状。 */
export type NormalizedContractConventions = Readonly<{
  codeTable: Readonly<Record<string, number>>;
  commonCodes: ReadonlyArray<string>;
  operationCodes: Readonly<Record<string, ReadonlyArray<string>>>;
  issues: ReadonlyArray<string>;
}>;

function normalizeNullableNote(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeNullableNote);
  const schema = object(value);
  if (!schema) return value;
  const properties = object(schema.properties);
  const note = object(properties?.note);
  const normalized =
    note?.type === 'string' && note.minLength === 1
      ? {
          ...schema,
          properties: {
            ...properties,
            note: { ...note, type: ['string', 'null'] },
          },
        }
      : schema;
  return Object.fromEntries(
    Object.entries(normalized).map(([key, item]) => [key, normalizeNullableNote(item)]),
  );
}

/** 修正产品契约中组件字段的已知写法差异；仅用于响应 schema 校验。 */
export const schemaNormalizers = [normalizeNullableNote] as const;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function entries(value: unknown): ReadonlyArray<CodeTableEntry> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = object(item);
    if (
      !entry ||
      typeof entry.code !== 'number' ||
      !Number.isInteger(entry.code) ||
      typeof entry.meaning !== 'string' ||
      typeof entry.message !== 'string'
    )
      return [];
    return [
      {
        code: entry.code,
        meaning: entry.meaning,
        message: entry.message,
      },
    ];
  });
}

function names(value: unknown, byCode: ReadonlyMap<number, string>, issues: string[], where: string) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string' && [...byCode.values()].includes(item)) return [item];
    if (typeof item === 'number') {
      const name = byCode.get(item);
      if (name) return [name];
    }
    issues.push(`${where} ${String(item)} does not exist in x-business-code-table`);
    return [];
  });
}

function codeNumbers(schema: unknown): number[] {
  const source = object(schema);
  if (!source) return [];
  const properties = object(source.properties) ?? {};
  const code = object(properties.code);
  const direct = Array.isArray(code?.enum)
    ? code.enum.filter((item): item is number => typeof item === 'number')
    : [];
  return [
    ...direct,
    ...(Array.isArray(source.allOf) ? source.allOf.flatMap(codeNumbers) : []),
    ...(Array.isArray(source.oneOf) ? source.oneOf.flatMap(codeNumbers) : []),
  ];
}

function envelopeNumbers(document: JsonObject): number[] {
  const components = object(document.components);
  const schemas = object(components?.schemas) ?? {};
  return Object.values(schemas).flatMap(codeNumbers);
}

function operations(document: JsonObject): ReadonlyArray<JsonObject> {
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
  return Object.values(object(document.paths) ?? {}).flatMap((pathItem) =>
    methods.flatMap((method) => {
      const operation = object(object(pathItem)?.[method]);
      return operation ? [operation] : [];
    }),
  );
}

/** 替换后的码表把 message 字段规范化为稳定码名，并以数字扩展声明连接码表。 */
export function normalizeContractConventions(value: unknown): NormalizedContractConventions {
  const document = object(value) ?? {};
  const issues: string[] = [];
  const codeEntries = entries(document['x-business-code-table']);
  const byCode = new Map(codeEntries.map((entry) => [entry.code, entry.message]));
  if (byCode.size !== codeEntries.length) issues.push('x-business-code-table contains duplicate codes');
  const envelope = [...new Set(envelopeNumbers(document))].sort((left, right) => left - right);
  const tableCodes = [...byCode.keys()].sort((left, right) => left - right);
  if (JSON.stringify(envelope) !== JSON.stringify(tableCodes))
    issues.push('envelope code enum does not equal x-business-code-table codes');
  const operationCodes: Record<string, string[]> = {};
  for (const operation of operations(document)) {
    const id = operation.operationId;
    if (typeof id !== 'string') continue;
    operationCodes[id] = names(operation['x-business-codes'], byCode, issues, id);
  }
  return {
    codeTable: Object.fromEntries([...byCode.entries()].map(([code, name]) => [name, code])),
    commonCodes: names(document['x-common-business-codes'], byCode, issues, 'top-level'),
    operationCodes,
    issues,
  };
}
