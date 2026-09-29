import { expect, test, type TestContext } from 'vitest';
import { parseLiveConfig } from './config';
import {
  addTradeDraftItem, createTradeDraft, defaultTradeDefaults, removeTradeDraftItem,
  toCreateTradeRequest, validateTradeDraft,
} from './trade-form';

const defaultOverride = {
  bizType: 'editable_live',
  goodsType: 'GOODS_TYPE_VIRTUAL',
  items: [{
    skuId: 'sku-1', skuName: '联调商品', skuSnapshot: { wechatVirtualProductId: 'product-1', bizSnapshot: '{}' }, quantity: '2',
    unitPrice: '3', discountAmount: '1', payAmount: '5',
  }],
  originalAmount: '6', discountAmount: '1', payAmount: '5',
} as const;

function moduleCase(key: string, checks: string[], body: (context: TestContext) => void | Promise<void>) {
  test(`TC-PAYSDK-CORE-023 ${key}`, { meta: { paymentCase: { ownerId: 'TC-PAYSDK-CORE-023', caseId: key, environment: 'test-tools-unit', fixtureCase: null, covers: [{ id: 'TC-PAYSDK-CORE-023', caseKey: key, checks }] } } }, async context => {
    const before = expect.getState().assertionCalls;
    await body(context);
    await context.annotate(JSON.stringify({ assertions: expect.getState().assertionCalls - before, checkpoints: checks }), 'payment-evidence');
  });
}

test('trade defaults accept only the strict editable configuration shape', () => {
  const parsed = parseLiveConfig({
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example',
    PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create',
    PAYMENT_LIVE_PRODUCT_ID: 'product',
    PAYMENT_LIVE_SERVER_ENV: 'test',
    PAYMENT_LIVE_USER_ID: '42',
    PAYMENT_LIVE_TRADE_DEFAULTS_JSON: JSON.stringify(defaultOverride),
  });

  expect(parsed.tradeDefaults).toEqual(defaultOverride);
  expect(parsed.userId).toBe('42');
  expect(() => parseLiveConfig({
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example',
    PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/wrong',
    PAYMENT_LIVE_PRODUCT_ID: 'product',
    PAYMENT_LIVE_SERVER_ENV: 'test',
  })).toThrow('invalid PAYMENT_LIVE_CREATE_TRADE_URL');
  expect(() => parseLiveConfig({
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example',
    PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create',
    PAYMENT_LIVE_PRODUCT_ID: 'product',
    PAYMENT_LIVE_SERVER_ENV: 'test',
    PAYMENT_LIVE_TRADE_DEFAULTS_JSON: JSON.stringify({ ...defaultOverride, userId: '1' }),
  })).toThrow('invalid PAYMENT_LIVE_TRADE_DEFAULTS_JSON');
  expect(() => parseLiveConfig({
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example',
    PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create',
    PAYMENT_LIVE_PRODUCT_ID: 'product',
    PAYMENT_LIVE_SERVER_ENV: 'test',
    PAYMENT_LIVE_TRADE_DEFAULTS_JSON: JSON.stringify({ ...defaultOverride, payAmount: '4' }),
  })).toThrow('invalid PAYMENT_LIVE_TRADE_DEFAULTS_JSON');
  expect(() => parseLiveConfig({
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example', PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create',
    PAYMENT_LIVE_PRODUCT_ID: 'product', PAYMENT_LIVE_SERVER_ENV: 'test', PAYMENT_LIVE_TRADE_DEFAULTS_JSON: '{',
  })).toThrow('invalid PAYMENT_LIVE_TRADE_DEFAULTS_JSON');
  for (const userId of ['01', '+1', '-1', '1.0', '1e3', '9223372036854775808']) {
    expect(() => parseLiveConfig({
      PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example', PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create',
      PAYMENT_LIVE_PRODUCT_ID: 'product', PAYMENT_LIVE_SERVER_ENV: 'test', PAYMENT_LIVE_USER_ID: userId,
    })).toThrow('invalid PAYMENT_LIVE_USER_ID');
  }
  expect(parseLiveConfig({
    PAYMENT_LIVE_GATEWAY_BASE_URL: 'https://pay.example', PAYMENT_LIVE_CREATE_TRADE_URL: 'https://trade.example/api/base/trade/create',
    PAYMENT_LIVE_PRODUCT_ID: 'product', PAYMENT_LIVE_SERVER_ENV: 'test', PAYMENT_LIVE_USER_ID: '   ',
  }).userId).toBeUndefined();

  expect(defaultTradeDefaults).toEqual({
    bizType: 'payment_sdk_live', goodsType: 'GOODS_TYPE_VIRTUAL',
    items: [{ skuId: 'sdk-live-test-sku', skuName: '支付 SDK 联调商品', skuSnapshot: { wechatVirtualProductId: 'sdk-live-test-sku', bizSnapshot: '{}' }, quantity: '1', unitPrice: '100', discountAmount: '0', payAmount: '100' }],
    originalAmount: '100', discountAmount: '0', payAmount: '100',
  });
  const draft = createTradeDraft(defaultOverride, '42');
  expect(draft).toMatchObject({ userId: '42', bizType: 'editable_live', goodsType: 'GOODS_TYPE_VIRTUAL', originalAmount: '6', discountAmount: '1', payAmount: '5' });
  expect(draft.bizTradeNo).toMatch(/^live-[a-z0-9]+-[0-9a-f]{16}-\d+$/);
  expect(draft.items).toEqual([expect.objectContaining({ bizOrderNo: `${draft.bizTradeNo}-1`, skuId: 'sku-1', quantity: '2' })]);
  expect(draft.items[0]).not.toBe(defaultOverride.items[0]);
});

moduleCase('numeric-and-item-boundaries', ['editable-defaults'], async () => {
  const valid = { ...createTradeDraft(defaultOverride), userId: '9223372036854775807' };
  const accepted = validateTradeDraft(valid);
  expect(accepted.ok).toBe(true);
  if (!accepted.ok) return;
  expect(toCreateTradeRequest(accepted.value)).toMatchObject({
    userId: 9223372036854775807n, goodsType: 'GOODS_TYPE_VIRTUAL', payAmount: 5n,
    items: [expect.objectContaining({ quantity: 2, unitPrice: 3n, discountAmount: 1n, payAmount: 5n, skuSnapshot: { wechatVirtualProductId: 'product-1', bizSnapshot: '{}' } })],
  });
  const badIntegers = ['', '01', '+1', '-1', '1.0', '1e3', ' 1', '9223372036854775808'];
  for (const userId of badIntegers) {
    const result = validateTradeDraft({ ...valid, userId });
    expect(result).toMatchObject({ ok: false, fields: expect.arrayContaining(['userId']) });
  }
  expect(validateTradeDraft({ ...valid, bizType: '😀'.repeat(32) }).ok).toBe(true);
  expect(validateTradeDraft({ ...valid, bizType: '😀'.repeat(33) })).toMatchObject({ ok: false, fields: expect.arrayContaining(['bizType']) });
  expect(validateTradeDraft({ ...valid, goodsType: 'GOODS_TYPE_UNSPECIFIED' as never })).toMatchObject({ ok: false, fields: expect.arrayContaining(['goodsType']) });
  expect(validateTradeDraft({ ...valid, items: [] })).toMatchObject({ ok: false, fields: expect.arrayContaining(['items']) });
  const item = valid.items[0]!;
  expect(validateTradeDraft({ ...valid, items: Array.from({ length: 51 }, (_, index) => ({ ...item, bizOrderNo: `line-${index}` })) })).toMatchObject({ ok: false, fields: expect.arrayContaining(['items']) });
  expect(validateTradeDraft({ ...valid, items: [{ ...item, quantity: '2147483648' }] })).toMatchObject({ ok: false, fields: expect.arrayContaining(['items[0].quantity']) });
  expect(validateTradeDraft({ ...valid, items: [{ ...item, skuSnapshot: { ...item.skuSnapshot, bizSnapshot: '{' } }] })).toMatchObject({ ok: false, fields: expect.arrayContaining(['items[0].skuSnapshot.bizSnapshot']) });
  expect(validateTradeDraft({ ...valid, items: [{ ...item, skuSnapshot: { ...item.skuSnapshot, wechatVirtualProductId: 'x'.repeat(65) } }] })).toMatchObject({ ok: false, fields: expect.arrayContaining(['items[0].skuSnapshot.wechatVirtualProductId']) });
  expect(validateTradeDraft({ ...valid, items: [{ ...item }, { ...item }] })).toMatchObject({ ok: false, fields: expect.arrayContaining(['items[1].bizOrderNo']) });
  expect(validateTradeDraft({ ...valid, items: [{ ...item, payAmount: '4' }] })).toMatchObject({ ok: false, fields: expect.arrayContaining(['items[0].payAmount', 'payAmount']) });
  expect(validateTradeDraft({ ...valid, originalAmount: '5' })).toMatchObject({ ok: false, fields: expect.arrayContaining(['originalAmount']) });
  expect(validateTradeDraft({ ...valid, discountAmount: '0' })).toMatchObject({ ok: false, fields: expect.arrayContaining(['discountAmount']) });
  expect(validateTradeDraft({ ...valid, payAmount: '0' })).toMatchObject({ ok: false, fields: expect.arrayContaining(['payAmount']) });
  for (const [field, value] of [['bizTradeNo', ''], ['bizType', ''], ['originalAmount', 'x'], ['discountAmount', 'x']] as const) {
    expect(validateTradeDraft({ ...valid, [field]: value }).ok).toBe(false);
  }
  expect(validateTradeDraft({ ...valid, items: [{ ...item, skuId: '', skuName: '', skuSnapshot: { ...item.skuSnapshot, bizSnapshot: 'x'.repeat(2049) }, unitPrice: 'x', discountAmount: 'x', payAmount: 'x' }] }).ok).toBe(false);
  expect(validateTradeDraft({ ...valid, items: [{ ...item, quantity: '2', unitPrice: '9223372036854775807', discountAmount: '0', payAmount: '0' }] })).toMatchObject({ ok: false, fields: expect.arrayContaining(['items[0].unitPrice']) });
  const huge = { ...item, quantity: '1', unitPrice: '9223372036854775807', discountAmount: '0', payAmount: '9223372036854775807' };
  expect(validateTradeDraft({ ...valid, items: [{ ...huge, bizOrderNo: 'a' }, { ...huge, bizOrderNo: 'b' }], originalAmount: '9223372036854775807', discountAmount: '0', payAmount: '9223372036854775807' }).ok).toBe(false);
});

test('trade draft helpers preserve snapshots and never reuse generated identifiers', () => {
  const first = createTradeDraft(defaultOverride);
  const second = createTradeDraft(defaultOverride);
  expect(second.bizTradeNo).not.toBe(first.bizTradeNo);
  const added = addTradeDraftItem(first, defaultOverride.items[0]);
  expect(added.items).toHaveLength(2);
  expect(added.items[1]!.bizOrderNo).not.toBe(added.items[0]!.bizOrderNo);
  const removed = removeTradeDraftItem(added, 0);
  const readded = addTradeDraftItem(removed, defaultOverride.items[0]);
  expect(readded.items[1]!.bizOrderNo).not.toBe(added.items[0]!.bizOrderNo);
  const source = { ...first, userId: '42' };
  const validation = validateTradeDraft(source);
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;
  (source.items[0]! as { skuName: string }).skuName = '后来修改';
  expect(validation.value.items[0]!.skuName).toBe('联调商品');
  expect(validation.value.bizTradeNo).toBe(first.bizTradeNo);
});
