import type { HttpPort, HttpRequest, HttpResponse } from '../../ports/http';
import type { CommunicationResult } from '../../transport/errors';

// 平台类型只属于本网络模块；浏览器响应体读取也纳入本次请求预算。
interface FetchResponse {
  status: number;
  headers: { forEach(callback: (value: string, key: string) => void): void };
  text(): Promise<unknown>;
}
interface FetchOptions {
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: string;
  credentials: 'same-origin';
  cache: 'no-store';
  signal: unknown;
}
interface FetchAbortController {
  signal: unknown;
  abort(): void;
}
type FetchLike = (url: string, init: FetchOptions) => Promise<FetchResponse> | FetchResponse;
type FetchGlobal = Readonly<{
  fetch?: unknown;
  AbortController?: new () => FetchAbortController;
}>;
declare function setTimeout(callback: () => void, durationMs: number): number;
declare function clearTimeout(handle: number): void;

function send(request: HttpRequest): Promise<CommunicationResult<HttpResponse>> {
  // 停止只结束本地等待，不说明交易已撤销；发送前已结束时不访问平台。
  if (request.cancellation?.isStopped())
    return Promise.resolve({ ok: false, error: { code: 'CANCELLED' } });
  if (request.timeoutMs <= 0) return Promise.resolve({ ok: false, error: { code: 'TIMEOUT' } });

  return new Promise((resolve) => {
    let settled = false;
    const subscription: { unsubscribe: (() => void) | undefined } = { unsubscribe: undefined };
    const platformGlobal = globalThis as unknown as FetchGlobal;
    const controller = new platformGlobal.AbortController!();
    const abort = () => {
      try {
        controller.abort();
      } catch {
        /* 尽力取消，不让平台 abort 异常改变已确定的结果。 */
      }
    };
    const finish = (result: CommunicationResult<HttpResponse>, shouldAbort = false) => {
      // 先锁定一次交付，再清理；迟到响应和重复通知均无效。
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe?.();
      if (shouldAbort) abort();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: { code: 'TIMEOUT' } }, true),
      request.timeoutMs,
    );
    subscription.unsubscribe = request.cancellation?.subscribe(() =>
      finish({ ok: false, error: { code: 'CANCELLED' } }, true),
    );
    // subscribe 可同步通知停止；解除刚返回的订阅，并禁止启动已结束的请求。
    if (settled) {
      subscription.unsubscribe?.();
      return;
    }

    let platformFetch: FetchLike;
    try {
      platformFetch = platformGlobal.fetch as FetchLike;
    } catch {
      finish({ ok: false, error: { code: 'NETWORK_ERROR' } });
      return;
    }
    if (typeof platformFetch !== 'function') {
      finish({ ok: false, error: { code: 'NETWORK_ERROR' } });
      return;
    }

    let responsePromise: Promise<FetchResponse> | FetchResponse;
    try {
      responsePromise = platformFetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch {
      finish({ ok: false, error: { code: 'NETWORK_ERROR' } });
      return;
    }

    void Promise.resolve(responsePromise).then(
      (response) => {
        if (settled) return;
        let bodyPromise: Promise<unknown>;
        try {
          bodyPromise = response.text();
        } catch {
          finish({ ok: false, error: { code: 'NETWORK_ERROR' } });
          return;
        }
        void Promise.resolve(bodyPromise).then(
          (body) => {
            if (settled) return;
            const headers: Record<string, string> = {};
            try {
              response.headers.forEach((value, key) => {
                headers[key] = value;
              });
            } catch {
              finish({ ok: false, error: { code: 'NETWORK_ERROR' } });
              return;
            }
            // HTTP 非 2xx 仍是有效 HTTP 响应，由协议执行器处理。
            finish({ ok: true, value: { status: response.status, headers, body } });
          },
          () => finish({ ok: false, error: { code: 'NETWORK_ERROR' } }),
        );
      },
      () => finish({ ok: false, error: { code: 'NETWORK_ERROR' } }),
    );
  });
}

/** 创建浏览器 HTTP 内部适配器；模块导入及创建时均不读取平台全局。 */
export function createFetchHttp(): HttpPort {
  return { send };
}
