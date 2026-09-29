import type { LiveConfig } from './config';
import { createLiveCreateTradePort } from './create-trade';
import { createLiveController, type LiveState } from './controller';
import { createLiveRuntime } from './runtime';
import { createTokenStore } from './token-store';
import { goodsTypeOptions } from './trade-form';

declare const __PAYMENT_LIVE_CONFIG__: LiveConfig;
declare const __PAYMENT_LIVE_APP_ID__: string;

type WechatLivePlatform = Readonly<{
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: string): void;
  removeStorageSync(key: string): void;
  setClipboardData(input: Readonly<{ data: string }>): void;
}>;

type PageInstance = { data: Record<string, unknown>; setData(value: Record<string, unknown>): void; controller?: ReturnType<typeof createLiveController>; tokenInput?: string };

function view(state: LiveState) {
  return {
    tokenStatus: state.tokenStatus, selectedEnv: state.selectedEnv, envLocked: state.envLocked, serverEnv: state.serverEnv,
    hasTrade: state.hasTrade, busy: state.busy, message: state.message,
    draft: state.draft, draftLocked: state.draftLocked,
    goodsTypeOptions, goodsTypeIndex: goodsTypeOptions.indexOf(state.draft.goodsType),
    eventText: JSON.stringify(state.events, null, 2),
  };
}

/** 原生 Page 薄绑定；创建交易使用受审 generated 契约和生产微信网络端口。 */
export function createLivePageDefinition(
  platform: WechatLivePlatform,
  injectedConfig: LiveConfig = __PAYMENT_LIVE_CONFIG__,
  injectedAppId: string = __PAYMENT_LIVE_APP_ID__,
) {
  return {
    data: { tokenInput: '', tokenStatus: 'not_configured', selectedEnv: 'omitted', envLocked: false, serverEnv: injectedConfig.serverEnv, hasTrade: false, busy: false, draftLocked: false, draft: {}, goodsTypeOptions, goodsTypeIndex: 0, message: '初始化中', eventText: '[]' },
    onLoad(this: PageInstance) {
      const store = createTokenStore({ get: key => platform.getStorageSync(key), set: (key, value) => platform.setStorageSync(key, value), remove: key => platform.removeStorageSync(key) });
      const runtime = createLiveRuntime();
      const createTrade = createLiveCreateTradePort({
        createTradeUrl: injectedConfig.createTradeUrl, getAccessToken: store.getAccessToken,
        requestContext: {
          productId: injectedConfig.productId,
          ...(injectedConfig.lane ? { lane: injectedConfig.lane } : {}),
          ...(injectedConfig.appVersion ? { appVersion: injectedConfig.appVersion } : {}),
        },
        runtime,
      });
      this.controller = createLiveController({ config: injectedConfig, appId: injectedAppId, tokenStore: store, createTrade, onChange: state => this.setData(view(state)) });
      this.setData(view(this.controller.state()));
    },
    onTokenInput(this: PageInstance, event: Readonly<{ detail: { value: string } }>) { this.tokenInput = event.detail.value; },
    onSaveToken(this: PageInstance) { this.controller?.saveToken(this.tokenInput ?? ''); this.tokenInput = ''; this.setData({ tokenInput: '' }); },
    onClearToken(this: PageInstance) { this.controller?.clearToken(); this.tokenInput = ''; this.setData({ tokenInput: '' }); },
    onUserIdInput(this: PageInstance, event: Readonly<{ detail: { value: string } }>) { this.controller?.updateDraft({ userId: event.detail.value }); },
    onDraftField(this: PageInstance, event: Readonly<{ currentTarget: { dataset: { field: string } }; detail: { value: string } }>) {
      const field = event.currentTarget.dataset.field;
      if (['bizType', 'bizTradeNo', 'originalAmount', 'discountAmount', 'payAmount'].includes(field)) this.controller?.updateDraft({ [field]: event.detail.value });
    },
    onGoodsTypeChange(this: PageInstance, event: Readonly<{ detail: { value: string } }>) {
      const selected = goodsTypeOptions[Number(event.detail.value)];
      if (selected) this.controller?.updateDraft({ goodsType: selected });
    },
    onItemField(this: PageInstance, event: Readonly<{ currentTarget: { dataset: { index: number; field: string } }; detail: { value: string } }>) {
      const { index, field } = event.currentTarget.dataset;
      if (['bizOrderNo', 'skuId', 'skuName', 'quantity', 'unitPrice', 'discountAmount', 'payAmount'].includes(field)) this.controller?.updateItem(index, { [field]: event.detail.value });
      if (field === 'wechatVirtualProductId' || field === 'bizSnapshot') {
        const item = this.controller?.state().draft.items[index];
        if (item) this.controller?.updateItem(index, { skuSnapshot: { ...item.skuSnapshot, [field]: event.detail.value } });
      }
    },
    onAddItem(this: PageInstance) { this.controller?.addItem(); },
    onRemoveItem(this: PageInstance, event: Readonly<{ currentTarget: { dataset: { index: number } } }>) { this.controller?.removeItem(event.currentTarget.dataset.index); },
    onNewDraft(this: PageInstance) { this.controller?.newDraft(); },
    onSelectEnv(this: PageInstance, event: Readonly<{ detail: { value: string } }>) { this.controller?.selectEnv(event.detail.value as 'omitted' | 'sandbox' | 'prod'); },
    onCreateTrade(this: PageInstance) { return this.controller?.create(); },
    onPay(this: PageInstance) { return this.controller?.pay(); },
    onQuery(this: PageInstance) { return this.controller?.query(); },
    onExport(this: PageInstance) { const data = this.controller?.exportEvidence() ?? '[]\n'; platform.setClipboardData({ data }); },
    onClearEvidence(this: PageInstance) { this.controller?.clearEvidence(); },
    onUnload(this: PageInstance) { this.controller?.unload(); },
  };
}
