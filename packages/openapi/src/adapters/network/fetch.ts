import type { HttpPort, HttpRequest, HttpResponse, HttpResult } from '../../ports/http';

interface FetchResponse {
  status: number;
  headers: { forEach(callback: (value: string, key: string) => void): void };
  text(): Promise<unknown>;
}
interface FetchOptions {
  method: string;
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

function send(request: HttpRequest): Promise<HttpResult<HttpResponse>> {
  if (request.cancellation?.isStopped())
    return Promise.resolve({ ok: false, error: { code: 'CANCELLED' } });
  if (request.timeoutMs <= 0) return Promise.resolve({ ok: false, error: { code: 'TIMEOUT' } });

  return new Promise((resolve) => {
    let settled = false;
    const subscription: { unsubscribe: (() => void) | undefined } = { unsubscribe: undefined };
    const platformGlobal = globalThis as unknown as FetchGlobal;
    let controller: FetchAbortController;
    try {
      const AbortController = platformGlobal.AbortController;
      if (typeof AbortController !== 'function') {
        resolve({ ok: false, error: { code: 'NETWORK_ERROR' } });
        return;
      }
      controller = new AbortController();
    } catch {
      resolve({ ok: false, error: { code: 'NETWORK_ERROR' } });
      return;
    }
    const abort = () => {
      try {
        controller.abort();
      } catch {
        // 平台取消失败不改变已确定的客户端结果。
      }
    };
    const finish = (result: HttpResult<HttpResponse>, shouldAbort = false) => {
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
    try {
      subscription.unsubscribe = request.cancellation?.subscribe(() =>
        finish({ ok: false, error: { code: 'CANCELLED' } }, true),
      );
    } catch {
      finish({ ok: false, error: { code: 'NETWORK_ERROR' } }, true);
    }
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
            finish({ ok: true, value: { status: response.status, headers, body } });
          },
          () => finish({ ok: false, error: { code: 'NETWORK_ERROR' } }),
        );
      },
      () => finish({ ok: false, error: { code: 'NETWORK_ERROR' } }),
    );
  });
}

/** 创建浏览器 HTTP 端口；导入与创建时不读取平台全局。 */
export function createFetchHttp(): HttpPort {
  return { send };
}
