import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicClientEventLog, createPublicHarness, installPublicClientPlatform } from '../sdk/public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
type Fixture = Readonly<{ tradeNo: string; response: Record<string, unknown> }>;
for (const caseKey of ['missing-required-param', 'channel-mismatch'] as const) defineCase({
  ownerId: 'FLOW-PAYSDK-003', caseId: caseKey, fixtureCase: caseKey, environment: 'integration', flowId: 'FLOW-PAYSDK-003', flowCase: caseKey,
  covers: [
    { id: 'TC-PAYSDK-CORE-004', caseKey, checks: ['invalid-params-rejected', 'no-channel-or-resign'] },
    ...(caseKey === 'channel-mismatch' ? [{ id: 'TC-PAYSDK-CONTRACT-014', caseKey, checks: ['correlation-and-channel-validation', 'no-channel-fallback'] }] : []),
  ],
}, async ({ fixture: value, checkpoint, flow, expect }) => {
  const fixture = value as Fixture;
  const events = createPublicClientEventLog();
  const platform = installPublicClientPlatform({ http: [{ path: '/api/base/trade/pay', body: fixture.response }], eventLog: events });
  cleanup = platform.restore;
  const outcome = await createPublicHarness({}, events).pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
  await checkpoint('invalid-params-rejected', () => expect(outcome).toMatchObject({ reason: 'error', channelSignal: 'not_invoked', error: { code: 'PROTOCOL_ERROR', source: 'gateway' } }));
  await checkpoint('no-channel-or-resign', () => expect(platform.channelRecords).toHaveLength(0));
  await checkpoint('correlation-and-channel-validation', () => expect(platform.httpRecords).toHaveLength(1));
  await checkpoint('no-channel-fallback', () => {
    expect(events.events.some(event => event.kind === 'phase')).toBe(false);
    expect(events.events.filter(event => event.kind === 'terminal').map(event => event.attemptId)).toEqual([outcome.attemptId]);
    expect(platform.remainingHttp()).toBe(0);
  });
  await flow(outcome.attemptId, ['pay', '准备响应', '参数/关联校验失败', '协议错误；渠道未调用、无查询，不在前端修补签名']);
}, { fixtureRoot });
