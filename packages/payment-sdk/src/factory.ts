import { createProtocolClient, createWechatMiniappHttp } from '@daqian/payment-protocol';
import { createWechatMiniappVirtualChannel } from './adapters/channels/wechat-miniapp-virtual';
import { createPaymentBackend } from './adapters/payment-infra/backend';
import { createWechatDeviceInfo } from './adapters/platform/wechat-device-info';
import type { PaymentClient, PaymentClientOptions, PaymentPolicyOverrides, PaymentRequestContext } from './contracts';
import { createCoreClient } from './core/client';
import { createDefaultRuntime } from './runtime/default';

/** SDK 初始化配置不符合公共契约；运行期支付失败仍通过结果返回。 */
export class PaymentConfigurationError extends Error {
  /** 稳定配置错误标识。 */
  readonly code = 'INVALID_CONFIG' as const;

  constructor(message = 'Invalid payment client configuration') {
    super(message);
    this.name = 'PaymentConfigurationError';
  }
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function copyPolicy(value: unknown): PaymentPolicyOverrides | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new PaymentConfigurationError();
  const policy = value as PaymentPolicyOverrides;
  if (policy.requestTimeoutMs !== undefined && !positive(policy.requestTimeoutMs)) throw new PaymentConfigurationError();
  if (policy.observation !== undefined) {
    if (policy.observation === null || typeof policy.observation !== 'object' || Array.isArray(policy.observation)) throw new PaymentConfigurationError();
    if (policy.observation.intervalMs !== undefined && !positive(policy.observation.intervalMs)) throw new PaymentConfigurationError();
    if (policy.observation.maxWaitMs !== undefined && !positive(policy.observation.maxWaitMs)) throw new PaymentConfigurationError();
  }
  return {
    ...(policy.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: policy.requestTimeoutMs }),
    ...(policy.observation === undefined ? {} : { observation: {
      ...(policy.observation.intervalMs === undefined ? {} : { intervalMs: policy.observation.intervalMs }),
      ...(policy.observation.maxWaitMs === undefined ? {} : { maxWaitMs: policy.observation.maxWaitMs }),
    } }),
  };
}

function copyRequestContext(value: unknown): PaymentRequestContext | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new PaymentConfigurationError();
  const context = value as PaymentRequestContext;
  for (const field of [context.productId, context.lane, context.appVersion]) {
    if (field !== undefined && typeof field !== 'string') throw new PaymentConfigurationError();
  }
  return {
    ...(context.productId === undefined ? {} : { productId: context.productId }),
    ...(context.lane === undefined ? {} : { lane: context.lane }),
    ...(context.appVersion === undefined ? {} : { appVersion: context.appVersion }),
  };
}

/** 按公共配置装配生产支付客户端；创建本身不读取平台、不取 Token、不发送请求。 */
export function createPaymentClient(options: PaymentClientOptions): PaymentClient {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new PaymentConfigurationError();
  if (options.runtime !== 'wechat-miniapp'
    || typeof options.gatewayBaseUrl !== 'string' || options.gatewayBaseUrl.trim().length === 0
    || typeof options.appId !== 'string' || options.appId.trim().length === 0
    || typeof options.getAccessToken !== 'function'
    || !Array.isArray(options.enabledMethods) || options.enabledMethods.length === 0
    || options.enabledMethods.some(method => method !== 'wechat-miniapp-virtual-goods')
    || new Set(options.enabledMethods).size !== options.enabledMethods.length
    || options.onDiagnostic !== undefined && typeof options.onDiagnostic !== 'function') throw new PaymentConfigurationError();

  const runtime = createDefaultRuntime();
  const enabledMethods = [...options.enabledMethods];
  const policy = copyPolicy(options.policy);
  const requestContext = copyRequestContext(options.requestContext);
  const protocol = createProtocolClient({
    gatewayBaseUrl: options.gatewayBaseUrl,
    getAccessToken: options.getAccessToken,
    ...(requestContext === undefined ? {} : { requestContext }),
    runtime,
    http: createWechatMiniappHttp(),
  });
  const backend = createPaymentBackend({
    protocol,
    appId: options.appId,
    deviceInfo: createWechatDeviceInfo(),
    runtime,
    ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
  });
  return createCoreClient({
    backend,
    channels: [createWechatMiniappVirtualChannel()],
    enabledMethods,
    runtime,
    ...(policy === undefined ? {} : { policy }),
    ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
  });
}
