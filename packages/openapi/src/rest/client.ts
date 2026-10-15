import type { Cancellation, HttpPort } from '../ports/http';
import { createRequestId } from '../transport/request-id';

/** OpenAPI 描述常量的公共形状；接口名与路径只来自 generated。 */
export type RestOperation = Readonly<{
  meta: Readonly<{
    id: string;
    method: string;
    path: string;
    security?: ReadonlyArray<Readonly<Record<string, readonly string[]>>>;
    codes?: ReadonlyArray<string>;
    implemented?: boolean;
  }>;
}>;

/** 信封约定；默认值可由项目覆盖，执行器中不写死成功码与字段名。 */
export type EnvelopeConvention = Readonly<{
  successStatus: number;
  successCode: unknown;
  codeField: string;
  messageField: string;
  dataField: string;
}>;

/** 默认业务信封：HTTP 200、code 为 0 表示成功。 */
export const defaultEnvelopeConvention: EnvelopeConvention = {
  successStatus: 200,
  successCode: 0,
  codeField: 'code',
  messageField: 'message',
  dataField: 'data',
};

/** 契约身份方案的头名映射由宿主提供，执行器不写死头名。 */
export type SecurityScheme = Readonly<{ type: 'apiKey'; in: 'header'; name: string }>;

/** 当前宿主身份；与接口要求方案不一致时返回 HOST_CONTEXT_ERROR。 */
export type Identity = Readonly<{ scheme: string; token: string }>;

/** 单次调用上下文；预算与取消只属于本次操作。 */
export type RestOperationContext = Readonly<{
  deadlineAtMs: number;
  cancellation?: Cancellation;
}>;

/** 请求输入；path/query/header 与 body 均为可选，按契约生成的调用方提供。 */
export type RestRequestInput = Readonly<{
  path?: Readonly<Record<string, unknown>>;
  query?: Readonly<Record<string, unknown>>;
  header?: Readonly<Record<string, string>>;
  body?: unknown;
}>;

/** 统一传输失败原因。 */
export type RestTransportFailureReason =
  | 'HTTP_STATUS'
  | 'INVALID_ENVELOPE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'CODEC_ERROR'
  | 'EMPTY_ACCESS_TOKEN'
  | 'HOST_CONTEXT_ERROR';

/** REST 执行结果；所有失败都以判别联合返回，不以异常代替。 */
export type RestResult<Data = unknown> =
  | Readonly<{ kind: 'success'; data: Data }>
  | Readonly<{ kind: 'business-failure'; code: number | string; message: string; data: unknown }>
  | Readonly<{ kind: 'transport-failure'; reason: RestTransportFailureReason }>;

export type RestClientOptions = Readonly<{
  gatewayBaseUrl: string;
  http: HttpPort;
  securitySchemes: Readonly<Record<string, SecurityScheme>>;
  identity?: Identity;
  envelope?: EnvelopeConvention;
  runtime?: Readonly<{ nowMs?: () => number }>;
}>;

export interface RestClient {
  request<Data = unknown>(
    operation: RestOperation,
    input?: RestRequestInput,
    context?: RestOperationContext,
  ): Promise<RestResult<Data>>;
}

function failure(reason: RestTransportFailureReason): RestResult<never> {
  return { kind: 'transport-failure', reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildUrl(
  baseUrl: string,
  path: string,
  input: RestRequestInput,
): string | RestResult<never> {
  let missing = false;
  const replaced = path.replace(/\{([^{}]+)\}/g, (_match, name: string) => {
    const value = input.path?.[name];
    if (value === undefined || value === null) {
      missing = true;
      return '';
    }
    return encodeURIComponent(String(value));
  });
  if (missing || /[{}]/.test(replaced)) return failure('CODEC_ERROR');
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${replaced}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function requiredScheme(operation: RestOperation): string | undefined {
  return Object.keys(operation.meta.security?.[0] ?? {})[0];
}

function identityHeader(
  operation: RestOperation,
  options: RestClientOptions,
): { header?: Readonly<Record<string, string>>; failure?: RestResult<never> } {
  const scheme = requiredScheme(operation);
  if (!scheme) return {};
  const definition = options.securitySchemes[scheme];
  const identity = options.identity;
  if (!definition || definition.type !== 'apiKey' || definition.in !== 'header')
    return { failure: failure('HOST_CONTEXT_ERROR') };
  if (!identity) return { failure: failure('EMPTY_ACCESS_TOKEN') };
  if (identity.scheme !== scheme) return { failure: failure('HOST_CONTEXT_ERROR') };
  if (identity.token.trim() === '') return { failure: failure('EMPTY_ACCESS_TOKEN') };
  return { header: { [definition.name]: identity.token } };
}

function parseWire(body: unknown): unknown | RestResult<never> {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return failure('INVALID_ENVELOPE');
  }
}

function parseEnvelope<Data>(
  body: unknown,
  status: number,
  convention: EnvelopeConvention,
): RestResult<Data> {
  if (status !== convention.successStatus) return failure('HTTP_STATUS');
  const wire = parseWire(body);
  if (!isRecord(wire)) return failure('INVALID_ENVELOPE');
  const code = wire[convention.codeField];
  const message = wire[convention.messageField];
  if (
    !Object.prototype.hasOwnProperty.call(wire, convention.codeField) ||
    !Object.prototype.hasOwnProperty.call(wire, convention.messageField) ||
    !Object.prototype.hasOwnProperty.call(wire, convention.dataField) ||
    (typeof code !== 'number' && typeof code !== 'string') ||
    typeof message !== 'string'
  )
    return failure('INVALID_ENVELOPE');
  if (code === convention.successCode)
    return { kind: 'success', data: wire[convention.dataField] as Data };
  return { kind: 'business-failure', code, message, data: wire[convention.dataField] };
}

/** 创建 REST 执行器；路径、身份、方法与请求 ID 由公共配置和描述常量派生。 */
export function createRestClient(options: RestClientOptions): RestClient {
  const convention = options.envelope ?? defaultEnvelopeConvention;
  return {
    async request(operation, input = {}, context = { deadlineAtMs: Date.now() + 30_000 }) {
      if (context.cancellation?.isStopped()) return failure('CANCELLED');
      const nowMs = options.runtime?.nowMs?.() ?? Date.now();
      const timeoutMs = context.deadlineAtMs - nowMs;
      if (timeoutMs <= 0) return failure('TIMEOUT');
      const url = buildUrl(options.gatewayBaseUrl, operation.meta.path, input);
      if (typeof url !== 'string') return url;
      const identity = identityHeader(operation, options);
      if (identity.failure) return identity.failure;

      let body: string | undefined;
      if (input.body !== undefined) {
        try {
          body = JSON.stringify(input.body);
        } catch {
          return failure('CODEC_ERROR');
        }
        if (body === undefined) return failure('CODEC_ERROR');
      }
      const headers: Record<string, string> = {
        ...(input.header ?? {}),
        ...identity.header,
        'X-Request-Id': createRequestId(),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      };
      let received;
      try {
        received = await options.http.send({
          url,
          method: operation.meta.method.toUpperCase(),
          headers,
          ...(body === undefined ? {} : { body }),
          timeoutMs,
          ...(context.cancellation ? { cancellation: context.cancellation } : {}),
        });
      } catch {
        return failure('NETWORK_ERROR');
      }
      if (!received.ok) return failure(received.error.code);
      return parseEnvelope(received.value.body, received.value.status, convention);
    },
  };
}
