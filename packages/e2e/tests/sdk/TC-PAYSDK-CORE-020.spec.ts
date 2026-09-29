import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
const error = (code: string) => ({ baseResp: { statusCode: code, success: false, statusMsg: 'fixture error', error: { bizCode: code, canonicalCode: 'CANONICAL_ERROR_CODE_UNAUTHENTICATED', retryable: false } } });

for (const caseKey of ['prepare-auth-retry-selection', 'channel-session-retry-selection', 'query-recovery-no-env'] as const) {
  const checks = caseKey === 'query-recovery-no-env' ? ['query-recovery-absence'] : ['pay-recovery-selection', 'channel-signature-unchanged'];
  defineCase({ ownerId: 'TC-PAYSDK-CORE-020', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'TC-PAYSDK-CORE-020', caseKey, checks }],
  }, async ({ fixture: value, checkpoint, expect }) => {
    const fixture = value as { tradeNo: string; xpayEnv: 'sandbox' };
    const tradeNo = `${fixture.tradeNo}-${caseKey}`;
    const queryRecovery = caseKey === 'query-recovery-no-env';
    const prepareRecovery = caseKey === 'prepare-auth-retry-selection';
    const http = prepareRecovery ? [
      { path: '/api/base/trade/pay' as const, body: error('10100801002020') },
      { path: '/api/base/trade/pay' as const, body: successPrepare(tradeNo, 'retry') },
      { path: '/api/base/trade/query' as const, body: successQuery(tradeNo) },
    ] : queryRecovery ? [
      { path: '/api/base/trade/pay' as const, body: successPrepare(tradeNo, 'query-recovery') },
      { path: '/api/base/trade/query' as const, body: error('10100801003020') },
      { path: '/api/base/trade/query' as const, body: successQuery(tradeNo) },
      { path: '/api/base/trade/query' as const, body: successQuery(tradeNo) },
    ] : [
      { path: '/api/base/trade/pay' as const, body: successPrepare(tradeNo, 'session-first') },
      { path: '/api/base/trade/pay' as const, body: successPrepare(tradeNo, 'session-retry') },
      { path: '/api/base/trade/query' as const, body: successQuery(tradeNo) },
    ];
    const platform = installPublicClientPlatform({ http, channel: caseKey === 'channel-session-retry-selection' ? ['session', 'success'] : ['success', 'success'] }); cleanup = platform.restore;
    const { client } = createPublicHarness();
    if (queryRecovery) {
      const interrupted = await client.pay({ reference: { tradeNo }, method: 'wechat-miniapp-virtual-goods', xpayEnv: 'prod' });
      expect(interrupted).toMatchObject({ reason: 'auth_required', interruptedPhase: 'query' });
      const observed = await client.observe({ tradeNo });
      const queried = await client.query({ tradeNo });
      await checkpoint('query-recovery-absence', () => {
        expect(observed).toMatchObject({ reason: 'confirmed' });
        expect(queried).toMatchObject({ ok: true });
        expect(platform.httpRecords.filter(record => record.path.endsWith('/query')).every(record => !Object.prototype.hasOwnProperty.call(record.body, 'xpayEnv'))).toBe(true);
      });
    } else {
      const first = await client.pay({ reference: { tradeNo }, method: 'wechat-miniapp-virtual-goods', xpayEnv: fixture.xpayEnv });
      const second = await client.pay({ reference: { tradeNo }, method: 'wechat-miniapp-virtual-goods', xpayEnv: fixture.xpayEnv });
      await checkpoint('pay-recovery-selection', () => {
        expect(first.reason).toBe(prepareRecovery ? 'auth_required' : 'channel_session_required');
        expect(second).toMatchObject({ reason: 'confirmed' });
        expect(platform.httpRecords.filter(record => record.path.endsWith('/pay')).every(record => record.body.xpayEnv === 'XPAY_ENV_SANDBOX')).toBe(true);
      });
      await checkpoint('channel-signature-unchanged', () => expect(platform.channelRecords.at(-1)?.signData).toBe(` {"marker":"${prepareRecovery ? 'retry' : 'session-retry'}"} `));
    }
  }, { fixtureRoot });
}
