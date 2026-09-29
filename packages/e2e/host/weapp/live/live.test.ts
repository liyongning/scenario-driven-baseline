import { expect, test, vi, type TestContext } from 'vitest';
import type { PaymentClient, PaymentOutcome, PortResult, TradeSnapshot } from '@daqian/payment-sdk';
import { parseLiveConfig } from './config';
import { createUnavailableTradePort, type CreateTradePort } from './create-trade';
import { createLiveController } from './controller';
import { exportSafeEvents, projectOutcome, projectPhase, projectQuery, projectTradeCreated } from './evidence';
import { createLivePageDefinition } from './page';
import { createTokenStore, liveTokenStorageKey } from './token-store';

const config = { gatewayBaseUrl: 'https://gateway.example', createTradeUrl: 'https://trade.example/api/base/trade/create', productId: 'product', serverEnv: 'test' as const };
const outcome: PaymentOutcome = { attemptId: 'attempt', snapshot: { reference: { tradeNo: 'secret-trade' }, state: 'PAID', observedAtMs: 1, source: 'server' }, channelSignal: 'success_hint', reason: 'confirmed', paymentNo: 'secret-payment' };

function moduleCase(key: string, checks: string[], body: (context: TestContext) => void | Promise<void>) {
  test(`TC-PAYSDK-CORE-021 ${key}`, { meta: { paymentCase: { ownerId: 'TC-PAYSDK-CORE-021', caseId: key, environment: 'test-tools-unit', fixtureCase: null, covers: [{ id: 'TC-PAYSDK-CORE-021', caseKey: key, checks }] } } }, async context => {
    const before = expect.getState().assertionCalls;
    await body(context);
    await context.annotate(JSON.stringify({ assertions: expect.getState().assertionCalls - before, checkpoints: checks }), 'payment-evidence');
  });
}

moduleCase('config-source', ['config-allowlist'], () => {
  expect(parseLiveConfig({ PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://gateway.example/', PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create', PAYMENT_LIVE_PRODUCT_ID: 'p', PAYMENT_LIVE_LANE: 'lane', PAYMENT_LIVE_APP_VERSION: '1', PAYMENT_LIVE_SERVER_ENV: 'test' })).toEqual({ ...config, productId: 'p', lane: 'lane', appVersion: '1' });
  expect(parseLiveConfig({ ...env(), PAYMENT_LIVE_LANE: undefined as unknown as string })).toEqual(config);
  // 未登记的非凭据 key 不进入宿主配置，也不影响已登记配置解析。
  expect(parseLiveConfig({ ...env(), LOCAL_NOTE: 'local only', PAYMENT_LIVE_LANE: undefined as unknown as string })).toEqual(config);
  expect(parseLiveConfig({ ...env(), LOCAL_NOTE: '${HOME}' })).toEqual(config);
  for (const values of [
    { ...env(), PAYMENT_LIVE_ACCESS_TOKEN: 'secret' }, { ...env(), VITE_TOKEN: 'secret' },
    { ...env(), PAYMENT_LIVE_SESSION_KEY: 'secret' }, { ...env(), LOCAL_SECRET: 'secret' }, { ...env(), MY_PASSWORD: 'secret' }, { ...env(), PAYMENT_SIGNATURE: 'secret' },
    { ...env(), PAYMENT_LIVE_GATEWAY_BASE_URL: 'http://gateway.example' }, { ...env(), PAYMENT_LIVE_CREATE_TRADE_URL: 'https://u:p@trade.example/create' },
    { ...env(), PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://gateway.example/?x=1' }, { ...env(), PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://gateway.example/#x' },
    { ...env(), PAYMENT_LIVE_CREATE_TRADE_URL: 'not-a-url' }, { ...env(), PAYMENT_LIVE_PRODUCT_ID: '${PRODUCT}' }, { ...env(), PAYMENT_LIVE_PRODUCT_ID: '$PRODUCT' }, { ...env(), PAYMENT_LIVE_PRODUCT_ID: '' }, { ...env(), PAYMENT_LIVE_SERVER_ENV: 'stage' },
    { PAYMENT_LIVE_GATEWAY_BASE_URL: config.gatewayBaseUrl, PAYMENT_LIVE_CREATE_TRADE_URL: config.createTradeUrl, PAYMENT_LIVE_SERVER_ENV: 'prod' },
  ]) expect(() => parseLiveConfig(values)).toThrow();
  // 凭据类错误只报告 key 与规则，不输出其值。
  const credentialError = (() => { try { parseLiveConfig({ ...env(), LOCAL_SECRET: 'secret-value' }); return ''; } catch (error) { return String(error); } })();
  expect(credentialError).toContain('LOCAL_SECRET');
  expect(credentialError).not.toContain('secret-value');
});

function env() { return { PAYMENT_LIVE_GATEWAY_BASE_URL: config.gatewayBaseUrl, PAYMENT_LIVE_CREATE_TRADE_URL: config.createTradeUrl, PAYMENT_LIVE_PRODUCT_ID: config.productId, PAYMENT_LIVE_SERVER_ENV: 'test' }; }

moduleCase('token-save-replace-clear', ['token-lifecycle', 'fresh-token'], () => {
  const values = new Map<string, string>();
  const store = createTokenStore({ get: key => values.get(key), set: (key, value) => { values.set(key, value); }, remove: key => { values.delete(key); } });
  expect(store.status()).toBe('not_configured'); expect(store.save('first')).toBe('configured'); expect(store.getAccessToken()).toBe('first');
  expect(store.save('second')).toBe('configured'); expect(store.getAccessToken()).toBe('second'); expect(values.get(liveTokenStorageKey)).toBe('second');
  expect(store.clear()).toBe('not_configured'); expect(store.getAccessToken()).toBeNull(); expect(store.save('   ')).toBe('not_configured');
});

moduleCase('storage-failure', ['token-lifecycle', 'fresh-token'], () => {
  const failing = createTokenStore({ get() { throw new Error('secret'); }, set() { throw new Error('secret'); }, remove() { throw new Error('secret'); } });
  expect(failing.status()).toBe('storage_failed'); expect(failing.getAccessToken()).toBeNull(); expect(failing.save('secret')).toBe('storage_failed'); expect(failing.clear()).toBe('storage_failed');
  const readFailure = createTokenStore({ get() { throw new Error('secret'); }, set() {}, remove() {} });
  expect(readFailure.getAccessToken()).toBeNull(); expect(readFailure.status()).toBe('storage_failed'); expect(readFailure.save('recovered')).toBe('configured');
  expect(readFailure.getAccessToken()).toBeNull(); expect(readFailure.clear()).toBe('not_configured');
});

moduleCase('create-pay-recovery', ['host-sequencing'], async () => {
  let token = 'token'; const store = createTokenStore({ get: () => token, set: (_key, value) => { token = value; }, remove: () => { token = ''; } });
  let finishCreate!: (value: Awaited<ReturnType<CreateTradePort['create']>>) => void;
  const create = vi.fn(() => new Promise<Awaited<ReturnType<CreateTradePort['create']>>>(resolve => { finishCreate = resolve; }));
  let phase: ((event: { attemptId: string; phase: 'confirming' }) => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let finishPay!: (value: PaymentOutcome) => void; const pay = vi.fn((_request: unknown, options?: { onPhase?: typeof phase; cancellation?: { isStopped(): boolean; subscribe(listener: () => void): () => void } }) => new Promise<PaymentOutcome>(resolve => {
    phase = options?.onPhase; options?.cancellation?.isStopped(); unsubscribe = options?.cancellation?.subscribe(() => resolve({ ...outcome, reason: 'stopped', channelSignal: 'unknown' })); finishPay = resolve;
  }));
  const queryResult: PortResult<TradeSnapshot> = { ok: true, value: outcome.snapshot };
  const query = vi.fn(async (reference: Parameters<PaymentClient['query']>[0]): Promise<PortResult<TradeSnapshot>> => { void reference; return queryResult; }); const client = { pay, query, observe: vi.fn() } as unknown as PaymentClient;
  const controller = createLiveController({ config, appId: 'wx-live', tokenStore: store, createTrade: { create }, clientFactory: () => client, nowMs: () => 10, executionId: 'execution-1' });
  controller.updateDraft({ userId: '42' });
  expect(await controller.pay()).toBe(false); const pendingCreate = controller.create(); expect(await controller.create()).toBe(false);
  finishCreate({ kind: 'created', reference: { tradeNo: 'trade' } }); expect(await pendingCreate).toBe(true);
  controller.selectEnv('sandbox'); const pendingPay = controller.pay(); expect(controller.selectEnv('prod')).toBe(false); expect(controller.clearEvidence()).toBe(false); expect(await controller.pay()).toBe(false);
  unsubscribe?.();
  finishPay({ ...outcome, reason: 'channel_session_required', interruptedPhase: 'invoke' }); expect(await pendingPay).toBe(true); expect(pay.mock.calls[0]?.[0]).toMatchObject({ xpayEnv: 'sandbox' });
  expect(await controller.query()).toBe(true); expect(create).toHaveBeenCalledTimes(1); expect(query).toHaveBeenCalledTimes(1);
  expect(controller.selectEnv('prod')).toBe(false); const recoveryPay = controller.pay(); phase?.({ attemptId: 'attempt', phase: 'confirming' }); finishPay(outcome); expect(await recoveryPay).toBe(true); expect(pay.mock.calls[1]?.[0]).toMatchObject({ xpayEnv: 'sandbox' });
  controller.newDraft(); controller.updateDraft({ userId: '42' });
  const newTrade = controller.create(); finishCreate({ kind: 'created', reference: { tradeNo: 'new-trade' } }); expect(await newTrade).toBe(true);
  expect(controller.selectEnv('omitted')).toBe(true); const secondPay = controller.pay(); finishPay(outcome); expect(await secondPay).toBe(true); expect(pay.mock.calls[2]?.[0]).not.toHaveProperty('xpayEnv');
  expect(controller.state().events).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'trade_created', executionId: 'execution-1', correlationId: 'execution-1-trade-1' }),
    expect.objectContaining({ kind: 'outcome', executionId: 'execution-1', correlationId: 'execution-1-trade-1' }),
    expect.objectContaining({ kind: 'trade_created', executionId: 'execution-1', correlationId: 'execution-1-trade-2' }),
    expect.objectContaining({ kind: 'outcome', executionId: 'execution-1', correlationId: 'execution-1-trade-2' }),
  ]));
  expect(() => controller.selectEnv('invalid' as never)).toThrow('invalid xpay environment');
  controller.newDraft(); controller.updateDraft({ userId: '42' });
  const lateCreate = controller.create(); controller.unload(); finishCreate({ kind: 'created', reference: { tradeNo: 'late' } }); expect(await lateCreate).toBe(false);
  controller.newDraft(); controller.updateDraft({ userId: '42' });
  const restored = controller.create(); finishCreate({ kind: 'created', reference: { tradeNo: 'restored' } }); expect(await restored).toBe(true);
  const latePay = controller.pay(); controller.unload(); expect(await latePay).toBe(false); phase?.({ attemptId: 'late', phase: 'confirming' });
  let finishQuery!: (value: PortResult<TradeSnapshot>) => void;
  query.mockImplementationOnce(() => new Promise<PortResult<TradeSnapshot>>(resolve => { finishQuery = resolve; }));
  const lateQuery = controller.query(); controller.unload(); finishQuery(queryResult); expect(await lateQuery).toBe(false);
  query.mockResolvedValueOnce({ ok: false, error: { code: 'AUTH_REQUIRED', source: 'gateway', message: '登录状态已失效，请重新登录' } });
  expect(await controller.query()).toBe(true); expect(controller.state().message).toBe('查询失败：AUTH_REQUIRED');
  expect(controller.clearEvidence()).toBe(true); expect(controller.state()).toMatchObject({ hasTrade: false, events: [], envLocked: false, message: '证据与当前交易已清除' }); expect(await controller.pay()).toBe(false);
  const failed = createLiveController({ config, appId: 'wx-live', tokenStore: store, createTrade: { create: async () => ({ kind: 'failed', reason: 'auth' }) }, clientFactory: () => client });
  failed.updateDraft({ userId: '42' });
  expect(await failed.create()).toBe(false); expect(failed.state().message).toBe('鉴权失败，请检查 Token 与 user_id 后显式重试');
  expect(failed.saveToken('')).toBe('not_configured');
  const failedStore = { status: () => 'storage_failed' as const, save: () => 'storage_failed' as const, clear: () => 'storage_failed' as const, getAccessToken: () => null };
  const blocked = createLiveController({ config: { ...config, lane: 'lane', appVersion: '1' }, appId: 'wx-live', tokenStore: failedStore, createTrade: { create: async () => ({ kind: 'failed', reason: 'unavailable' }) }, clientFactory: () => client });
  expect(blocked.saveToken('x')).toBe('storage_failed'); expect(blocked.clearToken()).toBe('storage_failed'); expect(await blocked.create()).toBe(false); expect(await blocked.pay()).toBe(false); expect(await blocked.query()).toBe(false);
  const rejected = createLiveController({ config, appId: 'wx-live', tokenStore: store, createTrade: { create: async () => { throw new Error('network'); } }, clientFactory: () => client });
  rejected.updateDraft({ userId: '42' });
  expect(await rejected.create()).toBe(false); expect(rejected.state()).toMatchObject({ busy: false, message: '创建结果不明确，请核对后显式重试' });
});

moduleCase('redacted-record', ['safe-evidence'], () => {
  const events = [projectTradeCreated(0, 0, 'execution-1', 'trade-1'), projectPhase(1, 1, 'execution-1', 'trade-1', { attemptId: 'attempt', phase: 'confirming' }), projectOutcome(2, 2, 'execution-1', 'trade-1', outcome), projectQuery(3, 3, 'execution-1', 'trade-1', { ok: false, error: { code: 'AUTH_REQUIRED', source: 'gateway', message: '登录状态已失效，请重新登录' } })];
  const exported = exportSafeEvents(events);
  expect(exported).toContain('PAID');
  expect(exported).not.toContain('secret-trade'); expect(exported).not.toContain('secret-payment'); expect(exported).not.toContain('signData');
  expect(JSON.parse(exported)).toEqual(events);
  expect(events[2]).toMatchObject({ correlationId: 'trade-1', snapshot: { state: 'PAID', source: 'server' } });
  expect(projectOutcome(4, 4, 'execution-1', 'trade-1', { ...outcome, interruptedPhase: 'query', error: { code: 'AUTH_REQUIRED', source: 'gateway', message: '登录状态已失效，请重新登录' } })).toMatchObject({ interruptedPhase: 'query', errorCode: 'AUTH_REQUIRED' });
  expect(projectQuery(5, 5, 'execution-1', 'trade-1', { ok: true, value: outcome.snapshot })).toMatchObject({ snapshot: { state: 'PAID', source: 'server' } });
});

test('unavailable trade port fails closed and native page binding clears token input', async () => {
  await expect(createUnavailableTradePort().create({} as never, { deadlineAtMs: 0 })).resolves.toEqual({ kind: 'failed', reason: 'unavailable' });
  const values = new Map<string, string>();
  const platform = { getStorageSync: (key: string) => values.get(key), setStorageSync: (key: string, value: string) => { values.set(key, value); }, removeStorageSync: (key: string) => { values.delete(key); }, setClipboardData: vi.fn() };
  const definition = createLivePageDefinition(platform, config, 'wx-live');
  const blank = { data: {}, setData() {} };
  definition.onSaveToken.call(blank); definition.onClearToken.call(blank); definition.onSelectEnv.call(blank, { detail: { value: 'prod' } });
  await definition.onCreateTrade.call(blank); await definition.onPay.call(blank); await definition.onQuery.call(blank); definition.onExport.call(blank); definition.onClearEvidence.call(blank); definition.onUnload.call(blank);
  const instance: { data: Record<string, unknown>; setData(value: Record<string, unknown>): void; controller?: ReturnType<typeof createLiveController>; tokenInput?: string } = { data: {}, setData(value) { Object.assign(this.data, value); } };
  definition.onLoad.call(instance); definition.onSaveToken.call(instance); definition.onTokenInput.call(instance, { detail: { value: 'token' } }); definition.onSaveToken.call(instance);
  expect(instance.data.tokenInput).toBe(''); expect(instance.data.tokenStatus).toBe('configured');
  definition.onSelectEnv.call(instance, { detail: { value: 'prod' } }); expect(instance.data.selectedEnv).toBe('prod');
  await definition.onCreateTrade.call(instance); await definition.onPay.call(instance); await definition.onQuery.call(instance);
  definition.onExport.call(instance); definition.onClearEvidence.call(instance); definition.onClearToken.call(instance); definition.onUnload.call(instance);
  expect(platform.setClipboardData).toHaveBeenCalledWith({ data: '[]\n' });
});
