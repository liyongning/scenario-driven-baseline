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
      sleepMs: () => new Promise(() => {}),
    },
  };
  const result = await subject.createRequestContext(options, { deadlineAtMs: 110 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const { headers, baseReq } = result.value;
  expect(headers).toMatchObject({
    Authorization: 'Bearer fixture-token',
    'Content-Type': 'application/json',
    'X-Product-ID': 'p',
    lane: 'dev',
    app_version: 'v',
  });
  // 头名为 X-Request-Id、不再发送旧 request_id 头，且与 BaseReq.requestId 同值。
  expect(headers['request_id']).toBeUndefined();
  expect(headers['X-Request-Id']).toMatch(/^\d{8}_\d{6}_\d{3}_[a-z]{6}$/);
  expect(baseReq).toMatchObject({ productId: 'p', requestId: headers['X-Request-Id'] });
});
