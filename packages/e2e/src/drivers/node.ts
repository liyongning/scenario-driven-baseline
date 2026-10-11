import type { HttpPort } from '@daqian/template-protocol';

/** Node 集成网络桥；仅替换平台 HTTP，保留协议执行器与 codec。 */
export function createNodeHttpDriver(): HttpPort {
  return {
    async send(request) {
      if (request.cancellation?.isStopped()) return { ok: false, error: { code: 'CANCELLED' } };
      const controller = new AbortController();
      let stopped = false;
      let timedOut = false;
      const unsubscribe = request.cancellation?.subscribe(() => {
        stopped = true;
        controller.abort();
      });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, request.timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          ...(request.body === undefined ? {} : { body: request.body }),
          signal: controller.signal,
        });
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return {
          ok: true,
          value: { status: response.status, headers, body: await response.text() },
        };
      } catch {
        if (stopped) return { ok: false, error: { code: 'CANCELLED' } };
        return timedOut
          ? { ok: false, error: { code: 'TIMEOUT' } }
          : { ok: false, error: { code: 'NETWORK_ERROR' } };
      } finally {
        clearTimeout(timer);
        unsubscribe?.();
      }
    },
  };
}
