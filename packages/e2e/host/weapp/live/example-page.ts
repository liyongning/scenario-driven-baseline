import type { LiveConfig } from './config';
import { createExampleLiveController } from './example-controller';
import { createTokenStore } from './token-store';

declare const __PAYMENT_LIVE_CONFIG__: LiveConfig;
type Platform = Readonly<{ getStorageSync(key: string): unknown; setStorageSync(key: string, value: string): void; removeStorageSync(key: string): void; setClipboardData(input: Readonly<{ data: string }>): void }>;
type Instance = { setData(value: Record<string, unknown>): void; controller?: ReturnType<typeof createExampleLiveController>; tokenInput?: string };

/** 原生示例 Page 薄绑定；只显示脱敏状态，导出由用户显式触发。 */
export function createExampleLivePageDefinition(platform: Platform, config: LiveConfig = __PAYMENT_LIVE_CONFIG__) {
  return {
    data: { tokenInput: '', tokenStatus: 'not_configured', catalogReady: false, ownerId: '', externalRef: '', units: '1', busy: false, message: '', referenceLabel: '', resultText: '' },
    onLoad(this: Instance) {
      const tokenStore = createTokenStore({ get: key => platform.getStorageSync(key), set: (key, value) => platform.setStorageSync(key, value), remove: key => platform.removeStorageSync(key) });
      this.controller = createExampleLiveController({ config, tokenStore, onChange: state => this.setData(state as unknown as Record<string, unknown>) });
      this.setData(this.controller.state() as unknown as Record<string, unknown>);
    },
    onTokenInput(this: Instance, event: { detail: { value: string } }) { this.tokenInput = event.detail.value; },
    onSaveToken(this: Instance) { this.controller?.saveToken(this.tokenInput ?? ''); this.tokenInput = ''; this.setData({ tokenInput: '' }); },
    onClearToken(this: Instance) { this.controller?.clearToken(); this.tokenInput = ''; this.setData({ tokenInput: '' }); },
    onInput(this: Instance, event: { currentTarget: { dataset: { field: 'ownerId' | 'externalRef' | 'units' } }; detail: { value: string } }) { this.controller?.updateInput(event.currentTarget.dataset.field, event.detail.value); },
    onRun(this: Instance) { return this.controller?.run(); },
    onExport(this: Instance) { const data = this.controller?.exportRecord(); if (data) platform.setClipboardData({ data }); },
    onUnload(this: Instance) { this.controller?.unload(); },
  };
}
