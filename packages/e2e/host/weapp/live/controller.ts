import { createPaymentClient, type Cancellation, type PaymentClient, type XpayEnv } from '@daqian/payment-sdk';
import type { LiveConfig } from './config';
import type { CreateTradePort } from './create-trade';
import { exportSafeEvents, projectOutcome, projectPhase, projectQuery, projectTradeCreated, type SafeLiveEvent } from './evidence';
import type { TokenStatus, TokenStore } from './token-store';
import {
  addTradeDraftItem, createTradeDraft, defaultTradeDefaults, removeTradeDraftItem,
  toCreateTradeRequest, validateTradeDraft, type LiveItemDraft, type LiveTradeDraft,
} from './trade-form';

export type LiveState = Readonly<{
  tokenStatus: TokenStatus;
  selectedEnv: 'omitted' | XpayEnv;
  envLocked: boolean;
  serverEnv: 'test' | 'prod';
  hasTrade: boolean;
  draft: LiveTradeDraft;
  draftLocked: boolean;
  busy: boolean;
  message: string;
  events: readonly SafeLiveEvent[];
}>;

type ClientFactory = (input: Parameters<typeof createPaymentClient>[0]) => PaymentClient;

function cancellation() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const value: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return { value, stop() { if (stopped) return; stopped = true; for (const listener of listeners) listener(); listeners.clear(); } };
}

/** 原生 Live 页面使用的最小状态机；交易创建和 SDK 公共入口保持清晰边界。 */
export function createLiveController(options: Readonly<{
  config: LiveConfig;
  appId: string;
  tokenStore: TokenStore;
  createTrade: CreateTradePort;
  clientFactory?: ClientFactory;
  nowMs?: () => number;
  executionId?: string;
  onChange?: (state: LiveState) => void;
}>) {
  const nowMs = options.nowMs ?? Date.now;
  const executionId = options.executionId ?? `live-${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let reference: Readonly<{ tradeNo: string }> | undefined;
  let selectedEnv: LiveState['selectedEnv'] = 'omitted';
  let boundEnv: LiveState['selectedEnv'] | undefined;
  let tradeCorrelation: string | undefined;
  let tradeSequence = 0;
  let draft = createTradeDraft(options.config.tradeDefaults ?? defaultTradeDefaults, options.config.userId ?? '');
  let busy = false;
  let message = '请配置 Token、确认 user_id 并确认创建参数';
  let events: SafeLiveEvent[] = [];
  let active = cancellation();
  let generation = 0;
  const client = (options.clientFactory ?? createPaymentClient)({
    runtime: 'wechat-miniapp', gatewayBaseUrl: options.config.gatewayBaseUrl, appId: options.appId,
    enabledMethods: ['wechat-miniapp-virtual-goods'], getAccessToken: options.tokenStore.getAccessToken,
    requestContext: {
      productId: options.config.productId,
      ...(options.config.lane ? { lane: options.config.lane } : {}),
      ...(options.config.appVersion ? { appVersion: options.config.appVersion } : {}),
    },
  });
  const state = (): LiveState => ({
    tokenStatus: options.tokenStore.status(), selectedEnv, envLocked: boundEnv !== undefined,
    serverEnv: options.config.serverEnv, hasTrade: reference !== undefined,
    draft: { ...draft, items: draft.items.map(item => ({ ...item })) }, draftLocked: reference !== undefined,
    busy, message, events: [...events],
  });
  const emit = () => options.onChange?.(state());
  const append = (event: SafeLiveEvent) => { events = [...events, event]; emit(); };
  return {
    state,
    saveToken(value: string) { const status = options.tokenStore.save(value); message = status === 'configured' ? 'Token 已配置' : status === 'storage_failed' ? 'Token 存储失败' : 'Token 未配置'; emit(); return status; },
    clearToken() { const status = options.tokenStore.clear(); message = status === 'storage_failed' ? 'Token 清除失败' : 'Token 未配置'; emit(); return status; },
    updateDraft(patch: Partial<Omit<LiveTradeDraft, 'items'>>) {
      if (busy || reference !== undefined) return false;
      draft = { ...draft, ...patch, items: draft.items.map(item => ({ ...item })) };
      emit(); return true;
    },
    updateItem(index: number, patch: Partial<LiveItemDraft>) {
      if (busy || reference !== undefined || !draft.items[index]) return false;
      draft = { ...draft, items: draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : { ...item }) };
      emit(); return true;
    },
    addItem() {
      if (busy || reference !== undefined) return false;
      draft = addTradeDraftItem(draft, (options.config.tradeDefaults ?? defaultTradeDefaults).items[0]!);
      emit(); return true;
    },
    removeItem(index: number) {
      if (busy || reference !== undefined) return false;
      draft = removeTradeDraftItem(draft, index); emit(); return true;
    },
    newDraft() {
      if (busy) return false;
      active.stop(); reference = undefined; tradeCorrelation = undefined; boundEnv = undefined;
      draft = createTradeDraft(options.config.tradeDefaults ?? defaultTradeDefaults, options.config.userId ?? '');
      message = '已创建新的测试草稿'; emit(); return true;
    },
    selectEnv(value: LiveState['selectedEnv']) { if (!['omitted', 'sandbox', 'prod'].includes(value)) throw new Error('invalid xpay environment'); if (busy || boundEnv !== undefined) return false; selectedEnv = value; emit(); return true; },
    async create() {
      if (busy || reference !== undefined || options.tokenStore.status() !== 'configured') return false;
      const checked = validateTradeDraft(draft);
      if (!checked.ok) { message = `创建参数无效：${checked.fields.join(', ')}`; emit(); return false; }
      const request = toCreateTradeRequest(checked.value);
      busy = true; active = cancellation(); emit();
      const current = generation;
      let result: Awaited<ReturnType<CreateTradePort['create']>>;
      try { result = await options.createTrade.create(request, { deadlineAtMs: nowMs() + 60_000, cancellation: active.value }); }
      catch { result = { kind: 'failed', reason: 'unavailable' }; }
      if (current !== generation) return false;
      busy = false;
      boundEnv = undefined;
      if (result.kind === 'created') {
        reference = result.reference; tradeSequence += 1; tradeCorrelation = `${executionId}-trade-${tradeSequence}`; message = '测试交易已创建';
        append(projectTradeCreated(events.length, nowMs(), executionId, tradeCorrelation));
      }
      else {
        reference = undefined; tradeCorrelation = undefined;
        message = ({
          auth: '鉴权失败，请检查 Token 与 user_id 后显式重试',
          invalid_input: '创建参数被拒绝，请检查表单后显式重试',
          conflict: '业务单号冲突，请检查当前草稿',
          invalid_response: '创建响应无效，未保存交易引用',
          unavailable: '创建结果不明确，请核对后显式重试',
          cancelled: '创建等待已取消，服务端交易事实未知',
        } as const)[result.reason];
      }
      emit(); return result.kind === 'created';
    },
    async pay() {
      if (busy || !reference || !tradeCorrelation || options.tokenStore.status() !== 'configured') return false;
      busy = true; active = cancellation(); emit();
      const current = generation;
      const correlation = tradeCorrelation;
      const frozenEnv = boundEnv ?? selectedEnv;
      boundEnv = frozenEnv;
      const outcome = await client.pay({ reference, method: 'wechat-miniapp-virtual-goods', ...(frozenEnv === 'omitted' ? {} : { xpayEnv: frozenEnv }) }, {
        cancellation: active.value,
        onPhase: event => { if (current === generation) append(projectPhase(events.length, nowMs(), executionId, correlation, event)); },
      });
      if (current !== generation) return false;
      append(projectOutcome(events.length, nowMs(), executionId, correlation, outcome)); busy = false; message = `支付调用结束：${outcome.reason}`; emit(); return true;
    },
    async query() {
      if (busy || !reference || !tradeCorrelation || options.tokenStore.status() !== 'configured') return false;
      busy = true; emit(); const current = generation; const correlation = tradeCorrelation;
      const result = await client.query(reference);
      if (current !== generation) return false;
      append(projectQuery(events.length, nowMs(), executionId, correlation, result)); busy = false; message = result.ok ? `查询完成：${result.value.state}` : `查询失败：${result.error.code}`; emit(); return true;
    },
    exportEvidence() { return exportSafeEvents(events); },
    clearEvidence() { if (busy) return false; events = []; reference = undefined; tradeCorrelation = undefined; boundEnv = undefined; message = '证据与当前交易已清除'; emit(); return true; },
    unload() {
      generation += 1; active.stop(); busy = false;
      draft = { ...draft, userId: '', items: draft.items.map(item => ({ ...item })) };
      emit();
    },
  };
}

export type LiveController = ReturnType<typeof createLiveController>;
