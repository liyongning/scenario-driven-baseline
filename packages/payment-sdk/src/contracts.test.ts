import { expect, test } from 'vitest';
import type { PaymentClient, PaymentClientOptions, PaymentRequest, PaymentRequestContext, RunOptions, TradeReference, PaymentPhase } from './index';
import type { ChannelContext } from './ports/channel';

// TC-PAYSDK-CONTRACT-001/002/019/020/021/022：tsc 真实编译正反消费者。
function consume(client: PaymentClient) {
  const ref = { tradeNo: 'T1' };
  const omitted: PaymentRequest = { reference: ref, method: 'wechat-miniapp-virtual-goods' };
  const undefinedEnv: PaymentRequest = { ...omitted, xpayEnv: undefined };
  const sandbox: PaymentRequest = { ...omitted, xpayEnv: 'sandbox' };
  const prod: PaymentRequest = { ...omitted, xpayEnv: 'prod' };
  const options: PaymentClientOptions = { runtime: 'wechat-miniapp', gatewayBaseUrl: 'https://example.invalid', appId: 'test-app', enabledMethods: ['wechat-miniapp-virtual-goods'], getAccessToken: () => null };
  const override: PaymentClientOptions = { ...options, policy: { observation: { intervalMs: 10 } } };
  void client.pay(omitted);
  void client.pay(sandbox, { policy: { observation: { maxWaitMs: 10 } }, onPhase(event) {
    const id: string = event.attemptId;
    switch (event.phase) { case 'channel_invoking': break; case 'confirming': break; default: { const exhaustive: never = event.phase; void exhaustive; } }
    // @ts-expect-error 阶段事件只读。
    event.attemptId = id;
    // @ts-expect-error 阶段事件只读。
    event.phase = 'confirming';
    // @ts-expect-error 阶段事件不泄露支付参数。
    void event.payParams;
  } });
  void client.observe(ref, { onPhase: event => { const phase: PaymentPhase = event.phase; void phase; } });
  // @ts-expect-error 不接受协议数字。
  const numeric: PaymentRequest = { ...omitted, xpayEnv: 2 };
  // @ts-expect-error 不接受未设置枚举。
  const unspecified: PaymentRequest = { ...omitted, xpayEnv: 'UNSPECIFIED' };
  // @ts-expect-error 环境不属于运行控制。
  const wrongRun: RunOptions = { xpayEnv: 'sandbox' };
  // @ts-expect-error 环境不属于初始化。
  const wrongInit: PaymentClientOptions = { ...options, xpayEnv: 'sandbox' };
  // @ts-expect-error 环境不属于请求上下文。
  const wrongContext: PaymentRequestContext = { xpayEnv: 'sandbox' };
  // @ts-expect-error 环境不属于交易引用。
  const wrongRef: TradeReference = { ...ref, xpayEnv: 'sandbox' };
  // @ts-expect-error SDK 不接收微信身份输入。
  const openId: PaymentRequest = { ...omitted, openId: 'invalid' };
  // @ts-expect-error 设备信息不由业务配置。
  const platform: PaymentRequestContext = { clientPlatform: 'ios' };
  // @ts-expect-error 无进度通知字段。
  const progress: RunOptions = { onProgress: () => undefined };
  // @ts-expect-error 阶段回调不属于初始化。
  const phaseInit: PaymentClientOptions = { ...options, onPhase: () => undefined };
  // @ts-expect-error 网络端口不属于公共初始化。
  const requestInit: PaymentClientOptions = { ...options, request: {} };
  // @ts-expect-error backend 不属于公共初始化。
  const backendInit: PaymentClientOptions = { ...options, backend: {} };
  // @ts-expect-error runtime 只接受平台字符串。
  const runtimeInit: PaymentClientOptions = { ...options, runtime: {} };
  const channel: ChannelContext = { attemptId: 'a', beforeInvoke: () => true, markInvoked: () => true };
  // @ts-expect-error 内部渠道不能省略同步通知闸门。
  const noNotification: ChannelContext = { attemptId: 'a', markInvoked: () => true };
  // @ts-expect-error 内部渠道不能以通知代替实际调用标记。
  const noInvocationMark: ChannelContext = { attemptId: 'a', beforeInvoke: () => true };
  // @ts-expect-error 实际调用标记必须同步返回 boolean。
  const asynchronousMark: ChannelContext = { ...channel, markInvoked: async () => true };
  // @ts-expect-error 无 preparing 阶段。
  const preparing: PaymentPhase = 'preparing';
  // @ts-expect-error 无 channel_returned 阶段。
  const returned: PaymentPhase = 'channel_returned';
  // @ts-expect-error 最终结果不是阶段。
  const ended: PaymentPhase = 'ended';
  return [undefinedEnv, prod, override, numeric, unspecified, wrongRun, wrongInit, wrongContext, wrongRef, openId, platform, progress, phaseInit, requestInit, backendInit, runtimeInit, channel, noNotification, noInvocationMark, asynchronousMark, preparing, returned, ended];
}
void consume;

test('无平台全局时可导入公共工厂且创建客户端不访问平台', async () => {
  expect('wx' in globalThis).toBe(false);
  expect('window' in globalThis).toBe(false);
  expect('document' in globalThis).toBe(false);
  const entry = await import('./index');
  expect(Object.keys(entry).sort()).toEqual(['PaymentConfigurationError', 'createPaymentClient']);
  expect(() => entry.createPaymentClient({
    runtime: 'wechat-miniapp', gatewayBaseUrl: 'https://fixture.invalid', appId: 'fixture-app',
    enabledMethods: ['wechat-miniapp-virtual-goods'], getAccessToken: () => null,
  })).not.toThrow();
  expect('wx' in globalThis).toBe(false);
  await import('./runtime/default');
});
