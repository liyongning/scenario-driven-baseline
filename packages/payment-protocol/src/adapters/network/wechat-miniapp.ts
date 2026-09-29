import type { HttpPort, HttpRequest, HttpResponse } from '../../ports/http';
import type { CommunicationResult } from '../../transport/errors';

// 平台接口仅属于本网络模块；不引入完整微信、DOM 或 Node 类型到核心。
interface WechatRequestTask { abort(): void }
interface WechatRequestOptions {
  url: string;
  method: 'GET' | 'POST';
  header: Readonly<Record<string, string>>;
  data?: string;
  timeout: number;
  dataType: 'text';
  responseType: 'text';
  success(response: { statusCode: number; header: Readonly<Record<string, string>>; data: unknown }): void;
  fail(): void;
}
declare const wx: { request(options: WechatRequestOptions): WechatRequestTask };
declare function setTimeout(callback: () => void, durationMs: number): number;
declare function clearTimeout(handle: number): void;

function send(request: HttpRequest): Promise<CommunicationResult<HttpResponse>> {
  // 停止只结束本地等待，不说明交易已撤销；发送前已结束时不访问平台。
  if (request.cancellation?.isStopped()) return Promise.resolve({ ok: false, error: { code: 'CANCELLED' } });
  if (request.timeoutMs <= 0) return Promise.resolve({ ok: false, error: { code: 'TIMEOUT' } });

  return new Promise(resolve => {
    let settled = false;
    let requestTask: WechatRequestTask | undefined;
    let unsubscribe: (() => void) | undefined = undefined;
    let abortPending = false;
    const abort = () => {
      if (!requestTask) return;
      try { requestTask.abort(); } catch { /* 尽力取消，不让平台 abort 异常改变已确定的结果。 */ }
    };
    const finish = (result: CommunicationResult<HttpResponse>, shouldAbort = false) => {
      // 先锁定一次交付，再清理；abort 的同步 fail 和所有迟到/重复回调均无效。
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      abortPending = shouldAbort;
      if (shouldAbort) abort();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: { code: 'TIMEOUT' } }, true), request.timeoutMs);
    unsubscribe = request.cancellation?.subscribe(() => finish({ ok: false, error: { code: 'CANCELLED' } }, true));
    // subscribe 可同步通知停止；解除刚返回的订阅，并禁止启动已结束的请求。
    if (settled) { unsubscribe?.(); return; }

    try {
      requestTask = wx.request({
        url: request.url,
        method: request.method,
        header: request.headers,
        ...(request.body === undefined ? {} : { data: request.body }),
        timeout: request.timeoutMs,
        // 保留响应文本，由协议执行器负责 JSON/codec；HTTP 非 2xx 仍是有效 HTTP 响应。
        dataType: 'text',
        responseType: 'text',
        success: response => finish({ ok: true, value: { status: response.statusCode, headers: response.header, body: response.data } }),
        fail: () => finish({ ok: false, error: { code: 'NETWORK_ERROR' } }),
      });
      // request 尚未返回 task 时可能同步收到停止；拿到句柄后补做一次尽力取消。
      if (abortPending) abort();
    } catch {
      // 平台同步异常与 fail 同属传输失败；不保留可能携带请求信息的异常原文。
      finish({ ok: false, error: { code: 'NETWORK_ERROR' } });
    }
  });
}

/** 创建微信 HTTP 内部适配器；模块导入及创建时均不读取平台全局。 */
export function createWechatMiniappHttp(): HttpPort { return { send }; }
