import { test, vi, type TestContext } from 'vitest';
import type { PaymentBackend, PreparedPayment } from '../ports/backend';
import type { ChannelAdapter } from '../ports/channel';
import type { RuntimePort } from '../ports/runtime';
import { createCoreClient } from './client';

const reference = { tradeNo: 'trade-module-001' } as const;
const runtime: RuntimePort = {
  nowMs: () => 0,
  nextAttemptId: () => 'attempt-module-001',
  nextRequestId: () => 'request-module-001',
  sleepMs: () => new Promise(() => undefined),
};

async function annotate(context: TestContext, before: number, checkpoints: string[]) {
  await context.annotate(JSON.stringify({
    assertions: context.expect.getState().assertionCalls - before,
    checkpoints,
  }), 'payment-evidence');
}

test('TC-PAYSDK-CORE-001 headless-core-import-and-run', {
  meta: { paymentCase: {
    ownerId: 'TC-PAYSDK-CORE-001', caseId: 'headless-core-import-and-run', environment: 'sdk-unit', fixtureCase: null,
    covers: [
      { id: 'TC-PAYSDK-CORE-001', caseKey: 'headless-core-import-and-run', checks: ['headless-internal-core'] },
      { id: 'TC-PAYSDK-CONTRACT-001', caseKey: 'headless-core-with-fake-ports', checks: ['headless-core-evidence'] },
    ],
  } },
}, async (context: TestContext) => {
  const before = context.expect.getState().assertionCalls;
  const prepared: PreparedPayment = {
    reference, paymentNo: 'payment-module-001', method: 'wechat-miniapp-virtual-goods',
    payParams: { kind: 'wechat_virtual', mode: 'short_series_goods', signData: '{}', paySig: 'sig', signature: 'signature' },
  };
  const backend: PaymentBackend = {
    prepare: async () => ({ ok: true, value: prepared }),
    query: async () => ({ ok: true, value: { reference, state: 'PAID', source: 'server', observedAtMs: 0 } }),
  };
  const channel: ChannelAdapter = {
    method: 'wechat-miniapp-virtual-goods', available: () => true,
    async invoke(_payment, channelContext) {
      if (!channelContext.beforeInvoke() || !channelContext.markInvoked()) return { ok: true, value: { kind: 'stopped' } };
      return { ok: true, value: { kind: 'signal', signal: 'success_hint' } };
    },
  };

  const outcome = await createCoreClient({ backend, channels: [channel], enabledMethods: [channel.method as never], runtime })
    .pay({ reference, method: channel.method as never });

  context.expect(outcome).toMatchObject({ reason: 'confirmed', paymentNo: 'payment-module-001', snapshot: { state: 'PAID' } });
  await annotate(context, before, ['headless-internal-core', 'headless-core-evidence']);
});

test('TC-PAYSDK-CORE-002 alternate-method-internal-adapter', {
  meta: { paymentCase: {
    ownerId: 'TC-PAYSDK-CORE-002', caseId: 'alternate-method-internal-adapter', environment: 'sdk-unit', fixtureCase: null,
    covers: [
      { id: 'TC-PAYSDK-CORE-002', caseKey: 'alternate-method-internal-adapter', checks: ['internal-extension'] },
      { id: 'TC-PAYSDK-CORE-010', caseKey: 'replace-internal-channel-port', checks: ['channel-port-isolation'] },
    ],
  } },
}, async (context: TestContext) => {
  const before = context.expect.getState().assertionCalls;
  const query = vi.fn<PaymentBackend['query']>();
  const backend: PaymentBackend = {
    prepare: async request => ({ ok: true, value: {
      reference: request.reference, paymentNo: 'payment-action-001', method: request.method as never,
      payParams: { kind: 'wechat_virtual', mode: 'short_series_goods', signData: '{}', paySig: 'sig', signature: 'signature' },
    } }),
    query,
  };
  const channel: ChannelAdapter = {
    method: 'future-action', available: () => true,
    async invoke() { return { ok: true, value: { kind: 'action', action: { kind: 'redirect', url: 'https://fixture.invalid' } } }; },
  };

  const outcome = await createCoreClient({ backend, channels: [channel], enabledMethods: [channel.method], runtime })
    .pay({ reference, method: channel.method as never });

  context.expect(outcome).toMatchObject({ reason: 'action_required', channelSignal: 'not_invoked', nextAction: { kind: 'redirect' } });
  context.expect(query).not.toHaveBeenCalled();
  await annotate(context, before, ['internal-extension', 'channel-port-isolation']);
});

test('TC-PAYSDK-CORE-024 core-invoke-failure-classification', {
  meta: { paymentCase: {
    ownerId: 'TC-PAYSDK-CORE-024', caseId: 'core-invoke-failure-classification', environment: 'sdk-unit', fixtureCase: null,
    covers: [
      { id: 'TC-PAYSDK-CORE-024', caseKey: 'core-invoke-failure-classification', checks: ['thrown-invocation-no-code-classification', 'no-confirming-or-query-on-explicit-failure'] },
    ],
  } },
}, async (context: TestContext) => {
  const before = context.expect.getState().assertionCalls;
  const query = vi.fn<PaymentBackend['query']>(async ref => ({ ok: true, value: { reference: ref, state: 'PAID', source: 'server', observedAtMs: 0 } }));
  const backend: PaymentBackend = {
    prepare: async request => ({ ok: true, value: {
      reference: request.reference, paymentNo: 'payment-core-024', method: request.method as never,
      payParams: { kind: 'wechat_virtual', mode: 'short_series_goods', signData: '{}', paySig: 'sig', signature: 'signature' },
    } }),
    query,
  };
  const phases: string[] = [];
  // invoke 阶段抛错/以 CHANNEL_ERROR 返回都按明确调起失败结算；异常原文不进入结果或诊断。
  for (const kind of ['throw', 'port-error'] as const) {
    const channel: ChannelAdapter = {
      method: 'wechat-miniapp-virtual-goods', available: () => true,
      async invoke(_payment, channelContext) {
        if (!channelContext.beforeInvoke() || !channelContext.markInvoked()) return { ok: true, value: { kind: 'stopped' } };
        if (kind === 'throw') throw new Error('fixture-private-channel');
        return { ok: false, error: {
          code: 'CHANNEL_ERROR', source: 'channel', message: '支付渠道调用失败', originalCode: '-15010',
          channelMessage: 'requestVirtualPayment:fail fixture-channel',
        } };
      },
    };
    const outcome = await createCoreClient({ backend, channels: [channel], enabledMethods: [channel.method as never], runtime })
      .pay({ reference, method: channel.method as never }, { onPhase: event => phases.push(event.phase) });
    context.expect(outcome).toMatchObject({ reason: 'launch_failed', channelSignal: 'launch_failed', snapshot: { state: 'UNKNOWN', source: 'unavailable' } });
    if (kind === 'throw') {
      context.expect(outcome.error).toMatchObject({ code: 'CHANNEL_ERROR', source: 'channel' });
      context.expect(outcome.error).not.toHaveProperty('originalCode');
    } else context.expect(outcome.error).toEqual({
      code: 'CHANNEL_ERROR', source: 'channel', message: '支付渠道调用失败', originalCode: '-15010',
      channelMessage: 'requestVirtualPayment:fail fixture-channel',
    });
  }
  // 明确调起失败只通知 channel_invoking，不进入 confirming、不发起 QueryTrade、不重新 prepare。
  context.expect(phases).toEqual(['channel_invoking', 'channel_invoking']);
  context.expect(query).not.toHaveBeenCalled();
  await annotate(context, before, ['thrown-invocation-no-code-classification', 'no-confirming-or-query-on-explicit-failure']);
});
