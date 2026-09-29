import { createProtocolClient, createWechatMiniappHttp } from '@daqian/payment-protocol';
import type { ExampleClient, ExampleClientOptions, ExamplePolicyOverrides } from './contracts';
import { createExampleTradeBackend } from './adapters/trade-backend';
import { createExampleCore } from './core/client';
import { createDefaultRuntime } from '../runtime/default';

/** 示例客户端配置不符合公共契约。 */
export class ExampleConfigurationError extends Error {
  readonly code = 'INVALID_CONFIG' as const;
  constructor(message = 'Invalid example client configuration') { super(message); this.name = 'ExampleConfigurationError'; }
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function copyPolicy(value: unknown): ExamplePolicyOverrides | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ExampleConfigurationError();
  const policy = value as ExamplePolicyOverrides;
  for (const item of [policy.requestTimeoutMs, policy.intervalMs, policy.windowMs]) if (item !== undefined && !positive(item)) throw new ExampleConfigurationError();
  return { ...(policy.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: policy.requestTimeoutMs }), ...(policy.intervalMs === undefined ? {} : { intervalMs: policy.intervalMs }), ...(policy.windowMs === undefined ? {} : { windowMs: policy.windowMs }) };
}
function copyContext(value: unknown): ExampleClientOptions['requestContext'] | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ExampleConfigurationError();
  const context = value as NonNullable<ExampleClientOptions['requestContext']>;
  for (const field of [context.productId, context.lane, context.appVersion]) if (field !== undefined && typeof field !== 'string') throw new ExampleConfigurationError();
  return { ...(context.productId === undefined ? {} : { productId: context.productId }), ...(context.lane === undefined ? {} : { lane: context.lane }), ...(context.appVersion === undefined ? {} : { appVersion: context.appVersion }) };
}

/** 装配示例客户端；校验与创建本身不读取平台、不读取 Token、不发请求。 */
export function createExampleClient(options: ExampleClientOptions): ExampleClient {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new ExampleConfigurationError();
  if (options.runtime !== 'wechat-miniapp' || typeof options.gatewayBaseUrl !== 'string' || options.gatewayBaseUrl.trim().length === 0 || typeof options.getAccessToken !== 'function') throw new ExampleConfigurationError();
  const catalog = options.catalog;
  if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog) || typeof catalog.kind !== 'string' || catalog.kind.length === 0 || typeof catalog.itemId !== 'string' || catalog.itemId.length === 0 || typeof catalog.itemName !== 'string' || catalog.itemName.length === 0 || typeof catalog.unitValue !== 'bigint' || catalog.unitValue <= 0n) throw new ExampleConfigurationError();
  const policy = copyPolicy(options.policy);
  const requestContext = copyContext(options.requestContext);
  const runtime = createDefaultRuntime();
  const protocol = createProtocolClient({ gatewayBaseUrl: options.gatewayBaseUrl, getAccessToken: options.getAccessToken, ...(requestContext === undefined ? {} : { requestContext }), runtime, http: createWechatMiniappHttp() });
  const backend = createExampleTradeBackend({ protocol, catalog: { kind: catalog.kind, itemId: catalog.itemId, itemName: catalog.itemName, unitValue: catalog.unitValue } });
  return createExampleCore({ backend, runtime, ...(policy === undefined ? {} : { policy }) });
}
