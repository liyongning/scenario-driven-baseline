import { describe, expect, it } from 'vitest';
import { createChannelDouble } from './channel-double.ts';

describe('createChannelDouble', () => {
  it('replays channel results in order and records only admitted calls', async () => {
    const double = createChannelDouble([{ kind: 'signal', signal: 'success_hint' }, { kind: 'signal', signal: 'cancelled' }]);
    const context = { attemptId: 'a', beforeInvoke: () => true, markInvoked: () => true };
    expect(await double.adapter.invoke({ tradeNo: 't-1', paymentNo: 'p-1' }, context)).toEqual({ ok: true, value: { kind: 'signal', signal: 'success_hint' } });
    expect(await double.adapter.invoke({ tradeNo: 't-2', paymentNo: 'p-2' }, context)).toEqual({ ok: true, value: { kind: 'signal', signal: 'cancelled' } });
    expect(double.calls()).toEqual([{ tradeNo: 't-1', paymentNo: 'p-1' }, { tradeNo: 't-2', paymentNo: 'p-2' }]);
    expect(double.adapter.available()).toBe(true);
    const snapshot = double.calls();
    snapshot[0]!.tradeNo = 'mutated';
    expect(double.calls()[0]!.tradeNo).toBe('t-1');
  });

  it('stops before recording when either invocation gate closes', async () => {
    const double = createChannelDouble([{ kind: 'signal', signal: 'success_hint' }]);
    const payment = { tradeNo: 't', paymentNo: 'p' };
    expect(await double.adapter.invoke(payment, { beforeInvoke: () => false, markInvoked: () => true })).toEqual({ ok: true, value: { kind: 'stopped' } });
    expect(await double.adapter.invoke(payment, { beforeInvoke: () => true, markInvoked: () => false })).toEqual({ ok: true, value: { kind: 'stopped' } });
    expect(double.calls()).toEqual([]);
  });

  it('fails explicitly after the configured outcomes are exhausted', async () => {
    const double = createChannelDouble([]);
    expect(await double.adapter.invoke(
      { tradeNo: 't', paymentNo: 'p' },
      { beforeInvoke: () => true, markInvoked: () => true },
    )).toEqual({ ok: false, error: { code: 'TEST_CHANNEL_EXHAUSTED', source: 'sdk' } });
    expect(double.calls()).toEqual([{ tradeNo: 't', paymentNo: 'p' }]);
  });
});
