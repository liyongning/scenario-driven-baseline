type Invocation = Readonly<{ kind: 'signal'; signal: 'success_hint' | 'cancelled' | 'failed' | 'unknown' }> | Readonly<{ kind: 'stopped' }>;
type Payment = Readonly<{ tradeNo: string; paymentNo: string }>;
type Context = Readonly<{ beforeInvoke: () => boolean; markInvoked: () => boolean }>;

/** E2E 渠道替身；控制外部回调，不模拟 SDK 核心或协议请求。 */
export function createChannelDouble(outcomes: ReadonlyArray<Invocation>) {
  const recorded: Payment[] = [];
  let cursor = 0;
  return {
    adapter: {
      method: 'wechat-miniapp-virtual-goods',
      available: () => true,
      async invoke(payment: Payment, context: Context) {
        if (!context.beforeInvoke() || !context.markInvoked()) return { ok: true as const, value: { kind: 'stopped' as const } };
        recorded.push({ tradeNo: payment.tradeNo, paymentNo: payment.paymentNo });
        const outcome = outcomes[cursor++];
        return outcome ? { ok: true as const, value: outcome } : { ok: false as const, error: { code: 'TEST_CHANNEL_EXHAUSTED', source: 'sdk' as const } };
      },
    },
    calls: () => recorded.map(value => ({ ...value })),
  };
}
