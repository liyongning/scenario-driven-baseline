import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Cancellation, OperationContext } from '../../ports/context';
import type { HttpRequest } from '../../ports/http';
import { createWechatMiniappHttp } from './wechat-miniapp';

// SDK-09/10、CONTRACT-08/10 的网络部分；不证明 CreateTradePay/QueryTrade 或真实微信联调。
// 捕捉的错误：改写请求、以 HTTP 状态判业务失败、重放、漏 abort/清理、旧回调覆盖本次结果。
type PlatformOptions = {
  url: string;
  method: 'GET' | 'POST';
  header: Readonly<Record<string, string>>;
  data?: string;
  timeout: number;
  dataType: string;
  responseType: string;
  success: (response: { statusCode: number; header: Record<string, string>; data: unknown }) => void;
  fail: (error: { errMsg: string }) => void;
};

function fakeWechat(options: { duringRequest?: () => void; abortThrows?: boolean; requestThrows?: boolean } = {}) {
  const sent: PlatformOptions[] = [];
  let abortCount = 0;
  vi.stubGlobal('wx', {
    request(input: PlatformOptions) {
      sent.push(input);
      if (options.requestThrows) throw new Error('platform unavailable');
      options.duringRequest?.();
      return {
        abort() {
          abortCount += 1;
          // 微信 abort 可同步回调 fail；它不得覆盖先到的 TIMEOUT/CANCELLED。
          input.fail({ errMsg: 'request:fail abort' });
          if (options.abortThrows) throw new Error('abort unavailable');
        },
      };
    },
  });
  return { sent, get sendCount() { return sent.length; }, get abortCount() { return abortCount; } };
}

function cancellationSource() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const cancellation: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return {
    cancellation,
    stop() { stopped = true; for (const listener of [...listeners]) listener(); },
    get listenerCount() { return listeners.size; },
  };
}

const request: HttpRequest = {
  url: 'https://gateway.invalid/payment?unchanged=1', method: 'POST',
  headers: { lane: 'test-lane', 'Content-Type': 'application/json', 'X-Test': '  unchanged  ' },
  body: '{ "signData": "  raw ", "xpayEnv": "XPAY_ENV_SANDBOX" }', timeoutMs: 125,
};
const response = { statusCode: 200, header: { 'X-Response': ' unchanged ' }, data: ' { "baseResp": {"statusCode":401} } ' };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('微信网络适配器', () => {
  test('模块导入与工厂创建不读取 wx', async () => {
    vi.resetModules();
    const prior = Object.getOwnPropertyDescriptor(globalThis, 'wx');
    Object.defineProperty(globalThis, 'wx', { configurable: true, get() { throw new Error('wx read during import'); } });
    try {
      const module = await import('./wechat-miniapp');
      expect(module.createWechatMiniappHttp().send).toBeTypeOf('function');
    } finally {
      if (prior) Object.defineProperty(globalThis, 'wx', prior);
      else Reflect.deleteProperty(globalThis, 'wx');
    }
  });

  test.each([200, 401, 500])('HTTP %i 原样返回，不解释业务错误且只发送一次', async statusCode => {
    const wx = fakeWechat();
    const source = cancellationSource();
    const pending = createWechatMiniappHttp().send({ ...request, cancellation: source.cancellation });
    expect(wx.sent[0]).toMatchObject({
      url: 'https://gateway.invalid/payment?unchanged=1', method: 'POST',
      header: { lane: 'test-lane', 'Content-Type': 'application/json', 'X-Test': '  unchanged  ' },
      data: '{ "signData": "  raw ", "xpayEnv": "XPAY_ENV_SANDBOX" }', timeout: 125,
      dataType: 'text', responseType: 'text',
    });
    wx.sent[0]!.success({ ...response, statusCode });
    await expect(pending).resolves.toEqual({ ok: true, value: { status: statusCode, headers: response.header, body: response.data } });
    expect(source.listenerCount).toBe(0);
    await vi.runAllTimersAsync();
    expect(wx.sendCount).toBe(1);
    expect(wx.abortCount).toBe(0);
  });

  test('GET 无 body 保持省略，响应对象不解析不变换', async () => {
    const wx = fakeWechat();
    const body = { arbitrary: true };
    const pending = createWechatMiniappHttp().send({ url: 'https://gateway.invalid/query', method: 'GET', headers: {}, timeoutMs: 25 });
    expect(wx.sent[0]).toMatchObject({ url: 'https://gateway.invalid/query', method: 'GET', header: {}, timeout: 25 });
    expect(wx.sent[0]).not.toHaveProperty('data');
    wx.sent[0]!.success({ ...response, data: body });
    const result = await pending;
    expect(result).toEqual({ ok: true, value: { status: 200, headers: response.header, body } });
    if (result.ok) expect(result.value.body).toBe(body);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('平台 fail 为 NETWORK_ERROR，不暴露原始错误、不重放', async () => {
    const wx = fakeWechat();
    const source = cancellationSource();
    const pending = createWechatMiniappHttp().send({ ...request, cancellation: source.cancellation });
    wx.sent[0]!.fail({ errMsg: 'request:fail platform details' });
    wx.sent[0]!.success(response);
    await expect(pending).resolves.toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });
    expect(source.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(wx.sendCount).toBe(1);
    expect(wx.abortCount).toBe(0);
  });

  test('wx.request 同步抛错同样归为 NETWORK_ERROR 并清理', async () => {
    const wx = fakeWechat({ requestThrows: true });
    const source = cancellationSource();
    await expect(createWechatMiniappHttp().send({ ...request, cancellation: source.cancellation })).resolves.toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });
    expect(source.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(wx.sendCount).toBe(1);
  });

  test.each([false, true])('剩余预算耗尽尽力 abort，abort 抛错=%s 仍一次返回 TIMEOUT', async abortThrows => {
    const wx = fakeWechat({ abortThrows });
    const source = cancellationSource();
    const pending = createWechatMiniappHttp().send({ ...request, cancellation: source.cancellation });
    const delivered = vi.fn();
    void pending.then(delivered);
    await vi.advanceTimersByTimeAsync(124);
    expect(delivered).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    wx.sent[0]!.success(response);
    wx.sent[0]!.fail({ errMsg: 'request:fail late' });
    source.stop();
    await expect(pending).resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(wx.abortCount).toBe(1);
    expect(wx.sendCount).toBe(1);
    expect(source.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('OperationContext 传下的停止信号终止本地等待并 abort，不撤销交易', async () => {
    const wx = fakeWechat();
    const source = cancellationSource();
    const context: OperationContext = { deadlineAtMs: Date.now() + 125, cancellation: source.cancellation };
    const pending = createWechatMiniappHttp().send({ ...request, timeoutMs: context.deadlineAtMs - Date.now(), cancellation: context.cancellation! });
    source.stop();
    wx.sent[0]!.success(response);
    await expect(pending).resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
    expect(wx.abortCount).toBe(1);
    expect(wx.sendCount).toBe(1);
    expect(source.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('发送前已经停止不访问平台、不创建活动等待', async () => {
    const wx = fakeWechat();
    const source = cancellationSource();
    source.stop();
    await expect(createWechatMiniappHttp().send({ ...request, cancellation: source.cancellation })).resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
    expect(wx.sendCount).toBe(0);
    expect(source.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each([0, -1])('发送前预算为 %i 时不访问平台', async timeoutMs => {
    const wx = fakeWechat();
    await expect(createWechatMiniappHttp().send({ ...request, timeoutMs })).resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });
    expect(wx.sendCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('订阅同步通知停止时清理刚返回的订阅并阻止发送', async () => {
    const wx = fakeWechat();
    const unsubscribe = vi.fn();
    const cancellation: Cancellation = { isStopped: () => false, subscribe(listener) { listener(); return unsubscribe; } };
    await expect(createWechatMiniappHttp().send({ ...request, cancellation })).resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(wx.sendCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('request 返回 RequestTask 前停止，在取得 task 后仍尽力 abort', async () => {
    const source = cancellationSource();
    const wx = fakeWechat({ duringRequest: () => source.stop() });
    await expect(createWechatMiniappHttp().send({ ...request, cancellation: source.cancellation })).resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
    expect(wx.sendCount).toBe(1);
    expect(wx.abortCount).toBe(1);
    expect(source.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('success 后重复回调和停止不二次结算或影响下一次 send', async () => {
    const wx = fakeWechat();
    const source = cancellationSource();
    const http = createWechatMiniappHttp();
    const pending = http.send({ ...request, cancellation: source.cancellation });
    const delivered = vi.fn();
    void pending.then(delivered);
    wx.sent[0]!.success(response);
    const next = http.send(request);
    wx.sent[0]!.success({ ...response, statusCode: 500 });
    wx.sent[0]!.fail({ errMsg: 'request:fail duplicate' });
    source.stop();
    wx.sent[1]!.success({ ...response, data: 'next response' });
    await expect(pending).resolves.toEqual({ ok: true, value: { status: 200, headers: response.header, body: response.data } });
    await expect(next).resolves.toEqual({ ok: true, value: { status: 200, headers: response.header, body: 'next response' } });
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(wx.sendCount).toBe(2);
    expect(wx.abortCount).toBe(0);
    expect(source.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
