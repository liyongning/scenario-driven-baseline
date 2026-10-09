import { expect, test } from 'vitest';
import * as subject from './context';
import type { ProtocolClientOptions } from '../client';

test('公共上下文由 provider 和显式配置构造，同一 Request ID/Product ID 双位置一致', async () => {
  expect(subject).toHaveProperty('createRequestContext');
  const options: ProtocolClientOptions = {
    gatewayBaseUrl: 'https://fixture.invalid',
    getAccessToken: () => 'fixture-token',
    requestContext: { productId: 'p', lane: 'dev', appVersion: 'v' },
    http: { send: async () => ({ ok: false, error: { code: 'NETWORK_ERROR' } }) },
    runtime: {
      nowMs: () => 100,
      nextRequestId: () => 'pay-context-1',
      sleepMs: () => new Promise(() => {}),
    },
  };
  expect(await subject.createRequestContext(options, { deadlineAtMs: 110 })).toEqual({
    ok: true,
    value: {
      headers: {
        Authorization: 'Bearer fixture-token',
        'Content-Type': 'application/json',
        'X-Product-ID': 'p',
        lane: 'dev',
        app_version: 'v',
        request_id: 'pay-context-1',
      },
      baseReq: { productId: 'p', requestId: 'pay-context-1' },
    },
  });
});
