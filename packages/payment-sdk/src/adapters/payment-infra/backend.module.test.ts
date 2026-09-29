import { test, type TestContext } from 'vitest';
import { createProtocolClient, type HttpRequest } from '@daqian/payment-protocol';
import { createDefaultRuntime } from '../../runtime/default';
import { createPaymentBackend } from './backend';

test('TC-PAYSDK-CORE-010 replace-internal-network-port', {
  meta: { paymentCase: {
    ownerId: 'TC-PAYSDK-CORE-010', caseId: 'replace-internal-network-port', environment: 'sdk-unit', fixtureCase: null,
    covers: [{ id: 'TC-PAYSDK-CORE-010', caseKey: 'replace-internal-network-port', checks: ['network-port-isolation'] }],
  } },
}, async (context: TestContext) => {
  const before = context.expect.getState().assertionCalls;
  const requests: HttpRequest[] = [];
  const responses = [
    { tradeNo: 'trade-module-001', paymentNo: 'payment-module-001', channel: 'CHANNEL_WECHAT_VIRTUAL', expireTime: '1000', payParams: { wechatVirtual: { mode: 'short_series_goods', signData: '{}', paySig: 'sig', signature: 'signature' } }, baseResp: { statusCode: '0', success: true } },
    { trade: { tradeNo: 'trade-module-001', status: 'TRADE_STATUS_PAYING', expireTime: '1000' }, baseResp: { statusCode: '0', success: true } },
  ];
  const runtime = createDefaultRuntime();
  const protocol = createProtocolClient({
    gatewayBaseUrl: 'https://fixture.invalid', getAccessToken: () => 'fixture-token', runtime,
    http: { async send(request) {
      requests.push(request);
      return { ok: true, value: { status: 200, headers: {}, body: responses.shift() } };
    } },
  });
  const backend = createPaymentBackend({
    protocol, appId: 'app-module', deviceInfo: { clientPlatform: () => 'ios' }, runtime,
  });

  await context.expect(backend.prepare({ reference: { tradeNo: 'trade-module-001' }, method: 'wechat-miniapp-virtual-goods' }, { deadlineAtMs: Date.now() + 1000 }))
    .resolves.toMatchObject({ ok: true, value: { paymentNo: 'payment-module-001' } });
  await context.expect(backend.query({ tradeNo: 'trade-module-001' }, { deadlineAtMs: Date.now() + 1000 }))
    .resolves.toMatchObject({ ok: true, value: { state: 'PAYING' } });
  context.expect(requests.map(request => new URL(request.url).pathname)).toEqual(['/api/base/trade/pay', '/api/base/trade/query']);
  await context.annotate(JSON.stringify({
    assertions: context.expect.getState().assertionCalls - before,
    checkpoints: ['network-port-isolation'],
  }), 'payment-evidence');
});
