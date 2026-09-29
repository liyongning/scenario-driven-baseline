import { createExampleClient, type ExampleClient, type ExampleOutcome } from '@daqian/payment-sdk';
import { CreateTrade, QueryTrade } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import type { Cancellation } from '@daqian/payment-protocol';
import type { LiveConfig } from './config';
import type { TokenStore } from './token-store';

export type ExampleLiveRecord = Readonly<{
  id: 'LIVE-TEMPLATE-EXAMPLE-001';
  kind: 'live-example-record';
  resourceRef: Readonly<{ id: string; externalRef: string }>;
  outcome: Readonly<{ end: ExampleOutcome['end']; lastState: ExampleOutcome['lastState']; errorCategory?: string }>;
  requestPaths: readonly string[];
}>;

export type ExampleLiveState = Readonly<{
  tokenStatus: ReturnType<TokenStore['status']>;
  catalogReady: boolean;
  ownerId: string;
  externalRef: string;
  units: string;
  busy: boolean;
  message: string;
  referenceLabel: string;
  resultText: string;
}>;

type ClientFactory = (input: Parameters<typeof createExampleClient>[0]) => ExampleClient;

function cancellation() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const value: Cancellation = { isStopped: () => stopped, subscribe(listener) { if (stopped) listener(); else listeners.add(listener); return () => listeners.delete(listener); } };
  return { value, stop() { if (stopped) return; stopped = true; for (const listener of [...listeners]) listener(); listeners.clear(); } };
}

/** Live 示例只调用生产 SDK 的中立入口，页面结果不展示完整资源标识或凭据。 */
export function createExampleLiveController(options: Readonly<{ config: LiveConfig; tokenStore: TokenStore; clientFactory?: ClientFactory; onChange?: (state: ExampleLiveState) => void }>) {
  let ownerId = options.config.userId ?? '';
  let externalRef = '';
  let units = '1';
  let busy = false;
  let message = options.config.exampleCatalog ? '待创建' : '请配置示例目录项';
  let referenceLabel = '';
  let resultText = '';
  let record: ExampleLiveRecord | undefined;
  let active = cancellation();
  let generation = 0;
  const state = (): ExampleLiveState => ({ tokenStatus: options.tokenStore.status(), catalogReady: options.config.exampleCatalog !== undefined, ownerId, externalRef, units, busy, message, referenceLabel, resultText });
  const emit = () => options.onChange?.(state());
  return {
    state,
    saveToken(value: string) { options.tokenStore.save(value); emit(); },
    clearToken() { options.tokenStore.clear(); emit(); },
    updateInput(field: 'ownerId' | 'externalRef' | 'units', value: string) {
      if (busy) return false;
      if (field === 'ownerId') ownerId = value;
      else if (field === 'externalRef') externalRef = value;
      else units = value;
      emit(); return true;
    },
    async run() {
      if (busy || !options.config.exampleCatalog || options.tokenStore.status() !== 'configured') return false;
      busy = true; record = undefined; referenceLabel = ''; resultText = ''; message = '运行中'; active = cancellation(); const runGeneration = ++generation; emit();
      try {
        const catalog = options.config.exampleCatalog;
        const client = (options.clientFactory ?? createExampleClient)({
          runtime: 'wechat-miniapp', gatewayBaseUrl: options.config.gatewayBaseUrl,
          getAccessToken: options.tokenStore.getAccessToken,
          catalog: { kind: catalog.kind, itemId: catalog.itemId, itemName: catalog.itemName, unitValue: BigInt(catalog.unitValue) },
          requestContext: { productId: options.config.productId, ...(options.config.lane ? { lane: options.config.lane } : {}), ...(options.config.appVersion ? { appVersion: options.config.appVersion } : {}) },
        });
        const created = await client.create({ ownerId, externalRef, units: Number(units) });
        if (runGeneration !== generation) return false;
        if (!created.ok) { message = `创建失败：${created.error.category}`; return false; }
        referenceLabel = `…${created.reference.id.slice(-4)}`;
        const outcome = await client.observe(created.reference, { cancellation: active.value });
        if (runGeneration !== generation) return false;
        const safeOutcome = { end: outcome.end, lastState: outcome.lastState, ...(outcome.error ? { errorCategory: outcome.error.category } : {}) };
        resultText = JSON.stringify(safeOutcome);
        message = `观察结束：${outcome.end}`;
        record = { id: 'LIVE-TEMPLATE-EXAMPLE-001', kind: 'live-example-record', resourceRef: created.reference, outcome: safeOutcome, requestPaths: [CreateTrade.meta.path, QueryTrade.meta.path] };
        return true;
      } catch { if (runGeneration === generation) message = '示例运行失败'; return false; }
      finally { if (runGeneration === generation) { busy = false; emit(); } }
    },
    exportRecord() { return record ? `${JSON.stringify(record, null, 2)}\n` : ''; },
    unload() { generation += 1; active.stop(); busy = false; ownerId = ''; record = undefined; referenceLabel = ''; resultText = ''; emit(); },
  };
}
