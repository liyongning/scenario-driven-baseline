import { afterEach, expect as vitestExpect, test } from 'vitest';
import type { PaymentOutcome } from '@daqian/payment-sdk';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery, type PublicClientEvent } from '../sdk/public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

type Fixture = Readonly<{ runs: ReadonlyArray<Readonly<{ tradeNo: string; xpayEnv?: 'sandbox' | 'prod'; presence?: 'omitted' | 'explicit-undefined'; marker: string }>> }>;

function attemptIdIssues(outcomes: ReadonlyArray<Pick<PaymentOutcome, 'attemptId'>>, events: readonly PublicClientEvent[]): string[] {
  const issues: string[] = [];
  if (new Set(outcomes.map(outcome => outcome.attemptId)).size !== outcomes.length) issues.push('outcome attemptIds are not unique');
  if (events.length !== outcomes.length * 9) issues.push('event chunks are incomplete');
  outcomes.forEach((outcome, index) => {
    const chunk = events.slice(index * 9, index * 9 + 9);
    const phases = chunk.filter(event => event.kind === 'phase');
    const terminals = chunk.filter(event => event.kind === 'terminal');
    if (phases.length !== 2 || phases.some(event => event.attemptId !== outcome.attemptId)) issues.push(`run ${index} phase attemptId mismatch`);
    if (terminals.length !== 1 || terminals[0]?.attemptId !== outcome.attemptId) issues.push(`run ${index} terminal attemptId mismatch`);
  });
  return issues;
}

test('successive runs reject phase IDs that all point at the first outcome', () => {
  const outcomes = ['a', 'b', 'c'].map(attemptId => ({ attemptId }));
  const events = Array.from({ length: 27 }, (_, sequence): PublicClientEvent => ({
    sequence,
    kind: sequence % 9 === 2 || sequence % 9 === 5 ? 'phase' : sequence % 9 === 8 ? 'terminal' : 'http-request',
    ...(sequence % 9 === 2 || sequence % 9 === 5 || sequence % 9 === 8 ? { attemptId: 'a' } : {}),
  }));
  vitestExpect(attemptIdIssues(outcomes, events)).not.toEqual([]);
});

for (const caseKey of ['omitted', 'sandbox', 'prod', 'successive-selection', 'request-snapshot'] as const) {
  const checks = caseKey === 'successive-selection' ? ['per-run-selection']
    : caseKey === 'request-snapshot' ? ['request-snapshot']
      : ['per-run-selection', 'channel-signature-unchanged'];
  defineCase({
    ownerId: 'FLOW-PAYSDK-008', caseId: `flow-008-${caseKey}`, fixtureCase: caseKey, environment: 'integration',
    flowId: 'FLOW-PAYSDK-008', flowCase: caseKey,
    covers: [caseKey === 'successive-selection' || caseKey === 'request-snapshot'
      ? { id: 'TC-PAYSDK-CORE-020', caseKey, checks }
      : { id: 'TC-PAYSDK-CONTRACT-022', caseKey, checks: ['valid-runtime-inputs'] }],
  }, async ({ fixture: value, checkpoint, flow, expect }) => {
    const fixture = value as Fixture;
    const eventLog = createPublicClientEventLog();
    let releaseProvider: (() => void) | undefined;
    const providerGate = caseKey === 'request-snapshot' ? new Promise<void>(resolve => { releaseProvider = resolve; }) : undefined;
    const platform = installPublicClientPlatform({ eventLog, http: fixture.runs.flatMap(run => [
      { path: '/api/base/trade/pay' as const, body: successPrepare(run.tradeNo, run.marker) },
      { path: '/api/base/trade/query' as const, body: successQuery(run.tradeNo) },
    ]) });
    cleanup = platform.restore;
    const harness = createPublicHarness(providerGate ? { getAccessToken: async () => { await providerGate; return 'fixture-token'; } } : {}, eventLog);
    const outcomes: PaymentOutcome[] = [];
    for (const run of fixture.runs) {
      const request: { reference: { tradeNo: string }; method: 'wechat-miniapp-virtual-goods'; xpayEnv?: 'sandbox' | 'prod' | undefined } = {
        reference: { tradeNo: run.tradeNo }, method: 'wechat-miniapp-virtual-goods', ...(run.presence === 'explicit-undefined' ? { xpayEnv: undefined } : run.xpayEnv ? { xpayEnv: run.xpayEnv } : {}),
      };
      const pending = harness.pay(request);
      if (caseKey === 'request-snapshot') { request.xpayEnv = 'prod'; releaseProvider?.(); }
      outcomes.push(await pending);
    }
    const prepares = platform.httpRecords.filter(record => record.path.endsWith('/pay'));
    const queries = platform.httpRecords.filter(record => record.path.endsWith('/query'));
    const expectedKinds = fixture.runs.flatMap(() => [
      'request:/api/base/trade/pay', 'response:/api/base/trade/pay', 'phase:channel_invoking', 'channel-invoke', 'callback:success',
      'phase:confirming', 'request:/api/base/trade/query', 'response:/api/base/trade/query', 'terminal',
    ]);
    const actualKinds = eventLog.events.map(event => event.kind === 'phase' ? `phase:${event.phase}`
      : event.kind === 'http-request' ? `request:${event.path}`
        : event.kind === 'http-response' ? `response:${event.path}`
          : event.kind === 'channel-callback' ? `callback:${event.callback}` : event.kind);
    await checkpoint(checks[0]!, () => {
      expect(outcomes).toHaveLength(fixture.runs.length);
      expect(outcomes.every(outcome => outcome.reason === 'confirmed' && outcome.snapshot.state === 'PAID')).toBe(true);
      expect(prepares.map(record => record.body.xpayEnv)).toEqual(fixture.runs.map(run => run.xpayEnv ? `XPAY_ENV_${run.xpayEnv.toUpperCase()}` : undefined));
      expect(queries.every(record => !Object.prototype.hasOwnProperty.call(record.body, 'xpayEnv'))).toBe(true);
      expect(actualKinds).toEqual(expectedKinds);
      for (const [index, run] of fixture.runs.entries()) {
        const prepare = prepares[index]!;
        const query = queries[index]!;
        const channel = platform.channelRecords[index]!;
        expect(platform.channelArgumentKeys[index]).toEqual(['mode', 'paySig', 'signData', 'signature']);
        expect(Object.keys(prepare.body).sort()).toEqual(['appId', 'baseReq', 'channel', 'clientPlatform', 'tradeNo', ...(run.xpayEnv ? ['xpayEnv'] : [])].sort());
        expect(prepare.body).toMatchObject({ tradeNo: run.tradeNo, appId: 'app-fixture', channel: 'CHANNEL_WECHAT_VIRTUAL', clientPlatform: 'ios' });
        expect(channel).toEqual({ mode: 'short_series_goods', signData: ` {"marker":"${run.marker}"} `, paySig: `sig-${run.marker}`, signature: `signature-${run.marker}` });
        expect(Object.keys(query.body).sort()).toEqual(['baseReq', 'tradeNo']);
        expect(query.body.tradeNo).toBe(run.tradeNo);
        expect(prepare.headers.Authorization).toBe('Bearer fixture-token');
        expect(query.headers.Authorization).toBe('Bearer fixture-token');
        expect(prepare.headers['Content-Type']).toBe('application/json');
        expect(query.headers['Content-Type']).toBe('application/json');
        expect(Object.keys(prepare.headers).map(key => key.toLowerCase().replace(/[-_]/g, ''))).not.toContain('xpayenv');
        expect(Object.keys(query.headers).map(key => key.toLowerCase().replace(/[-_]/g, ''))).not.toContain('xpayenv');
        const prepareBase = prepare.body.baseReq as Record<string, unknown>;
        const queryBase = query.body.baseReq as Record<string, unknown>;
        expect(prepareBase).not.toHaveProperty('xpayEnv');
        expect(queryBase).not.toHaveProperty('xpayEnv');
        expect(prepareBase.productId).toBe('fixture-product');
        expect(queryBase.productId).toBe('fixture-product');
        expect(prepare.headers.request_id).toBe(prepareBase.requestId);
        expect(query.headers.request_id).toBe(queryBase.requestId);
        expect(outcomes[index]?.snapshot.reference.tradeNo).toBe(run.tradeNo);
      }
      expect(eventLog.events.filter(event => event.kind === 'terminal')).toHaveLength(fixture.runs.length);
      expect(new Set(outcomes.map(outcome => outcome.attemptId)).size).toBe(outcomes.length);
      expect(attemptIdIssues(outcomes, eventLog.events)).toEqual([]);
    });
    if (checks.includes('channel-signature-unchanged')) await checkpoint('channel-signature-unchanged', () => {
      expect(platform.channelRecords).toEqual(fixture.runs.map(run => ({ mode: 'short_series_goods', signData: ` {"marker":"${run.marker}"} `, paySig: `sig-${run.marker}`, signature: `signature-${run.marker}` })));
    });
    if (caseKey === 'omitted' || caseKey === 'sandbox' || caseKey === 'prod') await checkpoint('valid-runtime-inputs', () => expect(outcomes.every(outcome => outcome.reason === 'confirmed')).toBe(true));
    await flow(outcomes.map(outcome => outcome.attemptId).join(','), ['公共 pay', 'CreateTradePay 的原始请求', '本次参数/渠道', 'QueryTrade', '一次结果；检查三态、presence、逐次隔离和签名不变']);
    expect(platform.remainingHttp()).toBe(0);
  }, { fixtureRoot });
}
