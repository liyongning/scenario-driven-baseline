import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, type ChannelPlan } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

type Fixture = Readonly<{ tradeNo: string; errCode: number; errMsg?: unknown }>;
const checksByCase = {
  'launch-failed-documented': ['explicit-failure-code-preserved', 'no-confirming-or-query-on-explicit-failure'],
  'launch-failed-unmapped': ['explicit-failure-code-preserved', 'no-confirming-or-query-on-explicit-failure', 'unmapped-numeric-is-explicit-failure'],
} as const;
for (const caseKey of ['launch-failed-documented', 'launch-failed-unmapped'] as const) defineCase({
  ownerId: 'TC-PAYSDK-CORE-024', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CORE-024', caseKey, checks: [...checksByCase[caseKey]] }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as Fixture;
  const events = createPublicClientEventLog();
  const channel: ChannelPlan = { mode: 'launch-failed', errCode: fixture.errCode, errMsg: fixture.errMsg };
  const platform = installPublicClientPlatform({ http: [{ path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo) }], channel: [channel], eventLog: events });
  cleanup = platform.restore;
  const { pay, phases } = createPublicHarness({}, events);
  const outcome = await pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  await checkpoint('explicit-failure-code-preserved', () => {
    expect(outcome).toMatchObject({
      reason: 'launch_failed', channelSignal: 'launch_failed', snapshot: { state: 'UNKNOWN', source: 'unavailable' },
      error: {
        code: 'CHANNEL_ERROR', source: 'channel', message: '支付渠道调用失败', originalCode: String(fixture.errCode),
        ...(typeof fixture.errMsg === 'string' ? { channelMessage: fixture.errMsg } : {}),
      },
    });
    expect(Object.keys(outcome.error ?? {})).toEqual(typeof fixture.errMsg === 'string'
      ? ['code', 'source', 'message', 'originalCode', 'channelMessage']
      : ['code', 'source', 'message', 'originalCode']);
  });
  await checkpoint('no-confirming-or-query-on-explicit-failure', () => {
    expect(phases.map(event => event.phase)).toEqual(['channel_invoking']);
    expect(phases.map(event => event.attemptId)).toEqual([outcome.attemptId]);
    expect(events.events.filter(event => event.kind === 'terminal')).toHaveLength(1);
    expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay']);
    expect(platform.channelRecords).toHaveLength(1);
    expect(platform.remainingHttp()).toBe(0);
  });
  if (caseKey === 'launch-failed-unmapped') await checkpoint('unmapped-numeric-is-explicit-failure', () => {
    expect(fixture.errCode).toBe(16);
    expect(outcome.reason).toBe('launch_failed');
    expect(outcome.error?.originalCode).toBe('16');
  });
}, { fixtureRoot });

for (const [suffix, errMsg, channelMessage] of [
  ['string', 'requestVirtualPayment:fail session expired', 'requestVirtualPayment:fail session expired'],
  ['missing', undefined, undefined],
  ['null', null, undefined],
  ['object', { detail: 'private' }, undefined],
] as const) defineCase({
  ownerId: 'TC-PAYSDK-CORE-024', caseId: `channel-session-expired-message-${suffix}`, fixtureCase: 'channel-session-expired-message', environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CORE-024', caseKey: 'channel-session-expired-message', checks: ['special-codes-unchanged', 'no-confirming-or-query-on-explicit-failure'] }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as Fixture;
  const events = createPublicClientEventLog();
  const platform = installPublicClientPlatform({
    http: [{ path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo) }],
    channel: [{ mode: 'launch-failed', errCode: -15007, ...(errMsg === undefined ? {} : { errMsg }) }], eventLog: events,
  });
  cleanup = platform.restore;
  const { pay, phases } = createPublicHarness({}, events);
  const outcome = await pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  await checkpoint('special-codes-unchanged', () => {
    expect(outcome).toMatchObject({
      reason: 'channel_session_required', channelSignal: 'launch_failed', interruptedPhase: 'invoke',
      error: { code: 'CHANNEL_SESSION_REQUIRED', source: 'channel', message: '支付会话已失效，请重新发起支付', originalCode: '-15007' },
    });
    if (channelMessage === undefined) expect(outcome.error).not.toHaveProperty('channelMessage');
    else expect(outcome.error?.channelMessage).toBe(channelMessage);
  });
  await checkpoint('no-confirming-or-query-on-explicit-failure', () => {
    expect(phases.map(event => event.phase)).toEqual(['channel_invoking']);
    expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay']);
  });
}, { fixtureRoot });
