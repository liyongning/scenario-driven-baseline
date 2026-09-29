import { readFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const wxml = () => readFile(new URL('../pages/live/index.wxml', import.meta.url), 'utf8');
const inputTag = (source: string, marker: string) => source.split('\n').find(line => line.includes(marker)) ?? '';

// 原生 input 默认 maxlength=140：长 Token 与 bizSnapshot（IDL 上限 2048）会被静默截断，必须显式放开。
test('Live token and sku snapshot inputs keep their full length', async () => {
  const source = await wxml();
  expect(inputTag(source, 'id="live-token-input"')).toContain('maxlength="-1"');
  expect(inputTag(source, 'data-field="bizSnapshot"')).toContain('maxlength="2048"');
});

test('Live app and page entry register only native bindings', async () => {
  const App = vi.fn(); const Page = vi.fn();
  vi.stubGlobal('App', App); vi.stubGlobal('Page', Page);
  vi.stubGlobal('__PAYMENT_LIVE_CONFIG__', { gatewayBaseUrl: 'https://gateway.example', createTradeUrl: 'https://trade.example/api/base/trade/create', productId: 'product', serverEnv: 'test' });
  vi.stubGlobal('__PAYMENT_LIVE_APP_ID__', 'wx-live');
  vi.stubGlobal('wx', { getStorageSync: () => undefined, setStorageSync: () => undefined, removeStorageSync: () => undefined, setClipboardData: () => undefined });
  // @ts-expect-error 原生小程序 JS 绑定没有产品声明文件，本测试验证其实际注册行为。
  await import('../app.live.js');
  // @ts-expect-error 原生小程序 JS 绑定没有产品声明文件，本测试验证其实际注册行为。
  await import('../pages/live/index.js');
  expect(App).toHaveBeenCalledWith({});
  expect(Page).toHaveBeenCalledTimes(1);
  expect(Page.mock.calls[0]?.[0]).toMatchObject({ onLoad: expect.any(Function), onPay: expect.any(Function), onQuery: expect.any(Function) });
});
