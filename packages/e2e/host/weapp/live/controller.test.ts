import { expect, test, vi, type TestContext } from 'vitest';
import type { Cancellation, HttpPort } from '@daqian/payment-protocol';
import type { PaymentClient } from '@daqian/payment-sdk';
import { createLiveCreateTradePort, type CreateTradePort, type CreateTradeResult } from './create-trade';
import { createLiveController } from './controller';
import { createTokenStore } from './token-store';
import { CreateTradeRequest } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import wireRequest from '../../../tests/fixtures/TC-PAYSDK-CORE-023/wire-request.json';

const config = {
  gatewayBaseUrl: 'https://pay.example', createTradeUrl: 'https://trade.example/api/base/trade/create',
  productId: 'product', serverEnv: 'test' as const,
};
const client = { pay: vi.fn(), query: vi.fn(), observe: vi.fn() } as unknown as PaymentClient;

function moduleCase(key: string, checks: string[], body: (context: TestContext) => void | Promise<void>) {
  test(`TC-PAYSDK-CORE-023 ${key}`, { meta: { paymentCase: { ownerId: 'TC-PAYSDK-CORE-023', caseId: key, environment: 'test-tools-unit', fixtureCase: null, covers: [{ id: 'TC-PAYSDK-CORE-023', caseKey: key, checks }] } } }, async context => {
    const before = expect.getState().assertionCalls;
    await body(context);
    await context.annotate(JSON.stringify({ assertions: expect.getState().assertionCalls - before, checkpoints: checks }), 'payment-evidence');
  });
}

moduleCase('draft-and-retry', ['draft-idempotency', 'create-lifetime'], async () => {
  const tokenStore = createTokenStore({ get: () => 'token', set: () => undefined, remove: () => undefined });
  const calls: Parameters<CreateTradePort['create']>[] = [];
  const completions: Array<(result: CreateTradeResult) => void> = [];
  const create = vi.fn((...args: Parameters<CreateTradePort['create']>) => {
    calls.push(args);
    return new Promise<CreateTradeResult>(resolve => completions.push(resolve));
  });
  const controller = createLiveController({ config, appId: 'wx-live', tokenStore, createTrade: { create }, clientFactory: () => client, nowMs: () => 100 });
  const initialNo = controller.state().draft.bizTradeNo;
  expect(controller.updateDraft({ userId: '42' })).toBe(true);
  const pending = controller.create();
  expect(create).toHaveBeenCalledTimes(1);
  expect(calls[0]![0]).toMatchObject({ userId: 42n, bizTradeNo: initialNo });
  expect(calls[0]![1].deadlineAtMs).toBe(60_100);
  expect(controller.updateDraft({ userId: '43' })).toBe(false);
  expect(controller.updateItem(0, { skuName: 'busy' })).toBe(false);
  expect(controller.addItem()).toBe(false);
  expect(controller.removeItem(0)).toBe(false);
  expect(controller.newDraft()).toBe(false);
  expect(await controller.create()).toBe(false);
  completions.shift()!({ kind: 'failed', reason: 'unavailable' });
  expect(await pending).toBe(false);
  expect(controller.state().draft.bizTradeNo).toBe(initialNo);

  const retry = controller.create();
  expect(calls[1]![0]).toMatchObject({ userId: 42n, bizTradeNo: initialNo });
  completions.shift()!({ kind: 'created', reference: { tradeNo: 'trade-real' } });
  expect(await retry).toBe(true);
  expect(controller.state()).toMatchObject({ hasTrade: true, draftLocked: true });
  expect(controller.updateDraft({ userId: '44' })).toBe(false);
  expect(controller.addItem()).toBe(false);
  expect(controller.removeItem(0)).toBe(false);

  expect(controller.newDraft()).toBe(true);
  expect(controller.state()).toMatchObject({ hasTrade: false, draftLocked: false });
  expect(controller.state().draft.bizTradeNo).not.toBe(initialNo);
  expect(controller.state().draft.userId).toBe('');
  expect(controller.updateItem(9, { skuName: 'missing' })).toBe(false);
  const firstItemNo = controller.state().draft.items[0]!.bizOrderNo;
  expect(controller.addItem()).toBe(true);
  const addedItemNo = controller.state().draft.items[1]!.bizOrderNo;
  expect(controller.updateItem(0, { skuName: 'first' })).toBe(true);
  expect(controller.state().draft.items[1]!.skuName).not.toBe('first');
  expect(controller.removeItem(1)).toBe(true);
  expect(controller.addItem()).toBe(true);
  expect(controller.state().draft.items[1]!.bizOrderNo).not.toBe(addedItemNo);
  expect(controller.state().draft.items[1]!.bizOrderNo).not.toBe(firstItemNo);
});

moduleCase('timeout-unload-and-late', ['create-lifetime', 'draft-idempotency'], async () => {
  const network: HttpPort = { send: vi.fn(async () => ({ ok: false as const, error: { code: 'TIMEOUT' as const } })) };
  const port = createLiveCreateTradePort({ createTradeUrl: 'https://trade.example/api/base/trade/create', getAccessToken: () => 'token', http: network, runtime: { nowMs: () => 100, nextRequestId: () => 'live-request-1', sleepMs: () => new Promise(() => undefined) } });
  await expect(port.create(CreateTradeRequest.fromJSON(wireRequest), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason: 'unavailable' });
  expect(network.send).toHaveBeenCalledTimes(1);
  const stopped: Cancellation = { isStopped: () => true, subscribe: () => () => undefined };
  await expect(port.create(CreateTradeRequest.fromJSON(wireRequest), { deadlineAtMs: 60_100, cancellation: stopped })).resolves.toEqual({ kind: 'failed', reason: 'cancelled' });
  expect(network.send).toHaveBeenCalledTimes(1);

  const tokenStore = createTokenStore({ get: () => 'token', set: () => undefined, remove: () => undefined });
  let finish!: (result: CreateTradeResult) => void;
  const create = vi.fn(() => new Promise<CreateTradeResult>(resolve => { finish = resolve; }));
  const controller = createLiveController({ config, appId: 'wx-live', tokenStore, createTrade: { create }, clientFactory: () => client, nowMs: () => 100 });
  expect(await controller.create()).toBe(false);
  expect(create).not.toHaveBeenCalled();
  controller.updateDraft({ userId: '42' });
  const pending = controller.create();
  controller.unload();
  finish({ kind: 'created', reference: { tradeNo: 'late' } });
  expect(await pending).toBe(false);
  expect(controller.state()).toMatchObject({ hasTrade: false, envLocked: false, draft: { userId: '' } });
  expect(create).toHaveBeenCalledTimes(1);

  const configured = createLiveController({ config: { ...config, tradeDefaults: { bizType: 'configured', goodsType: 'GOODS_TYPE_VIRTUAL', items: [{ skuId: 's', skuName: 'n', skuSnapshot: { wechatVirtualProductId: 's', bizSnapshot: '{}' }, quantity: '1', unitPrice: '1', discountAmount: '0', payAmount: '1' }], originalAmount: '1', discountAmount: '0', payAmount: '1' } }, appId: 'wx-live', tokenStore, createTrade: { create }, clientFactory: () => client });
  expect(configured.state().draft.bizType).toBe('configured');
});

test('controller pre-fills user id from live config and reapplies it to new drafts', () => {
  const tokenStore = createTokenStore({ get: () => 'token', set: () => undefined, remove: () => undefined });
  const create = vi.fn(async () => ({ kind: 'failed' as const, reason: 'unavailable' as const }));
  const controller = createLiveController({ config: { ...config, userId: '314' }, appId: 'wx-live', tokenStore, createTrade: { create }, clientFactory: () => client });

  expect(controller.state().draft.userId).toBe('314');
  controller.updateDraft({ userId: '315' });
  expect(controller.state().draft.userId).toBe('315');
  expect(controller.newDraft()).toBe(true);
  expect(controller.state().draft.userId).toBe('314');
});
