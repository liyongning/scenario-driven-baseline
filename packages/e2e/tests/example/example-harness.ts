import { createExampleClient } from '@daqian/template-sdk';
import { createShadowServer, discoverExampleRoutes, type RunningShadowServer, type ShadowStep } from '@template-test/protocol';

export function installWx(onAbort?: () => void) {
  const original = (globalThis as Record<string, unknown>).wx;
  (globalThis as Record<string, unknown>).wx = {
    request(options: { url: string; header: Record<string, string>; data?: string; success(response: { statusCode: number; header: Record<string, string>; data: string }): void; fail(): void; complete?: () => void }) {
      const controller = new AbortController();
      const request = fetch(String(options.url), { method: 'POST', headers: options.header as Record<string, string>, body: options.data as string, signal: controller.signal });
      void request.then(async response => options.success({ statusCode: response.status, header: {}, data: await response.text() })).catch(() => options.fail()).finally(() => options.complete?.());
      return { abort() { onAbort?.(); controller.abort(); } };
    },
  };
  return () => { if (original === undefined) delete (globalThis as Record<string, unknown>).wx; else (globalThis as Record<string, unknown>).wx = original; };
}

export function exampleClient(url: string, policy = { requestTimeoutMs: 1000, intervalMs: 1, windowMs: 1000 }) {
  return createExampleClient({ runtime: 'wechat-miniapp', gatewayBaseUrl: url, getAccessToken: () => 'fixture-token', catalog: { kind: 'fixture', itemId: 'sku', itemName: 'Fixture', unitValue: 100n }, policy });
}

export async function exampleServer(id: string, routes: Readonly<{ CreateTrade?: Readonly<{ expectedRequests: ReadonlyArray<Readonly<Record<string, unknown>>>; steps: ReadonlyArray<ShadowStep> }>; QueryTrade?: Readonly<{ expectedRequests: ReadonlyArray<Readonly<Record<string, unknown>>>; steps: ReadonlyArray<ShadowStep> }> }>) {
  return createShadowServer({ routes: discoverExampleRoutes(), scenarios: [{ id, routes }] }).start();
}

export function cancellationAfter(delayMs: number) {
  let stopped = false;
  const listeners = new Set<() => void>();
  setTimeout(() => { stopped = true; for (const listener of [...listeners]) listener(); listeners.clear(); }, delayMs);
  return { isStopped: () => stopped, subscribe(listener: () => void) { if (stopped) listener(); else listeners.add(listener); return () => listeners.delete(listener); } };
}

export type ExampleServer = RunningShadowServer;
