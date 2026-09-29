import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, type ChannelMode } from '../sdk/public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

type Fixture = Readonly<{ tradeNo: string; channel: ChannelMode; reason: 'channel_cancelled' | 'launch_failed'; signal: 'cancelled' | 'launch_failed' }>;
for (const caseKey of ['cancelled', 'launch-failed'] as const) defineCase({
  ownerId: 'FLOW-PAYSDK-002', caseId: caseKey, fixtureCase: caseKey, environment: 'integration', flowId: 'FLOW-PAYSDK-002', flowCase: caseKey,
  covers: [
    { id: 'TC-PAYSDK-CONTRACT-002', caseKey: 'existing-trade-pay', checks: ['existing-trade-only', 'prepare-response-validation', 'no-client-order-or-signing'] },
    { id: 'TC-PAYSDK-CORE-018', caseKey: caseKey === 'cancelled' ? 'channel-cancelled' : 'launch-failed', checks: ['phase-branching'] },
  ],
}, async ({ fixture: value, checkpoint, flow, expect }) => {
  const fixture = value as Fixture;
  const events = createPublicClientEventLog();
  const platform = installPublicClientPlatform({ http: [{ path: '/api/base/trade/pay', body: successPrepare(fixture.tradeNo) }], channel: [fixture.channel], eventLog: events });
  cleanup = platform.restore;
  const { pay, phases } = createPublicHarness({}, events);
  const outcome = await pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  await checkpoint('existing-trade-only', () => expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay']));
  await checkpoint('prepare-response-validation', () => expect(platform.channelRecords).toHaveLength(1));
  await checkpoint('no-client-order-or-signing', () => expect(platform.channelRecords[0]?.signData).toContain(fixture.tradeNo));
  await checkpoint('phase-branching', () => {
    expect(outcome).toMatchObject({ reason: fixture.reason, channelSignal: fixture.signal, snapshot: { state: 'UNKNOWN' } });
    expect(phases.map(event => event.phase)).toEqual(['channel_invoking']);
    expect(phases.map(event => event.attemptId)).toEqual([outcome.attemptId]);
    expect(events.events.filter(event => event.kind === 'terminal')).toHaveLength(1);
    expect(platform.remainingHttp()).toBe(0);
  });
  await flow(outcome.attemptId, ['pay', '准备成功', '渠道明确取消/明确调起失败', '对应结果；无自动 QueryTrade、重新准备或再次调起']);
}, { fixtureRoot });
