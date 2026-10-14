import { engineContract, type OpenApiContract, type OpenApiOperationContract } from './contract.ts';
import { createResponseValidator } from './schema.ts';

type JsonObject = Record<string, unknown>;

type Claim = Readonly<{
  path: string;
  contract: string;
  malformed?: Readonly<{ reason: string }>;
}>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pathOf(base: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

function envelope(value: unknown): value is JsonObject {
  if (!isObject(value)) return false;
  return (
    typeof value.code === 'number' &&
    (Object.prototype.hasOwnProperty.call(value, 'message') ||
      Object.prototype.hasOwnProperty.call(value, 'data'))
  );
}

/** 收集形似信封的对象路径；遇到信封后不再深入。 */
function envelopes(root: unknown, base = '$'): Map<string, JsonObject> {
  const found = new Map<string, JsonObject>();
  if (envelope(root)) {
    found.set(base, root);
    return found;
  }
  if (Array.isArray(root)) {
    root.forEach((item, index) => {
      for (const [path, value] of envelopes(item, `${base}[${index}]`)) found.set(path, value);
    });
    return found;
  }
  if (isObject(root)) {
    for (const [key, value] of Object.entries(root)) {
      for (const [path, item] of envelopes(value, pathOf(base, key))) found.set(path, item);
    }
  }
  return found;
}

function valueAt(root: unknown, path: string): unknown {
  if (path === '$') return root;
  const parts = [...path.matchAll(/\.([A-Za-z_$][\w$]*)|\[(\d+)\]/g)];
  if (parts.length === 0 || path !== `$${parts.map((part) => part[0]).join('')}`) return undefined;
  let current = root;
  for (const part of parts) {
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string | number, unknown>)[part[1] ?? Number(part[2])];
  }
  return current;
}

function claimFrom(value: unknown, path: string): Claim | undefined {
  if (typeof value === 'string') return { path, contract: value };
  if (!isObject(value) || typeof value.contract !== 'string') return undefined;
  const malformed = isObject(value.malformed)
    ? { reason: typeof value.malformed.reason === 'string' ? value.malformed.reason : '' }
    : undefined;
  return { path, contract: value.contract, ...(malformed ? { malformed } : {}) };
}

function claims(manifest: unknown, document: unknown): Claim[] {
  const result: Claim[] = [];
  for (const source of [manifest, document]) {
    if (!isObject(source)) continue;
    if (typeof source.contract === 'string')
      for (const path of envelopes(document).keys())
        result.push({ path, contract: source.contract });
    if (isObject(source.envelopes))
      for (const [path, value] of Object.entries(source.envelopes)) {
        const claim = claimFrom(value, path);
        if (claim) result.push(claim);
      }
    if (
      isObject(source.malformed) &&
      Object.prototype.hasOwnProperty.call(source, 'body') &&
      typeof source.contract === 'string'
    )
      result.push({
        path: '$.body',
        contract: source.contract,
        malformed: {
          reason: typeof source.malformed.reason === 'string' ? source.malformed.reason : '',
        },
      });
  }
  return result;
}

function matchesAnyOperation(body: unknown, contract: OpenApiContract): string[] {
  return contract.operations.flatMap((operation) =>
    createResponseValidator(operation, contract.schemaNormalizers)(body, 200).length === 0
      ? [operation.id]
      : [],
  );
}

function validateClaim(
  claim: Claim,
  body: unknown,
  operation: OpenApiOperationContract | undefined,
  contract: OpenApiContract,
): string[] {
  if (claim.malformed) {
    if (claim.malformed.reason.trim() === '') return [`${claim.path}: malformed reason 不得为空`];
    const matches = matchesAnyOperation(body, contract);
    return matches.length === 0
      ? []
      : [`${claim.path}: malformed 实际符合接口 ${matches.join(', ')}`];
  }
  if (!operation) return [`${claim.path}: 未知接口 ${claim.contract}`];
  return createResponseValidator(operation, contract.schemaNormalizers)(body, 200).map(
    (issue) => `${claim.path}: ${issue}`,
  );
}

function parseDocuments(files: Readonly<Record<string, unknown>>) {
  const documents: Array<{ name: string; body: unknown }> = [];
  for (const [name, text] of Object.entries(files)) {
    if (name === 'manifest' || !name.endsWith('.json') || typeof text !== 'string') continue;
    try {
      documents.push({ name, body: JSON.parse(text) as unknown });
    } catch {
      // 非 JSON 支持文件没有信封认领语义。
    }
  }
  return documents;
}

/** Fixture 信封认领、严格同形、业务码与 malformed 反证。 */
export function checkOpenApiFixture(
  manifest: unknown,
  files: Readonly<Record<string, unknown>>,
  contract: OpenApiContract = engineContract,
): string[] {
  const issues: string[] = [];
  for (const document of parseDocuments(files)) {
    const found = envelopes(document.body);
    const declared = claims(manifest, document.body);
    const claimedPaths = new Set(declared.map((claim) => claim.path));
    for (const path of found.keys())
      if (!claimedPaths.has(path)) issues.push(`${document.name}: ${path} 未被认领`);
    for (const claim of declared) {
      const body =
        claim.path === '$.body' && isObject(document.body)
          ? document.body.body
          : valueAt(document.body, claim.path);
      if (body === undefined) {
        issues.push(`${document.name}: ${claim.path} 登记路径不存在`);
        continue;
      }
      issues.push(
        ...validateClaim(
          claim,
          body,
          contract.operations.find((operation) => operation.id === claim.contract),
          contract,
        ).map((issue) => `${document.name}: ${issue}`),
      );
    }
  }
  return issues;
}
