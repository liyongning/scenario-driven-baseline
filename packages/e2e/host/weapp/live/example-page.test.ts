import { expect, test, vi } from 'vitest';
import { createExampleLivePageDefinition } from './example-page';
import { parseLiveConfig } from './config';
import type { createExampleLiveController } from './example-controller';

const config = { gatewayBaseUrl: 'https://example.invalid', createTradeUrl: 'https://example.invalid/api/base/trade/create', productId: 'product', serverEnv: 'test' as const };

test('Live example page binds token, input, run, export, and unload', async () => {
  const storage = new Map<string, string>();
  const platform = { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: string) => { storage.set(key, value); }, removeStorageSync: (key: string) => { storage.delete(key); }, setClipboardData: vi.fn() };
  const definition = createExampleLivePageDefinition(platform, config);
  const data: Record<string, unknown> = {};
  const instance: { setData(value: Record<string, unknown>): void; controller?: ReturnType<typeof createExampleLiveController>; tokenInput?: string } = { setData(value) { Object.assign(data, value); } };
  expect(definition.data.units).toBe('1');
  definition.onLoad.call(instance);
  expect(data).toMatchObject({ catalogReady: false, tokenStatus: 'not_configured' });
  definition.onTokenInput.call(instance, { detail: { value: 'secret' } });
  definition.onSaveToken.call(instance);
  expect(data.tokenStatus).toBe('configured');
  expect(instance.tokenInput).toBe('');
  definition.onInput.call(instance, { currentTarget: { dataset: { field: 'ownerId' } }, detail: { value: '42' } });
  expect(data.ownerId).toBe('42');
  expect(await definition.onRun.call(instance)).toBe(false);
  definition.onExport.call(instance);
  expect(platform.setClipboardData).not.toHaveBeenCalled();
  definition.onClearToken.call(instance);
  expect(data.tokenStatus).toBe('not_configured');
  definition.onUnload.call(instance);
  expect(data.ownerId).toBe('');
  const detached = { setData: vi.fn() };
  expect(createExampleLivePageDefinition(platform, config).onRun.call(detached)).toBeUndefined();
  definition.onSaveToken.call(detached);
  definition.onClearToken.call(detached);
  definition.onInput.call(detached, { currentTarget: { dataset: { field: 'units' } }, detail: { value: '2' } });
  definition.onExport.call(detached);
  definition.onUnload.call(detached);
  const exported = { ...detached, controller: { exportRecord: () => '{"id":"record"}' } as ReturnType<typeof createExampleLiveController> };
  definition.onExport.call(exported);
  expect(platform.setClipboardData).toHaveBeenCalledWith({ data: '{"id":"record"}' });
  definition.onSaveToken.call({ ...detached, controller: instance.controller! });
  definition.onSaveToken.call({ ...detached, controller: instance.controller!, tokenInput: null as never });
});

test('Live example catalog uses only complete non-sensitive configuration', () => {
  const values = {
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://example.invalid',
    PAYMENT_LIVE_CREATE_TRADE_URL: 'https://example.invalid/api/base/trade/create',
    PAYMENT_LIVE_PRODUCT_ID: 'product', PAYMENT_LIVE_SERVER_ENV: 'test',
  };
  expect(parseLiveConfig(values).exampleCatalog).toBeUndefined();
  const full = { ...values, LIVE_EXAMPLE_KIND: 'kind', LIVE_EXAMPLE_ITEM_ID: 'item', LIVE_EXAMPLE_ITEM_NAME: 'Item', LIVE_EXAMPLE_UNIT_VALUE: '5' };
  expect(parseLiveConfig(full).exampleCatalog).toEqual({ kind: 'kind', itemId: 'item', itemName: 'Item', unitValue: '5' });
  expect(() => parseLiveConfig({ ...full, LIVE_EXAMPLE_ITEM_NAME: '' })).toThrow('missing LIVE_EXAMPLE_ITEM_NAME');
  expect(() => parseLiveConfig({ ...full, LIVE_EXAMPLE_UNIT_VALUE: '0' })).toThrow('invalid LIVE_EXAMPLE_UNIT_VALUE');
  expect(() => parseLiveConfig({ ...full, LIVE_EXAMPLE_UNIT_VALUE: '9223372036854775808' })).toThrow('invalid LIVE_EXAMPLE_UNIT_VALUE');
});

test('native example page registers the production page definition', async () => {
  const register = vi.fn();
  vi.stubGlobal('Page', register);
  vi.stubGlobal('wx', { getStorageSync: vi.fn(), setStorageSync: vi.fn(), removeStorageSync: vi.fn(), setClipboardData: vi.fn() });
  vi.stubGlobal('__PAYMENT_LIVE_CONFIG__', config);
  try {
    // @ts-expect-error Native page registration is JavaScript-only.
    await import('../pages/live/example/index.js');
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ onLoad: expect.any(Function), onRun: expect.any(Function) }));
  } finally {
    vi.unstubAllGlobals();
  }
});
