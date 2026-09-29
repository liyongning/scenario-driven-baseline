import { readFile } from 'node:fs/promises';
import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicClientEventLog, createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

for (const caseKey of ['with-listener', 'no-listener', 'observe-listener', 'independent-query', 'no-extra-phase-values'] as const) {
  const checks = caseKey === 'with-listener' ? ['public-event-shape', 'outcome-separate', 'confirming-order']
    : caseKey === 'no-listener' ? ['callback-optionality', 'outcome-separate']
      : caseKey === 'observe-listener' ? ['public-event-shape', 'no-extra-phases', 'confirming-order']
        : caseKey === 'independent-query' ? ['query-no-notifications'] : ['public-event-shape', 'no-extra-phases'];
  defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-020', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'TC-PAYSDK-CONTRACT-020', caseKey, checks }],
  }, async ({ fixture: value, checkpoint, expect }) => {
    const tradeNo = (value as { tradeNo: string }).tradeNo;
    const queryOnly = caseKey === 'observe-listener' || caseKey === 'independent-query';
    const eventLog = createPublicClientEventLog();
    const platform = installPublicClientPlatform({ http: queryOnly
      ? [{ path: '/api/base/trade/query', body: successQuery(tradeNo) }]
      : [{ path: '/api/base/trade/pay', body: successPrepare(tradeNo) }, { path: '/api/base/trade/query', body: successQuery(tradeNo) }], eventLog }); cleanup = platform.restore;
    const { client, phases, pay } = createPublicHarness({}, eventLog);
    let result;
    if (caseKey === 'independent-query') result = await client.query({ tradeNo });
    else if (caseKey === 'observe-listener') {
      result = await client.observe({ tradeNo }, { onPhase: event => {
        phases.push(event); eventLog.record({ kind: 'phase', attemptId: event.attemptId, phase: event.phase });
      } });
      eventLog.record({ kind: 'terminal', attemptId: result.attemptId, outcome: result });
    } else result = await pay({ reference: { tradeNo }, method: 'wechat-miniapp-virtual-goods' }, caseKey !== 'no-listener');
    for (const check of checks) await checkpoint(check, () => {
      if (check === 'callback-optionality' || check === 'outcome-separate') expect(result).toBeTruthy();
      else if (check === 'query-no-notifications') expect(phases).toEqual([]);
      else if (check === 'confirming-order') {
        const phase = (name: string) => eventLog.events.findIndex(event => event.kind === 'phase' && event.phase === name);
        const query = eventLog.events.findIndex(event => event.kind === 'http-request' && event.path?.endsWith('/query'));
        const terminal = eventLog.events.findIndex(event => event.kind === 'terminal');
        expect(phase('confirming')).toBeGreaterThanOrEqual(0);
        expect(phase('confirming')).toBeLessThan(query);
        expect(query).toBeLessThan(terminal);
        if (!queryOnly) {
          const invoke = eventLog.events.findIndex(event => event.kind === 'channel-invoke');
          expect(phase('channel_invoking')).toBeLessThan(invoke);
          expect(invoke).toBeLessThan(eventLog.events.findIndex(event => event.kind === 'channel-callback'));
        }
        if (!('attemptId' in result)) throw new Error('phase case must return PaymentOutcome');
        const ids = eventLog.events.filter(event => event.attemptId).map(event => event.attemptId);
        expect(new Set(ids)).toEqual(new Set([result.attemptId]));
      }
      else expect(phases.map(event => event.phase)).toEqual(queryOnly ? ['confirming'] : ['channel_invoking', 'confirming']);
      expect(phases.every(event => Object.keys(event).sort().join(',') === 'attemptId,phase')).toBe(true);
    });
  }, { fixtureRoot });
}

defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-020', caseId: 'public-phase-type-surface', fixtureCase: 'public-phase-type-surface', environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CONTRACT-020', caseKey: 'public-phase-type-surface', checks: ['phase-type-surface'] }],
}, async ({ checkpoint, expect }) => {
  const dts = await readFile(new URL('../../../payment-sdk/dist/index.d.ts', import.meta.url), 'utf8');
  await checkpoint('phase-type-surface', () => {
    expect(dts).toMatch(/PaymentPhase[^;]*channel_invoking[^;]*confirming/s);
    expect(dts).toMatch(/onPhase\?/);
  });
}, { fixtureRoot });
