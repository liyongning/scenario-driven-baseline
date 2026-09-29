import { expect, test, vi } from 'vitest';
import type { ExampleClient } from '@daqian/payment-sdk';
import type { Cancellation } from '@daqian/payment-protocol';
import { createTokenStore } from './token-store';
import { createExampleLiveController } from './example-controller';

const config = {
  gatewayBaseUrl: 'https://example.invalid', createTradeUrl: 'https://example.invalid/api/base/trade/create',
  productId: 'product', serverEnv: 'test' as const, userId: '42', lane: 'lane', appVersion: '1',
  exampleCatalog: { kind: 'fixture', itemId: 'item', itemName: 'Fixture', unitValue: '5' },
};
const reference = { id: 'resource-1234', externalRef: 'ref-1' };
function tokenStore() {
  const storage = new Map<string, string>();
  return createTokenStore({ get: key => storage.get(key), set: (key, value) => { storage.set(key, value); }, remove: key => { storage.delete(key); } });
}

test('Live example creates, observes, and exports one final neutral record', async () => {
  const token = tokenStore();
  const create = vi.fn<ExampleClient['create']>(async () => ({ ok: true, reference }));
  const observe = vi.fn<ExampleClient['observe']>(async () => ({ end: 'completed', lastState: 'completed' }));
  const clientFactory = vi.fn(() => ({ create, observe }));
  const onChange = vi.fn();
  const controller = createExampleLiveController({ config, tokenStore: token, clientFactory, onChange });
  expect(controller.state()).toMatchObject({ ownerId: '42', catalogReady: true, tokenStatus: 'not_configured' });
  expect(await controller.run()).toBe(false);
  controller.saveToken('secret');
  expect(controller.state().tokenStatus).toBe('configured');
  expect(controller.updateInput('externalRef', 'ref-1')).toBe(true);
  expect(controller.updateInput('units', '2')).toBe(true);
  expect(controller.updateInput('ownerId', '43')).toBe(true);
  expect(await controller.run()).toBe(true);
  expect(clientFactory).toHaveBeenCalledWith(expect.objectContaining({ catalog: { kind: 'fixture', itemId: 'item', itemName: 'Fixture', unitValue: 5n }, requestContext: { productId: 'product', lane: 'lane', appVersion: '1' } }));
  expect(create).toHaveBeenCalledWith({ ownerId: '43', externalRef: 'ref-1', units: 2 });
  expect(observe).toHaveBeenCalledWith(reference, { cancellation: expect.objectContaining({ isStopped: expect.any(Function) }) });
  expect(controller.state()).toMatchObject({ busy: false, referenceLabel: '…1234', message: '观察结束：completed' });
  expect(JSON.parse(controller.exportRecord())).toMatchObject({ id: 'LIVE-TEMPLATE-EXAMPLE-001', resourceRef: reference, outcome: { end: 'completed', lastState: 'completed' } });
  expect(controller.exportRecord()).not.toContain('secret');
  expect(onChange).toHaveBeenCalled();
  controller.clearToken();
  expect(controller.state().tokenStatus).toBe('not_configured');
  controller.unload();
  expect(controller.state().ownerId).toBe('');
});

test('Live example gates missing catalog and clears busy after failed creation or factory error', async () => {
  const token = tokenStore();
  token.save('secret');
  const { exampleCatalog: _catalog, ...withoutCatalog } = config;
  void _catalog;
  const missing = createExampleLiveController({ config: withoutCatalog, tokenStore: token });
  expect(missing.state().catalogReady).toBe(false);
  expect(await missing.run()).toBe(false);
  const failed = createExampleLiveController({ config, tokenStore: token, clientFactory: () => ({ create: async () => ({ ok: false, error: { category: 'invalid_input', message: 'bad' } }), observe: vi.fn() }) });
  expect(failed.exportRecord()).toBe('');
  expect(await failed.run()).toBe(false);
  expect(failed.state()).toMatchObject({ busy: false, message: '创建失败：invalid_input' });
  const broken = createExampleLiveController({ config, tokenStore: token, clientFactory: () => { throw new Error('factory'); } });
  expect(await broken.run()).toBe(false);
  expect(broken.state()).toMatchObject({ busy: false, message: '示例运行失败' });
});

test('Live example rejects edits and duplicate runs while active and cancels on unload', async () => {
  const token = tokenStore();
  token.save('secret');
  let finish!: (value: ReturnType<ExampleClient['observe']> extends Promise<infer T> ? T : never) => void;
  let cancellation!: Cancellation;
  const controller = createExampleLiveController({ config, tokenStore: token, clientFactory: () => ({
    create: async () => ({ ok: true, reference }),
    observe: (_reference, options) => { cancellation = options!.cancellation!; return new Promise(resolve => { finish = resolve; }); },
  }) });
  const pending = controller.run();
  await vi.waitFor(() => expect(controller.state().busy).toBe(true));
  expect(controller.updateInput('units', '3')).toBe(false);
  expect(await controller.run()).toBe(false);
  controller.unload();
  expect(cancellation.isStopped()).toBe(true);
  finish({ end: 'cancelled', lastState: 'unknown', error: { category: 'network', message: 'cancelled' } });
  expect(await pending).toBe(false);
  expect(controller.state().busy).toBe(false);
  expect(controller.exportRecord()).toBe('');
});

test('Live example ignores a late create response after unload', async () => {
  const token = tokenStore();
  token.save('secret');
  let finish!: (value: Awaited<ReturnType<ExampleClient['create']>>) => void;
  const observe = vi.fn<ExampleClient['observe']>();
  const controller = createExampleLiveController({ config, tokenStore: token, clientFactory: () => ({ create: () => new Promise(resolve => { finish = resolve; }), observe }) });
  const pending = controller.run();
  controller.unload();
  finish({ ok: true, reference });
  expect(await pending).toBe(false);
  expect(observe).not.toHaveBeenCalled();
  expect(controller.exportRecord()).toBe('');
});

test('Live example cancellation notifies listeners once and ignores late rejection', async () => {
  const token = tokenStore();
  token.save('secret');
  let finish!: (value: Awaited<ReturnType<ExampleClient['create']>>) => void;
  const controller = createExampleLiveController({ config, tokenStore: token, clientFactory: () => ({ create: () => new Promise(resolve => { finish = resolve; }), observe: vi.fn() }) });
  const pending = controller.run();
  controller.unload();
  controller.unload();
  finish({ ok: false, error: { category: 'server', message: 'late' } });
  expect(await pending).toBe(false);
  expect(controller.state().message).toBe('运行中');

  let signal!: Cancellation;
  let reject!: (error: Error) => void;
  const cancelled = createExampleLiveController({ config, tokenStore: token, clientFactory: () => ({
    create: async () => ({ ok: true, reference }),
    observe: (_reference, options) => { signal = options!.cancellation!; return new Promise((_resolve, fail) => { reject = fail; }); },
  }) });
  const observing = cancelled.run();
  await vi.waitFor(() => expect(signal).toBeDefined());
  const first = vi.fn(); const removed = vi.fn();
  const unsubscribe = signal.subscribe(removed);
  signal.subscribe(first);
  unsubscribe();
  cancelled.unload();
  expect(first).toHaveBeenCalledTimes(1);
  expect(removed).not.toHaveBeenCalled();
  const late = vi.fn(); signal.subscribe(late);
  expect(late).toHaveBeenCalledTimes(1);
  reject(new Error('late'));
  expect(await observing).toBe(false);
  expect(cancelled.exportRecord()).toBe('');
});

test('Live example supports minimal context and handles invalid input through the production factory', async () => {
  const token = tokenStore(); token.save('secret');
  const minimal = { gatewayBaseUrl: config.gatewayBaseUrl, createTradeUrl: config.createTradeUrl, productId: config.productId, serverEnv: config.serverEnv, exampleCatalog: config.exampleCatalog };
  const clientFactory = vi.fn(() => ({ create: async () => ({ ok: true as const, reference }), observe: async () => ({ end: 'failed' as const, lastState: 'unknown' as const, error: { category: 'network' as const, message: 'offline' } }) }));
  const controller = createExampleLiveController({ config: minimal, tokenStore: token, clientFactory });
  expect(await controller.run()).toBe(true);
  expect(clientFactory).toHaveBeenCalledWith(expect.objectContaining({ requestContext: { productId: 'product' } }));
  expect(JSON.parse(controller.exportRecord()).outcome.errorCategory).toBe('network');
  const production = createExampleLiveController({ config: minimal, tokenStore: token });
  expect(await production.run()).toBe(false);
  expect(production.state()).toMatchObject({ busy: false, message: '创建失败：invalid_input' });
});
