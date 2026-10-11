/**
 * 协议矩阵的数据形态与取证规则（PC-01、PC-02）：
 * 集成用例、weapp 用例与一次性回归证据共用同一份纯函数，不重复实现取值与取证口径。
 * 这里只放与运行环境无关的逻辑；实际请求仍由各用例经公共协议客户端发出。
 */

/** 一个接口的矩阵数据：基请求、逐字段省略样例与多条响应（oneof 的每个分支各一条）。 */
export type MatrixEntry = Readonly<{
  /** 基请求：请求字段映射里取"现值"的样例。 */
  request: Record<string, unknown>;
  /** `requestFields` 中声明 `omitted` 的字段路径：每个字段一条逐字段省略样例。 */
  omitted?: ReadonlyArray<string>;
  /** 响应样例；每条都必须通过 Shadow 同形校验，oneof 的一条响应只带一个分支。 */
  responses: Record<string, unknown>[];
}>;
export type MatrixFixture = Readonly<Record<string, MatrixEntry>>;

/** 公共请求上下文的可配置字段：省略 `base_req.<字段>` 时同步从上下文里去掉同名键。 */
export type RequestContext = Readonly<Record<string, string>>;

/** 公共请求上下文样例：产品 ID 可配置，也用于逐个字段省略样例（PC-01）。 */
export function matrixContext(): RequestContext {
  return { productId: 'matrix-product', lane: 'matrix-lane', appVersion: '1.2.3' };
}

/** proto 字段名 → TypeScript 属性名（lowerCamel）。 */
export function camel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** 按点号路径读取 wire（JSON）值；数组取首元素。 */
export function wireAt(root: unknown, path: string): unknown {
  let value = root;
  for (const part of path.split('.').map(camel)) {
    if (Array.isArray(value)) value = value[0];
    value =
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  }
  return value;
}

/**
 * 按点号路径读取解码后的消息值；ts_proto 的 oneof 消息在 `params.$case` 下选分支，
 * 路径里的分支名必须与 `$case` 一致，否则该分支未被选中，返回 undefined。
 */
export function decodedAt(root: unknown, path: string): unknown {
  let value: unknown = root;
  const parts = path.split('.').map(camel);
  let index = 0;
  while (index < parts.length) {
    if (Array.isArray(value)) value = value[0];
    if (!value || typeof value !== 'object') return undefined;
    const wrapper = (value as Record<string, unknown>).params;
    if (
      wrapper &&
      typeof wrapper === 'object' &&
      !Array.isArray(wrapper) &&
      typeof (wrapper as Record<string, unknown>).$case === 'string'
    ) {
      const caseName = camel(String((wrapper as Record<string, unknown>).$case));
      if (caseName !== parts[index]) return undefined;
      value = (wrapper as Record<string, unknown>)[caseName];
      index += 1;
      continue;
    }
    value = (value as Record<string, unknown>)[parts[index]!];
    index += 1;
  }
  return value;
}

/** 从对象（或数组中的每个对象）里删除一条点号路径。 */
function deletePath(root: unknown, parts: ReadonlyArray<string>): void {
  if (parts.length === 0) return;
  const [head, ...rest] = parts;
  const containers = Array.isArray(root) ? root : [root];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    const record = container as Record<string, unknown>;
    if (rest.length === 0) delete record[head!];
    else deletePath(record[head!], rest);
  }
}

/** 一条逐字段省略样例：去掉该路径后的请求体，以及要一并省略的公共请求上下文。 */
export function omittedSample(
  entry: MatrixEntry,
  path: string,
  context: RequestContext,
): Readonly<{ request: Record<string, unknown>; context: RequestContext }> {
  const request = structuredClone(entry.request) as Record<string, unknown>;
  const parts = path.split('.').map(camel);
  deletePath(request, parts);
  const trimmed: Record<string, string> = { ...context };
  if (parts.length > 1 && parts[0] === 'baseReq') delete trimmed[parts[1]!];
  return { request, context: trimmed };
}

/** 声明了 `omitted` 却没有逐字段省略样例的请求字段路径（反例：必须报出）。 */
export function missingOmissionSamples(
  omittedFields: ReadonlyArray<string>,
  entry: MatrixEntry,
): string[] {
  const declared = entry.omitted ?? [];
  return omittedFields.filter((path) => !declared.includes(path));
}

/** 一条请求记录的最小形态：请求侧取证只看请求体。 */
export type RequestRecord = Readonly<{ rawBody: unknown }>;

/**
 * 请求字段义务里"字段必须缺失"的 case：逐字段省略（`omitted`）与缺失类（`-absent`、`-absence`）。
 * 派生出的 case 名是 `request-optional-absence`，不以 `absent` 结尾，判定不能只看字符串后缀。
 */
export function requestAbsenceCase(caseKey: string): boolean {
  return caseKey === 'omitted' || caseKey.endsWith('-absent') || caseKey.endsWith('-absence');
}

/**
 * 请求侧取证：返回应作为该 case 证据的请求下标，找不到时返回 -1（由调用方计入缺证）。
 * - 缺失类 case 必须取"字段确实缺失"的请求；声明了逐字段省略样例时优先用该样例。
 *   不得退回"字段存在"的请求——那会让"总被发送的 optional 字段"义务恒真。
 * - 其余 case 取第一条字段存在的请求。
 */
export function requestEvidenceIndex(
  caseKey: string,
  path: string,
  records: ReadonlyArray<RequestRecord>,
  omittedRecordIndex: ReadonlyMap<string, number>,
): number {
  const requiresAbsence = requestAbsenceCase(caseKey);
  if (requiresAbsence) {
    const declared = omittedRecordIndex.get(path);
    if (declared !== undefined) return declared;
  }
  for (const [index, record] of records.entries()) {
    if ((wireAt(record.rawBody, path) !== undefined) === requiresAbsence) continue;
    return index;
  }
  return -1;
}

/**
 * 编码边界 case 的取值形态核验。未知 case 一律报错：派生规则新增 case 时这里必须显式给出判定，
 * 不允许用"默认通过"把义务变成恒真。
 */
export function encodingMatches(caseKey: string, value: unknown): boolean {
  if (
    caseKey.endsWith('json-string') ||
    caseKey.endsWith('json-int64-string') ||
    caseKey.endsWith('enum-name')
  )
    return typeof value === 'string';
  if (caseKey.endsWith('json-number')) return typeof value === 'number';
  if (caseKey.endsWith('json-boolean')) return typeof value === 'boolean';
  if (caseKey.endsWith('repeated-array')) return Array.isArray(value);
  if (
    caseKey.endsWith('nested-object') ||
    caseKey.endsWith('oneof-object') ||
    caseKey.endsWith('string-map')
  )
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  throw new Error(`协议矩阵没有登记编码边界 case ${caseKey} 的判定规则`);
}

/** 缺失/默认类 case 由空响应取证，不需要取样响应。 */
export function absenceCase(caseKey: string): boolean {
  return (
    caseKey === 'decoded-absence' ||
    caseKey === 'decoded-default' ||
    caseKey === 'wire-absent' ||
    caseKey.endsWith('optional-absence') ||
    caseKey.endsWith('oneof-absence')
  );
}

/** 一条响应义务的取证结果：某条响应、空响应，或找不到取证响应。 */
export type ResponseEvidence =
  | Readonly<{ kind: 'response'; index: number }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'missing' }>;

/** 按 case 语义选取证响应：缺失类用空响应，取值/存在类用第一条含该字段的响应。 */
export function responseEvidence(
  caseKey: string,
  path: string,
  responses: ReadonlyArray<Readonly<{ decoded: unknown; wire: unknown }>>,
): ResponseEvidence {
  if (absenceCase(caseKey)) return { kind: 'absent' };
  const decodedSide = caseKey.startsWith('decoded-');
  for (const [index, response] of responses.entries()) {
    const value = decodedSide ? decodedAt(response.decoded, path) : wireAt(response.wire, path);
    if (value !== undefined) return { kind: 'response', index };
  }
  return { kind: 'missing' };
}
