import {
  mergeObjectSchema,
  resolveSchemaReference,
  schemaProperties,
  schemaRequired,
} from './contract.ts';

export type Presence = 'present' | 'present-or-null' | 'optional';
export type PresenceResult = Readonly<{
  pending: boolean;
  data: Presence;
  properties: Readonly<Record<string, Presence>>;
}>;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function dereference(schema: unknown): JsonObject {
  const source = isObject(schema) ? schema : {};
  return mergeObjectSchema(source.$ref ? resolveSchemaReference(source.$ref) : source);
}

function nullable(schema: unknown): boolean {
  const source = isObject(schema) ? schema : {};
  return source.nullable === true || (Array.isArray(source.type) && source.type.includes('null'));
}

function presence(schema: unknown, required: boolean): Presence {
  if (nullable(schema)) return 'present-or-null';
  return required ? 'present' : 'optional';
}

type UnionShape = Readonly<{ required: string[]; properties: Record<string, unknown> }>;

function unionShape(schema: JsonObject): UnionShape | undefined {
  const branches = (schema.oneOf ?? schema.anyOf) as unknown;
  if (!Array.isArray(branches)) return undefined;
  const shapes = branches.map((branch) => dereference(branch));
  const requiredSets = shapes.map((shape) => new Set(schemaRequired(shape)));
  const required = [...requiredSets[0]!].filter((name) =>
    requiredSets.every((names) => names.has(name)),
  );
  for (const candidate of shapes) {
    const candidateRequired = new Set(schemaRequired(candidate));
    const candidateProperties = new Set(Object.keys(schemaProperties(candidate)));
    const emptyShape = candidateRequired.size === 0 && candidateProperties.size === 0;
    const contains = shapes.every((other) => {
      const otherRequired = schemaRequired(other);
      const otherProperties = Object.keys(schemaProperties(other));
      return (
        emptyShape ||
        (otherRequired.every((name) => candidateRequired.has(name)) &&
          otherProperties.every((name) => candidateProperties.has(name)))
      );
    });
    if (!contains) continue;
    const properties: Record<string, unknown> = {};
    for (const shape of shapes) Object.assign(properties, schemaProperties(shape));
    return { required, properties };
  }
  return undefined;
}

/** 派生 data 本身及一级属性的出现性；不可判定联合明确返回 pending。 */
export function derivePresence(responseSchema: unknown): PresenceResult {
  const envelope = dereference(responseSchema);
  const dataSchema = schemaProperties(envelope).data;
  const data = presence(dataSchema, schemaRequired(envelope).includes('data'));
  const source = dereference(dataSchema);
  const union = unionShape(source);
  if ((source.oneOf ?? source.anyOf) !== undefined && !union) {
    return { pending: true, data, properties: {} };
  }
  const selected = union ?? {
    required: schemaRequired(source),
    properties: schemaProperties(source),
  };
  const required = new Set(selected.required);
  return {
    pending: false,
    data,
    properties: Object.fromEntries(
      Object.entries(selected.properties).map(([name, schema]) => [
        name,
        presence(schema, required.has(name)),
      ]),
    ),
  };
}
