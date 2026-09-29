import { afterEach, expect, test, vi } from 'vitest';
import type { PaymentBackend, PreparedPayment } from '../../ports/backend';
import type { ChannelAdapter, ChannelContext } from '../../ports/channel';
import type { RuntimePort } from '../../ports/runtime';
import type { Cancellation } from '@daqian/payment-protocol';
import { createCoreClient } from '../../core/client';
import { createWechatMiniappVirtualChannel } from './wechat-miniapp-virtual';

const reference = { tradeNo: 'trade-extension-001' } as const;
const prepared: PreparedPayment = {
  reference,
  paymentNo: 'payment-extension-001',
  method: 'future-action',
  payParams: { kind: 'wechat_virtual', mode: 'short_series_goods', signData: '{}', paySig: 'fixture', signature: 'fixture' },
};
const runtime: RuntimePort = {
  nowMs: () => 0,
  nextAttemptId: () => 'attempt-extension-001',
  nextRequestId: () => 'request-extension-001',
  sleepMs: () => new Promise(() => {}),
};

afterEach(() => vi.unstubAllGlobals());

function stopping() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const signal: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    signal,
    stop() {
      stopped = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test.each([
  { kind: 'redirect', url: 'https://fixture.invalid/next' },
  { kind: 'qr_code', content: 'fixture-content' },
] as const)('内部假适配可扩展 $kind 动作，核心不执行 DOM、UI 或导航', async action => {
  const prepare = vi.fn(async () => ({ ok: true as const, value: prepared }));
  const query = vi.fn(async () => ({
    ok: true as const,
    value: { reference, state: 'PAID' as const, source: 'server' as const, observedAtMs: 0 },
  }));
  let observedContext: ChannelContext | undefined;
  const invoke = vi.fn(async (_payment: PreparedPayment, channelContext: ChannelContext) => {
    observedContext = channelContext;
    vi.spyOn(channelContext, 'beforeInvoke');
    vi.spyOn(channelContext, 'markInvoked');
    return { ok: true as const, value: { kind: 'action' as const, action } };
  });
  const onPhase = vi.fn();
  const backend: PaymentBackend = { prepare, query };
  const channel: ChannelAdapter = { method: 'future-action', available: () => true, invoke };
  const client = createCoreClient({ backend, channels: [channel], enabledMethods: ['future-action'], runtime });
  vi.stubGlobal('window', { get location(): never { throw new Error('must not navigate'); } });
  vi.stubGlobal('document', { get body(): never { throw new Error('must not render'); } });

  const outcome = await client.pay({ reference, method: 'future-action' as never }, { onPhase });
  expect(outcome).toMatchObject({ reason: 'action_required', channelSignal: 'not_invoked', nextAction: action });
  expect(invoke).toHaveBeenCalledOnce();
  expect(observedContext).toBeDefined();
  expect(observedContext!.beforeInvoke).not.toHaveBeenCalled();
  expect(observedContext!.markInvoked).not.toHaveBeenCalled();
  expect(onPhase).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();

  expect(await client.query(reference)).toMatchObject({ ok: true, value: { state: 'PAID' } });
  expect(await client.observe(reference)).toMatchObject({ reason: 'confirmed' });
  expect(invoke).toHaveBeenCalledOnce();
});

test('真实适配器在 channel_invoking 通知内停止时保持 not_invoked，平台和查询均为零次', async () => {
  const host = stopping();
  const requestVirtualPayment = vi.fn();
  vi.stubGlobal('wx', { canIUse: () => true, requestVirtualPayment });
  const prepare = vi.fn(async () => ({ ok: true as const, value: { ...prepared, method: 'wechat-miniapp-virtual-goods' } }));
  const query = vi.fn();
  const client = createCoreClient({
    backend: { prepare, query } as PaymentBackend,
    channels: [createWechatMiniappVirtualChannel()],
    enabledMethods: ['wechat-miniapp-virtual-goods'], runtime,
  });

  const outcome = await client.pay(
    { reference, method: 'wechat-miniapp-virtual-goods' },
    { cancellation: host.signal, onPhase: () => host.stop() },
  );
  expect(outcome).toMatchObject({ reason: 'stopped', channelSignal: 'not_invoked' });
  expect(requestVirtualPayment).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});

test('真实适配器在平台调用后停止时保持 unknown，旧回调不污染同交易新运行', async () => {
  const host = stopping();
  const platformCalls: Array<{ success: () => void; fail: (value: { errCode: number }) => void }> = [];
  const requestVirtualPayment = vi.fn(options => platformCalls.push(options));
  vi.stubGlobal('wx', { canIUse: () => true, requestVirtualPayment });
  const prepare = vi.fn(async () => ({ ok: true as const, value: { ...prepared, method: 'wechat-miniapp-virtual-goods' } }));
  const query = vi.fn();
  const client = createCoreClient({
    backend: { prepare, query } as PaymentBackend,
    channels: [createWechatMiniappVirtualChannel()],
    enabledMethods: ['wechat-miniapp-virtual-goods'], runtime,
  });

  const old = client.pay({ reference, method: 'wechat-miniapp-virtual-goods' }, { cancellation: host.signal });
  await flush();
  expect(requestVirtualPayment).toHaveBeenCalledOnce();
  host.stop();
  expect(await old).toMatchObject({ reason: 'stopped', channelSignal: 'unknown' });
  expect(query).not.toHaveBeenCalled();

  const next = client.pay({ reference, method: 'wechat-miniapp-virtual-goods' });
  await flush();
  expect(requestVirtualPayment).toHaveBeenCalledTimes(2);
  platformCalls[0]?.success();
  platformCalls[0]?.fail({ errCode: -15007 });
  platformCalls[1]?.fail({ errCode: -2 });
  expect(await next).toMatchObject({ reason: 'channel_cancelled', channelSignal: 'cancelled' });
  expect(query).not.toHaveBeenCalled();
  expect(prepare).toHaveBeenCalledTimes(2);
});
