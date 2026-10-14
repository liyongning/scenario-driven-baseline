import Ajv2020 from 'ajv/dist/2020.js';
import { type OpenApiOperationContract, responseSchema } from './contract.ts';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export type NormalizeHook = (schema: unknown) => unknown;

function normalizeSchemaDefaults(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchemaDefaults);
  if (!isObject(value)) return value;
  const next: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'nullable') continue;
    if (key === '$ref' && typeof item === 'string' && item.startsWith('#/components/schemas/'))
      next.$ref = item.replace('#/components/schemas/', '#/$defs/');
    else if (key === 'exclusiveMinimum' && item === true && typeof value.minimum === 'number') {
      next.exclusiveMinimum = value.minimum;
    } else if (key === 'exclusiveMaximum' && item === true && typeof value.maximum === 'number') {
      next.exclusiveMaximum = value.maximum;
    } else next[key] = normalizeSchemaDefaults(item);
  }
  if (value.exclusiveMinimum === true) delete next.minimum;
  if (value.exclusiveMaximum === true) delete next.maximum;
  if (value.nullable === true) {
    if (typeof next.type === 'string') next.type = [next.type, 'null'];
    else if (Array.isArray(next.type) && !next.type.includes('null')) next.type.push('null');
    if (Array.isArray(next.enum) && !next.enum.includes(null)) next.enum.push(null);
    if (
      Array.isArray(next.oneOf) &&
      !next.oneOf.some((branch) => isObject(branch) && branch.type === 'null')
    )
      next.oneOf.push({ type: 'null' });
    if (
      Array.isArray(next.anyOf) &&
      !next.anyOf.some((branch) => isObject(branch) && branch.type === 'null')
    )
      next.anyOf.push({ type: 'null' });
  }
  return next;
}

/** 把 OAS 3.0 写法规范化为 Ajv 2020 可校验的 JSON Schema；钩子在默认规范化后按顺序生效。 */
export function normalizeSchema(value: unknown, hooks: ReadonlyArray<NormalizeHook> = []): unknown {
  return hooks.reduce((schema, hook) => hook(schema), normalizeSchemaDefaults(value));
}

const validators = new Map<string, (value: unknown) => string[]>();

function validatorFor(
  operation: OpenApiOperationContract,
  status: number,
  hooks: ReadonlyArray<NormalizeHook>,
) {
  const key = `${operation.id}:${status}`;
  const cached = hooks.length === 0 ? validators.get(key) : undefined;
  if (cached) return cached;
  const schema = responseSchema(operation, status);
  if (!schema) {
    const missing = () => [`${operation.id}: HTTP ${status} 未声明响应 schema`];
    if (hooks.length === 0) validators.set(key, missing);
    return missing;
  }
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    formats: { int64: true },
  });
  const validate = ajv.compile({
    $defs: Object.fromEntries(
      Object.entries(operation.componentSchemas).map(([name, value]) => [
        name,
        normalizeSchema(value),
      ]),
    ),
    ...(normalizeSchema(schema, hooks) as JsonObject),
  });
  const check = (value: unknown): string[] => {
    if (!isObject(value)) return [`${operation.id}: 响应不是信封对象`];
    const extra = Object.keys(value).filter((name) => !['code', 'message', 'data'].includes(name));
    const issues = extra.map((name) => `${operation.id}: $.${name} 契约之外的信封字段`);
    if (validate(value)) return issues;
    issues.push(
      ...(validate.errors ?? []).map((error) => {
        const additional =
          typeof error.params.additionalProperty === 'string'
            ? `.${error.params.additionalProperty}`
            : '';
        return `${operation.id}: $${error.instancePath || ''}${additional} ${error.message ?? '不符合契约'}`;
      }),
    );
    return issues;
  };
  if (hooks.length === 0) validators.set(key, check);
  return check;
}

/** 创建严格同形校验器，并在校验前应用可扩展的规范化钩子。 */
export function createResponseValidator(
  operation: OpenApiOperationContract,
  hooks: ReadonlyArray<NormalizeHook> = [],
): (body: unknown, status: number) => string[] {
  return (body, status) => {
    const issues = validatorFor(operation, status, hooks)(body);
    if (!isObject(body)) return issues;
    const code = body.code;
    if (typeof code !== 'number') return issues;
    const allowed = new Set([0, ...operation.codes.map((name) => operation.codeTable[name])]);
    if (!allowed.has(code)) issues.push(`${operation.id}: 业务码 ${code} 不属于该接口`);
    return issues;
  };
}

/** 严格同形校验并按接口与状态码核对业务码。 */
export function validateResponse(
  operation: OpenApiOperationContract,
  body: unknown,
  status: number,
): string[] {
  return createResponseValidator(operation)(body, status);
}
