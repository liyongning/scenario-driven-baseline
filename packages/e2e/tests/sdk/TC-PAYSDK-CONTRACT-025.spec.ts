import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createCancellation, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery, type HttpPlan } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type Fixture = Readonly<{ tradeNo: string; requestTimeoutMs: number; stopAfterMs?: number; responseDelayMs?: number; intervalMs?: number; maxWaitMs?: number; firstQueryDelayMs?: number }>;

for (const caseKey of ['prepare-stop', 'observe-stop', 'deadline-before-stop', 'stop-before-deadline', 'query-deadline', 'query-timeout-continue'] as const) {
  const principal = caseKey === 'prepare-stop' || caseKey === 'observe-stop' || caseKey === 'stop-before-deadline' ? 'host-stop'
    : caseKey === 'query-timeout-continue' ? 'retry' : 'timeout';
  defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-025', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'TC-PAYSDK-CONTRACT-025', caseKey, checks: [principal, 'once'] }],
  }, async ({ fixture: value, checkpoint, expect }) => {
    const fixture = value as Fixture;
    const isObserve = caseKey === 'observe-stop';
    const isQuery = caseKey === 'query-deadline';
    const retry = caseKey === 'query-timeout-continue';
    const http: HttpPlan[] = retry ? [
      { path: '/api/base/trade/pay' as const, body: successPrepare(fixture.tradeNo) },
      { path: '/api/base/trade/query' as const, body: successQuery(fixture.tradeNo, 'TRADE_STATUS_PAYING'),
        ...(fixture.firstQueryDelayMs === undefined ? {} : { delayMs: fixture.firstQueryDelayMs }) },
      { path: '/api/base/trade/query' as const, body: successQuery(fixture.tradeNo) },
    ] : [{ path: isObserve || isQuery ? '/api/base/trade/query' as const : '/api/base/trade/pay' as const,
      body: isObserve || isQuery ? successQuery(fixture.tradeNo) : successPrepare(fixture.tradeNo),
      ...(fixture.responseDelayMs === undefined ? {} : { delayMs: fixture.responseDelayMs }) }];
    const platform = installPublicClientPlatform({ http }); cleanup = platform.restore;
    const harness = createPublicHarness({ policy: { requestTimeoutMs: fixture.requestTimeoutMs,
      observation: { intervalMs: fixture.intervalMs ?? 1, maxWaitMs: fixture.maxWaitMs ?? 60 } } });
    const host = createCancellation();
    let deliveries = 0;
    const pending = isQuery ? harness.client.query({ tradeNo: fixture.tradeNo })
      : isObserve ? harness.client.observe({ tradeNo: fixture.tradeNo }, { cancellation: host.cancellation })
        : harness.client.pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' }, { cancellation: host.cancellation });
    void pending.then(() => { deliveries += 1; });
    if (fixture.stopAfterMs !== undefined) setTimeout(host.stop, fixture.stopAfterMs);
    const result = await pending;
    await checkpoint(principal, () => {
      if (retry) {
        expect(result).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } });
        expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay', '/api/base/trade/query', '/api/base/trade/query']);
        expect(platform.aborted()).toBeGreaterThanOrEqual(1);
      } else if (isQuery) expect(result).toEqual({ ok: false, error: { code: 'TIMEOUT', source: 'sdk', message: '支付请求超时，请稍后确认支付结果' } });
      else expect(result).toMatchObject({ reason: principal === 'host-stop' ? 'stopped' : 'timed_out' });
    });
    await checkpoint('once', async () => {
      await new Promise(resolve => setTimeout(resolve, 35));
      expect(deliveries).toBe(1);
    });
  }, { fixtureRoot });
}
