import { describe, expect, test, vi } from 'vitest';
import { createPaymentClient, PaymentConfigurationError } from './index';
import type { PaymentClientOptions } from './contracts';

function validOptions(): PaymentClientOptions {
  return {
    runtime: 'wechat-miniapp',
    gatewayBaseUrl: 'https://gateway.fixture.invalid',
    appId: 'app-fixture',
    enabledMethods: ['wechat-miniapp-virtual-goods'],
    getAccessToken: () => 'fixture-token',
  };
}

describe('createPaymentClient', () => {
  test('assembles a public client without touching platform or network during creation', async () => {
    const request = vi.fn();
    const requestVirtualPayment = vi.fn();
    vi.stubGlobal('wx', { request, requestVirtualPayment, canIUse: () => false });

    const client = createPaymentClient(validOptions());

    expect(client).toEqual({ pay: expect.any(Function), query: expect.any(Function), observe: expect.any(Function) });
    expect(request).not.toHaveBeenCalled();
    expect(requestVirtualPayment).not.toHaveBeenCalled();
    await expect(client.pay({ reference: { tradeNo: 'trade-factory' }, method: 'wechat-miniapp-virtual-goods' }))
      .resolves.toMatchObject({ reason: 'unsupported', channelSignal: 'not_invoked' });
    vi.unstubAllGlobals();
  });

  test.each([
    ['missing options', undefined],
    ['null options', null],
    ['array options', []],
    ['unknown runtime', { ...validOptions(), runtime: 'browser' }],
    ['non-string gateway', { ...validOptions(), gatewayBaseUrl: 1 }],
    ['empty gateway', { ...validOptions(), gatewayBaseUrl: '' }],
    ['non-string app id', { ...validOptions(), appId: 1 }],
    ['empty app id', { ...validOptions(), appId: '' }],
    ['missing token provider', { ...validOptions(), getAccessToken: undefined }],
    ['non-array methods', { ...validOptions(), enabledMethods: 'wechat-miniapp-virtual-goods' }],
    ['empty methods', { ...validOptions(), enabledMethods: [] }],
    ['duplicate methods', { ...validOptions(), enabledMethods: ['wechat-miniapp-virtual-goods', 'wechat-miniapp-virtual-goods'] }],
    ['unknown method', { ...validOptions(), enabledMethods: ['future-method'] }],
    ['invalid diagnostic callback', { ...validOptions(), onDiagnostic: 1 }],
    ['null policy', { ...validOptions(), policy: null }],
    ['scalar policy', { ...validOptions(), policy: 'fast' }],
    ['array policy', { ...validOptions(), policy: [] }],
    ['non-number request budget', { ...validOptions(), policy: { requestTimeoutMs: 'fast' } }],
    ['non-finite request budget', { ...validOptions(), policy: { requestTimeoutMs: Infinity } }],
    ['zero request budget', { ...validOptions(), policy: { requestTimeoutMs: 0 } }],
    ['null observation policy', { ...validOptions(), policy: { observation: null } }],
    ['scalar observation policy', { ...validOptions(), policy: { observation: 'fast' } }],
    ['array observation policy', { ...validOptions(), policy: { observation: [] } }],
    ['invalid observation policy', { ...validOptions(), policy: { observation: { intervalMs: Number.NaN } } }],
    ['invalid max wait', { ...validOptions(), policy: { observation: { maxWaitMs: -1 } } }],
    ['null request context', { ...validOptions(), requestContext: null }],
    ['scalar request context', { ...validOptions(), requestContext: 'context' }],
    ['array request context', { ...validOptions(), requestContext: [] }],
    ['invalid product id', { ...validOptions(), requestContext: { productId: 1 } }],
    ['invalid lane', { ...validOptions(), requestContext: { lane: 1 } }],
    ['invalid app version', { ...validOptions(), requestContext: { appVersion: 1 } }],
  ])('rejects %s before creating a client', (_label, options) => {
    expect(() => createPaymentClient(options as PaymentClientOptions)).toThrow(PaymentConfigurationError);
    try {
      createPaymentClient(options as PaymentClientOptions);
    } catch (error) {
      expect(error).toMatchObject({ name: 'PaymentConfigurationError', code: 'INVALID_CONFIG' });
    }
  });

  test.each([
    {},
    { policy: {} },
    { policy: { requestTimeoutMs: 10 } },
    { policy: { observation: {} } },
    { policy: { observation: { intervalMs: 2 } } },
    { policy: { observation: { maxWaitMs: 10 } } },
    { requestContext: {} },
    { requestContext: { productId: 'p' } },
    { requestContext: { lane: 'lane' } },
    { requestContext: { appVersion: '1' } },
    { requestContext: { productId: 'p', lane: 'lane', appVersion: '1' }, onDiagnostic: () => undefined },
  ])('accepts and copies every optional configuration shape %#', extra => {
    expect(() => createPaymentClient({ ...validOptions(), ...extra })).not.toThrow();
  });

  test('exposes a stable configuration error name, code, and optional diagnostic message', () => {
    expect(new PaymentConfigurationError('fixture')).toMatchObject({ name: 'PaymentConfigurationError', code: 'INVALID_CONFIG', message: 'fixture' });
  });

  test('copies mutable initialization arrays and nested policy', async () => {
    const source = {
      ...validOptions(),
      enabledMethods: ['wechat-miniapp-virtual-goods'] as Array<'wechat-miniapp-virtual-goods'>,
      policy: { requestTimeoutMs: 20, observation: { intervalMs: 2, maxWaitMs: 10 } },
    };
    const client = createPaymentClient(source);
    source.enabledMethods.length = 0;
    source.policy.requestTimeoutMs = 0;

    await expect(client.pay({ reference: { tradeNo: 'trade-copy' }, method: 'wechat-miniapp-virtual-goods' }))
      .resolves.toMatchObject({ reason: 'unsupported' });
  });
});
