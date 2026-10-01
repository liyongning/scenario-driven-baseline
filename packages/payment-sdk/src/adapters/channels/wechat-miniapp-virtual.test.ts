import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Cancellation } from '@daqian/payment-protocol';
import type { PreparedPayment } from '../../ports/backend';
import type { ChannelContext } from '../../ports/channel';
import type { PaymentError } from '../../contracts';
import { createWechatMiniappVirtualChannel } from './wechat-miniapp-virtual';

type VirtualPaymentFailure = Readonly<{ errCode?: unknown; errMsg?: unknown }>;
type VirtualPaymentOptions = Readonly<{
  mode: string;
  signData: string;
  paySig: string;
  signature: string;
  success: () => void;
  fail: (error: VirtualPaymentFailure) => void;
}>;

const method = 'wechat-miniapp-virtual-goods';
const messages: Readonly<Record<PaymentError['code'], string>> = {
  AUTH_REQUIRED: '登录状态已失效，请重新登录', IDENTITY_REQUIRED: '缺少微信支付身份，请先完成绑定',
  CHANNEL_SESSION_REQUIRED: '支付会话已失效，请重新发起支付', UNSUPPORTED: '当前环境或支付方式不受支持',
  BUSY: '当前交易正在支付中，请勿重复操作', INVALID_INPUT: '支付参数无效', HOST_CONTEXT_ERROR: '获取支付上下文失败',
  NETWORK_ERROR: '网络请求失败，请稍后重试', PROTOCOL_ERROR: '支付响应格式异常', CHANNEL_ERROR: '支付渠道调用失败',
  SERVER_ERROR: '支付服务处理失败', CONFLICT: '当前支付操作存在冲突', TIMEOUT: '支付请求超时，请稍后确认支付结果',
};
function expectedError(code: PaymentError['code'], source: PaymentError['source'], details: Partial<PaymentError> = {}): PaymentError {
  return { code, source, message: messages[code], ...details };
}

function prepared(overrides: Record<string, unknown> = {}): PreparedPayment {
  return {
    reference: { tradeNo: 'trade-fixture-001' },
    paymentNo: 'payment-fixture-001',
    method,
    payParams: {
      kind: 'wechat_virtual',
      mode: 'short_series_goods',
      signData: '{"offerId":"fixture","env":0,"nested":{"z":2,"a":1}}',
      paySig: 'pay-sig-fixture',
      signature: 'signature-fixture',
    },
    ...overrides,
  } as PreparedPayment;
}

function context(overrides: Partial<ChannelContext> = {}): ChannelContext {
  return {
    attemptId: 'attempt-fixture-001',
    beforeInvoke: vi.fn(() => true),
    markInvoked: vi.fn(() => true),
    ...overrides,
  };
}

function controllableCancellation(initial = false) {
  let stopped = initial;
  const listeners = new Set<() => void>();
  const signal: Cancellation = {
    isStopped: vi.fn(() => stopped),
    subscribe: vi.fn(listener => {
      listeners.add(listener);
      if (stopped) listener();
      return vi.fn(() => listeners.delete(listener));
    }),
  };
  return {
    signal,
    stop() {
      if (stopped) return;
      stopped = true;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

function installPlatform(onCall?: (options: VirtualPaymentOptions) => void, canUse: unknown = true) {
  const requestVirtualPayment = vi.fn((options: VirtualPaymentOptions) => onCall?.(options));
  const canIUse = vi.fn(() => canUse);
  vi.stubGlobal('wx', { canIUse, requestVirtualPayment });
  return { requestVirtualPayment, canIUse };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('微信小程序虚拟商品渠道能力与参数边界', () => {
  test('创建首期唯一的微信小程序虚拟商品渠道适配器，且创建时不访问平台', () => {
    vi.stubGlobal('wx', {
      get canIUse(): never { throw new Error('creation must not read wx'); },
      get requestVirtualPayment(): never { throw new Error('creation must not read wx'); },
    });
    const channel = createWechatMiniappVirtualChannel();
    expect(channel.method).toBe(method);
  });

  test.each([
    ['无 wx', undefined],
    ['无 canIUse', { requestVirtualPayment(): void {} }],
    ['无 requestVirtualPayment', { canIUse: (): boolean => true }],
    ['错误的 requestVirtualPayment 类型', { canIUse: (): boolean => true, requestVirtualPayment: true }],
    ['canIUse 返回 false', { canIUse: (): boolean => false, requestVirtualPayment(): void {} }],
  ])('%s 时能力不可用', (_name, platform) => {
    vi.stubGlobal('wx', platform);
    expect(createWechatMiniappVirtualChannel().available()).toBe(false);
  });

  test('只查询官方 requestVirtualPayment 能力，异常时不可用', () => {
    const requestVirtualPayment = vi.fn();
    const canIUse = vi.fn(() => { throw new Error('capability failure'); });
    vi.stubGlobal('wx', { canIUse, requestVirtualPayment });
    expect(createWechatMiniappVirtualChannel().available()).toBe(false);
    expect(canIUse).toHaveBeenCalledOnce();
    expect(canIUse).toHaveBeenCalledWith('requestVirtualPayment');
    expect(requestVirtualPayment).not.toHaveBeenCalled();
  });

  test('平台能力有效时可用，并按调用时的 wx 状态判断', () => {
    const channel = createWechatMiniappVirtualChannel();
    vi.stubGlobal('wx', undefined);
    expect(channel.available()).toBe(false);
    const platform = installPlatform();
    expect(channel.available()).toBe(true);
    expect(platform.canIUse).toHaveBeenCalledWith('requestVirtualPayment');
  });

  test.each([
    ['method 不符', prepared({ method: 'future-method' })],
    ['payParams 缺失', prepared({ payParams: undefined })],
    ['kind 不符', prepared({ payParams: { ...prepared().payParams, kind: 'wechat_jsapi' } })],
    ['mode 不符', prepared({ payParams: { ...prepared().payParams, mode: 'short_series_coin' } })],
    ['signData 为空', prepared({ payParams: { ...prepared().payParams, signData: '' } })],
    ['paySig 为空', prepared({ payParams: { ...prepared().payParams, paySig: '' } })],
    ['signature 为空', prepared({ payParams: { ...prepared().payParams, signature: '' } })],
    ['signData 非字符串', prepared({ payParams: { ...prepared().payParams, signData: { env: 0 } } })],
  ])('%s 不通知、不调用平台，也不在前端补签', async (_name, payment) => {
    const platform = installPlatform();
    const ctx = context();
    const result = await createWechatMiniappVirtualChannel().invoke(payment, ctx);
    expect(result).toEqual({ ok: false, error: expectedError('PROTOCOL_ERROR', 'gateway') });
    expect(ctx.beforeInvoke).not.toHaveBeenCalled();
    expect(ctx.markInvoked).not.toHaveBeenCalled();
    expect(platform.requestVirtualPayment).not.toHaveBeenCalled();
  });

  test('能力缺失时返回 unsupported，且不触发渠道通知点', async () => {
    vi.stubGlobal('wx', { canIUse: () => false, requestVirtualPayment: vi.fn() });
    const ctx = context();
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), ctx)).toEqual({
      ok: false,
      error: expectedError('UNSUPPORTED', 'sdk'),
    });
    expect(ctx.beforeInvoke).not.toHaveBeenCalled();
    expect(ctx.markInvoked).not.toHaveBeenCalled();
  });

  test.each([
    ['省略环境', '{"offerId":"fixture","env":0,"order":[2,1]}'],
    ['sandbox 请求对应响应', '{ "offerId" : "sandbox-fixture", "env" : 1, "raw" : "a\\\\b" }'],
    ['prod 请求对应响应', '{"offerId":"prod-fixture","env":0,"raw":"保持原文"}'],
  ])('%s 的端侧参数只有四个业务字段并逐字保留 signData', async (_name, signData) => {
    let options!: VirtualPaymentOptions;
    const platform = installPlatform(value => { options = value; });
    const running = createWechatMiniappVirtualChannel().invoke(prepared({
      payParams: { ...prepared().payParams, signData },
      xpayEnv: 'sandbox',
    }), context());
    expect(platform.requestVirtualPayment).toHaveBeenCalledOnce();
    expect(options.signData).toBe(signData);
    expect(options).toMatchObject({
      mode: 'short_series_goods', signData, paySig: 'pay-sig-fixture', signature: 'signature-fixture',
    });
    expect(Object.keys(options).sort()).toEqual(['fail', 'mode', 'paySig', 'signData', 'signature', 'success']);
    expect(options).not.toHaveProperty('kind');
    expect(options).not.toHaveProperty('xpayEnv');
    options.fail({ errCode: -2 });
    expect(await running).toEqual({ ok: true, value: { kind: 'signal', signal: 'cancelled' } });
  });
});

describe('微信小程序虚拟商品渠道调用顺序', () => {
  test('先取得方法并准备四字段，再依次通知、第二次停止检查、标记并紧接平台调用', async () => {
    const trace: string[] = [];
    const params = prepared().payParams;
    const payment = prepared();
    Object.defineProperty(payment, 'payParams', {
      get() {
        trace.push('params');
        return params;
      },
    });
    const cancellation: Cancellation = {
      isStopped: vi.fn(() => { trace.push('stop_check'); return false; }),
      subscribe: vi.fn(listener => { trace.push('subscribe'); void listener; return () => { trace.push('unsubscribe'); }; }),
    };
    const requestVirtualPayment = vi.fn((options: VirtualPaymentOptions) => {
      trace.push('platform');
      options.success();
    });
    vi.stubGlobal('wx', {
      canIUse: () => true,
      get requestVirtualPayment() {
        trace.push('method');
        return requestVirtualPayment;
      },
    });
    const ctx = context({
      cancellation,
      beforeInvoke: vi.fn(() => { trace.push('beforeInvoke'); return true; }),
      markInvoked: vi.fn(() => { trace.push('markInvoked'); return true; }),
    });
    expect(await createWechatMiniappVirtualChannel().invoke(payment, ctx)).toEqual({
      ok: true, value: { kind: 'signal', signal: 'success_hint' },
    });
    expect(trace).toEqual([
      'method', 'params', 'stop_check', 'subscribe', 'beforeInvoke', 'stop_check', 'markInvoked', 'platform', 'unsubscribe',
    ]);
    expect(requestVirtualPayment).toHaveBeenCalledOnce();
  });

  test('beforeInvoke 返回 false 时 stopped，且不再检查、标记或调用平台', async () => {
    const host = controllableCancellation();
    const platform = installPlatform();
    const ctx = context({ cancellation: host.signal, beforeInvoke: vi.fn(() => false) });
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), ctx)).toEqual({ ok: true, value: { kind: 'stopped' } });
    expect(host.signal.isStopped).toHaveBeenCalledOnce();
    expect(ctx.markInvoked).not.toHaveBeenCalled();
    expect(platform.requestVirtualPayment).not.toHaveBeenCalled();
    expect(host.listenerCount()).toBe(0);
  });

  test('通知后的第二次停止检查命中时 stopped/not-invoked 边界不调用 markInvoked 或平台', async () => {
    const platform = installPlatform();
    const isStopped = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const unsubscribe = vi.fn();
    const cancellation: Cancellation = { isStopped, subscribe: vi.fn(() => unsubscribe) };
    const ctx = context({ cancellation });
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), ctx)).toEqual({ ok: true, value: { kind: 'stopped' } });
    expect(ctx.beforeInvoke).toHaveBeenCalledOnce();
    expect(ctx.markInvoked).not.toHaveBeenCalled();
    expect(platform.requestVirtualPayment).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  test('markInvoked 返回 false 时 stopped 且平台为零次', async () => {
    const platform = installPlatform();
    const ctx = context({ markInvoked: vi.fn(() => false) });
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), ctx)).toEqual({ ok: true, value: { kind: 'stopped' } });
    expect(ctx.beforeInvoke).toHaveBeenCalledOnce();
    expect(ctx.markInvoked).toHaveBeenCalledOnce();
    expect(platform.requestVirtualPayment).not.toHaveBeenCalled();
  });

  test('同步平台调用抛错时已完成实际调用标记并归为渠道错误', async () => {
    const platform = installPlatform(() => { throw new Error('sensitive platform detail'); });
    const ctx = context();
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), ctx)).toEqual({
      ok: false, error: expectedError('CHANNEL_ERROR', 'channel'),
    });
    expect(ctx.markInvoked).toHaveBeenCalledOnce();
    expect(platform.requestVirtualPayment).toHaveBeenCalledOnce();
  });
});

describe('微信小程序虚拟商品渠道回调与停止生命周期', () => {
  test('success 回调映射 success_hint', async () => {
    installPlatform(options => options.success());
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), context())).toEqual({
      ok: true, value: { kind: 'signal', signal: 'success_hint' },
    });
  });

  test.each([
    [-2, { ok: true, value: { kind: 'signal', signal: 'cancelled' } }],
    [-5, { ok: true, value: { kind: 'signal', signal: 'unknown' } }],
    [-15007, { ok: false, error: expectedError('CHANNEL_SESSION_REQUIRED', 'channel', { originalCode: '-15007', channelMessage: 'must not escape' }) }],
  ])('官方特殊失败码 %s 使用独立语义', async (errCode, expected) => {
    installPlatform(options => options.fail({ errCode, errMsg: 'must not escape' }));
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), context())).toEqual(expected);
  });

  test.each([
    1001, -1, -4,
    -15001, -15002, -15003, -15004, -15005, -15006, -15008, -15009, -15010,
    -15011, -15012, -15013, -15014, -15016, -15017, -15018, -15019, -15020, -15021,
    16, -15015, 42, -99999,
  ])('明确调起失败码 %s 保留十进制原码并透传字符串 errMsg', async errCode => {
    installPlatform(options => options.fail({ errCode, errMsg: 'must not escape' }));
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), context())).toEqual({
      ok: false, error: expectedError('CHANNEL_ERROR', 'channel', { originalCode: String(errCode), channelMessage: 'must not escape' }),
    });
  });

  test.each([
    ['字符串', 'requestVirtualPayment:fail session expired', 'requestVirtualPayment:fail session expired'],
    ['缺失', undefined, undefined],
    ['null', null, undefined],
    ['对象', { detail: 'private' }, undefined],
  ])('-15007 的 %s errMsg 只按字符串边界透传', async (_name, errMsg, channelMessage) => {
    installPlatform(options => options.fail({ errCode: -15007, ...(errMsg === undefined ? {} : { errMsg }) }));
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), context())).toEqual({
      ok: false,
      error: {
        code: 'CHANNEL_SESSION_REQUIRED', source: 'channel', message: '支付会话已失效，请重新发起支付', originalCode: '-15007',
        ...(channelMessage === undefined ? {} : { channelMessage }),
      },
    });
  });

  test.each([0, undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1, '16', '-15007'])('无可用错误码 %s 保留 unknown，不解析 errMsg', async errCode => {
    installPlatform(options => options.fail({ errCode, errMsg: 'session_key expired' }));
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), context())).toEqual({
      ok: true, value: { kind: 'signal', signal: 'unknown' },
    });
  });

  test('重复 success/fail 回调只接纳第一个并只清理一次', async () => {
    const host = controllableCancellation();
    let options!: VirtualPaymentOptions;
    const ctx = context({ cancellation: host.signal });
    installPlatform(value => { options = value; });
    const running = createWechatMiniappVirtualChannel().invoke(prepared(), ctx);
    options.success();
    options.fail({ errCode: -15007 });
    options.success();
    expect(await running).toEqual({ ok: true, value: { kind: 'signal', signal: 'success_hint' } });
    expect(ctx.beforeInvoke).toHaveBeenCalledOnce();
    expect(ctx.markInvoked).toHaveBeenCalledOnce();
    expect(host.signal.subscribe).toHaveBeenCalledOnce();
    expect(host.listenerCount()).toBe(0);
  });

  test('无回调时没有 SDK timer、查询或自动结算，显式停止才返回 stopped', async () => {
    vi.useFakeTimers();
    try {
      const host = controllableCancellation();
      installPlatform();
      let settled = false;
      const running = createWechatMiniappVirtualChannel().invoke(prepared(), context({ cancellation: host.signal }));
      void running.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(settled).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      host.stop();
      expect(await running).toEqual({ ok: true, value: { kind: 'stopped' } });
      expect(host.listenerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('调用前已经停止时不通知、不标记、不调用平台', async () => {
    const host = controllableCancellation(true);
    const platform = installPlatform();
    const ctx = context({ cancellation: host.signal });
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), ctx)).toEqual({ ok: true, value: { kind: 'stopped' } });
    expect(ctx.beforeInvoke).not.toHaveBeenCalled();
    expect(ctx.markInvoked).not.toHaveBeenCalled();
    expect(platform.requestVirtualPayment).not.toHaveBeenCalled();
  });

  test('订阅同步报告停止时立即清理，不通知或调用平台', async () => {
    const platform = installPlatform();
    const unsubscribe = vi.fn();
    const cancellation: Cancellation = {
      isStopped: vi.fn(() => false),
      subscribe: vi.fn(listener => {
        listener();
        return unsubscribe;
      }),
    };
    const ctx = context({ cancellation });
    expect(await createWechatMiniappVirtualChannel().invoke(prepared(), ctx)).toEqual({ ok: true, value: { kind: 'stopped' } });
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(ctx.beforeInvoke).not.toHaveBeenCalled();
    expect(ctx.markInvoked).not.toHaveBeenCalled();
    expect(platform.requestVirtualPayment).not.toHaveBeenCalled();
  });

  test('等待中平台回调先到时忽略后续宿主停止', async () => {
    const host = controllableCancellation();
    let options!: VirtualPaymentOptions;
    installPlatform(value => { options = value; });
    const running = createWechatMiniappVirtualChannel().invoke(prepared(), context({ cancellation: host.signal }));
    options.fail({ errCode: -2 });
    host.stop();
    expect(await running).toEqual({ ok: true, value: { kind: 'signal', signal: 'cancelled' } });
    expect(host.listenerCount()).toBe(0);
  });

  test('等待中宿主停止先到时忽略后续平台回调', async () => {
    const host = controllableCancellation();
    let options!: VirtualPaymentOptions;
    installPlatform(value => { options = value; });
    const running = createWechatMiniappVirtualChannel().invoke(prepared(), context({ cancellation: host.signal }));
    host.stop();
    options.success();
    options.fail({ errCode: -15007 });
    expect(await running).toEqual({ ok: true, value: { kind: 'stopped' } });
    expect(host.listenerCount()).toBe(0);
  });

  test('旧运行停止后的迟到回调不影响同一适配器的新运行', async () => {
    const channel = createWechatMiniappVirtualChannel();
    const oldHost = controllableCancellation();
    const calls: VirtualPaymentOptions[] = [];
    const platform = installPlatform(options => calls.push(options));
    const old = channel.invoke(prepared(), context({ cancellation: oldHost.signal }));
    oldHost.stop();
    expect(await old).toEqual({ ok: true, value: { kind: 'stopped' } });

    const next = channel.invoke(prepared({ paymentNo: 'payment-fixture-002' }), context({ attemptId: 'attempt-fixture-002' }));
    expect(platform.requestVirtualPayment).toHaveBeenCalledTimes(2);
    calls[0]?.success();
    calls[0]?.fail({ errCode: -15007 });
    calls[1]?.fail({ errCode: -2 });
    expect(await next).toEqual({ ok: true, value: { kind: 'signal', signal: 'cancelled' } });
  });
});
