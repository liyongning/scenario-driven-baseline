import { expect, test, vi, type TestContext } from 'vitest';
import { parseLiveConfig } from './config';
import { createLivePageDefinition } from './page';
import type { createLiveController } from './controller';
import { defaultTradeDefaults, type LiveTradeDraft } from './trade-form';

const config = { gatewayBaseUrl: 'https://pay.example', createTradeUrl: 'https://trade.example/api/base/trade/create', productId: 'product', serverEnv: 'test' as const };

function moduleCase(key: string, checks: string[], body: (context: TestContext) => void | Promise<void>) {
  test(`TC-PAYSDK-CORE-023 ${key}`, { meta: { paymentCase: { ownerId: 'TC-PAYSDK-CORE-023', caseId: key, environment: 'test-tools-unit', fixtureCase: null, covers: [{ id: 'TC-PAYSDK-CORE-023', caseKey: key, checks }] } } }, async context => {
    const before = expect.getState().assertionCalls;
    await body(context);
    await context.annotate(JSON.stringify({ assertions: expect.getState().assertionCalls - before, checkpoints: checks }), 'payment-evidence');
  });
}

moduleCase('defaults-and-editing', ['editable-defaults'], () => {
  const defaultOverride = {
    bizType: 'editable_live', goodsType: 'GOODS_TYPE_VIRTUAL' as const,
    items: [{ skuId: 'sku-1', skuName: '联调商品', skuSnapshot: { wechatVirtualProductId: 'product-1', bizSnapshot: '{}' }, quantity: '2', unitPrice: '3', discountAmount: '1', payAmount: '5' }],
    originalAmount: '6', discountAmount: '1', payAmount: '5',
  };
  const parsed = parseLiveConfig({
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example',
    PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create',
    PAYMENT_LIVE_PRODUCT_ID: 'product', PAYMENT_LIVE_SERVER_ENV: 'test',
    PAYMENT_LIVE_TRADE_DEFAULTS_JSON: JSON.stringify(defaultOverride),
  });
  expect(parsed.tradeDefaults).toEqual(defaultOverride);
  expect(defaultTradeDefaults).toMatchObject({ bizType: 'payment_sdk_live', goodsType: 'GOODS_TYPE_VIRTUAL', payAmount: '100' });
  expect(() => parseLiveConfig({
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example', PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create',
    PAYMENT_LIVE_PRODUCT_ID: 'product', PAYMENT_LIVE_SERVER_ENV: 'test', PAYMENT_LIVE_TRADE_DEFAULTS_JSON: JSON.stringify({ ...defaultOverride, userId: '1' }),
  })).toThrow('invalid PAYMENT_LIVE_TRADE_DEFAULTS_JSON');
  const storage = new Map<string, string>();
  const platform = {
    getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: string) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key), setClipboardData: vi.fn(),
  };
  const definition = createLivePageDefinition(platform, config, 'wx-live');
  const instance: { data: Record<string, unknown>; setData(value: Record<string, unknown>): void; controller?: ReturnType<typeof createLiveController>; tokenInput?: string } = {
    data: {}, setData(value) { Object.assign(this.data, value); },
  };
  definition.onLoad.call(instance);
  expect(instance.data.goodsTypeOptions).toEqual(['GOODS_TYPE_VIRTUAL', 'GOODS_TYPE_PHYSICAL']);
  expect(instance.data.goodsTypeIndex).toBe(0);
  definition.onGoodsTypeChange.call(instance, { detail: { value: '1' } });
  expect((instance.data.draft as LiveTradeDraft).goodsType).toBe('GOODS_TYPE_PHYSICAL');
  expect(instance.data.goodsTypeIndex).toBe(1);
  definition.onDraftField.call(instance, { currentTarget: { dataset: { field: 'goodsType' } }, detail: { value: 'GOODS_TYPE_UNSPECIFIED' } });
  expect((instance.data.draft as LiveTradeDraft).goodsType).toBe('GOODS_TYPE_PHYSICAL');
  definition.onGoodsTypeChange.call(instance, { detail: { value: 'GOODS_TYPE_UNSPECIFIED' } });
  expect((instance.data.draft as LiveTradeDraft).goodsType).toBe('GOODS_TYPE_PHYSICAL');
  definition.onUserIdInput.call(instance, { detail: { value: '42' } });
  definition.onDraftField.call(instance, { currentTarget: { dataset: { field: 'bizType' } }, detail: { value: 'edited' } });
  definition.onItemField.call(instance, { currentTarget: { dataset: { index: 0, field: 'skuName' } }, detail: { value: '编辑商品' } });
  definition.onItemField.call(instance, { currentTarget: { dataset: { index: 0, field: 'wechatVirtualProductId' } }, detail: { value: 'wx-product-9' } });
  expect((instance.data.draft as LiveTradeDraft).items[0]!.skuSnapshot).toEqual({ wechatVirtualProductId: 'wx-product-9', bizSnapshot: '{}' });
  definition.onItemField.call(instance, { currentTarget: { dataset: { index: 0, field: 'bizSnapshot' } }, detail: { value: '{"k":1}' } });
  expect((instance.data.draft as LiveTradeDraft).items[0]!.skuSnapshot).toEqual({ wechatVirtualProductId: 'wx-product-9', bizSnapshot: '{"k":1}' });
  definition.onItemField.call(instance, { currentTarget: { dataset: { index: 7, field: 'bizSnapshot' } }, detail: { value: '{}' } });
  expect((instance.data.draft as LiveTradeDraft).items).toHaveLength(1);
  definition.onDraftField.call(instance, { currentTarget: { dataset: { field: 'ignored' } }, detail: { value: 'x' } });
  definition.onItemField.call(instance, { currentTarget: { dataset: { index: 0, field: 'ignored' } }, detail: { value: 'x' } });
  expect(instance.data.draft).toMatchObject({ userId: '42', bizType: 'edited', items: [expect.objectContaining({ skuName: '编辑商品' })] });
  expect(storage.size).toBe(0);
  definition.onAddItem.call(instance);
  expect((instance.data.draft as LiveTradeDraft).items).toHaveLength(2);
  definition.onRemoveItem.call(instance, { currentTarget: { dataset: { index: 1 } } });
  expect((instance.data.draft as LiveTradeDraft).items).toHaveLength(1);
  const previous = (instance.data.draft as LiveTradeDraft).bizTradeNo;
  definition.onNewDraft.call(instance);
  expect((instance.data.draft as LiveTradeDraft).bizTradeNo).not.toBe(previous);
  expect((instance.data.draft as LiveTradeDraft).userId).toBe('');
  definition.onUnload.call(instance);

  const contextual = createLivePageDefinition(platform, { ...config, lane: 'lane', appVersion: '1' }, 'wx-live');
  contextual.onLoad.call(instance);
  contextual.onUnload.call(instance);
});
