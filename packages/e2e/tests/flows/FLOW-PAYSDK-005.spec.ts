import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from '../sdk/public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type Fixture = Readonly<{ tradeNo: string; tokens: string[] }>;
defineCase({ ownerId: 'FLOW-PAYSDK-005', caseId: 'token-rotates-between-queries', fixtureCase: 'token-rotates-between-queries', environment: 'integration', flowId: 'FLOW-PAYSDK-005', flowCase: 'token-rotates-between-queries',
  covers: [
    { id: 'TC-PAYSDK-CONTRACT-012', caseKey: 'token-rotates-between-queries', checks: ['fresh-token-each-request', 'no-token-cache-or-body'] },
  ],
}, async ({ fixture: value, checkpoint, flow, expect }) => {
  const fixture = value as Fixture;
  const eventLog = createPublicClientEventLog();
  const platform = installPublicClientPlatform({ http: [
    { path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo) },
    { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo, 'TRADE_STATUS_PAYING') },
    { path: '/api/base/trade/query', body: successQuery(fixture.tradeNo) },
  ], eventLog }); cleanup = platform.restore;
  let tokenIndex = 0;
  const harness = createPublicHarness({ getAccessToken: () => fixture.tokens[tokenIndex++]!, policy: { observation: { intervalMs: 1, maxWaitMs: 100 } } }, eventLog);
  const outcome = await harness.pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  await checkpoint('fresh-token-each-request', () => expect(platform.httpRecords.map(record => record.headers.Authorization)).toEqual(fixture.tokens.map(token => `Bearer ${token}`)));
  await checkpoint('no-token-cache-or-body', () => expect(platform.httpRecords.every(record => !JSON.stringify(record.body).includes('token-'))).toBe(true));
  await checkpoint('request-id-contract', () => expect(new Set(platform.httpRecords.map(record => record.headers.request_id)).size).toBe(3));
  expect(harness.phases.map(event => event.phase)).toEqual(['channel_invoking', 'confirming']);
  expect(harness.phases.map(event => event.attemptId)).toEqual([outcome.attemptId, outcome.attemptId]);
  expect(eventLog.events.filter(event => event.kind === 'terminal').map(event => event.attemptId)).toEqual([outcome.attemptId]);
  expect(outcome).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } });
  await flow(outcome.attemptId, ['pay', '准备', '渠道 success_hint', '第一次查单 PAYING', '宿主 getter 数据更新', '后续查单 PAID；使用新 Token、新 Request ID、相同交易引用，不重启 SDK/不重新 prepare']);
}, { fixtureRoot });
