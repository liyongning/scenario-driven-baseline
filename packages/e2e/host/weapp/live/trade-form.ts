import { GoodsType, goodsTypeFromJSON } from '@daqian/payment-protocol/generated/idl/infra/pay/v1/pay';
import type { CreateTradeRequest } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';

export type LiveSkuSnapshotDraft = Readonly<{
  wechatVirtualProductId: string;
  bizSnapshot: string;
}>;

export type LiveItemDraft = Readonly<{
  bizOrderNo: string;
  skuId: string;
  skuName: string;
  skuSnapshot: LiveSkuSnapshotDraft;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  payAmount: string;
}>;

export const goodsTypeOptions: readonly ['GOODS_TYPE_VIRTUAL', 'GOODS_TYPE_PHYSICAL'] = [
  GoodsType.GOODS_TYPE_VIRTUAL,
  GoodsType.GOODS_TYPE_PHYSICAL,
];

export type LiveTradeDraft = Readonly<{
  userId: string;
  bizType: string;
  bizTradeNo: string;
  goodsType: typeof goodsTypeOptions[number];
  items: readonly LiveItemDraft[];
  originalAmount: string;
  discountAmount: string;
  payAmount: string;
}>;

export type LiveTradeDefaultItem = Omit<LiveItemDraft, 'bizOrderNo'>;
export type LiveTradeDefaults = Omit<LiveTradeDraft, 'userId' | 'bizTradeNo' | 'items'> & {
  readonly items: readonly LiveTradeDefaultItem[];
};

export type DraftValidation =
  | Readonly<{ ok: true; value: LiveTradeDraft }>
  | Readonly<{ ok: false; fields: readonly string[] }>;

export const defaultTradeDefaults: LiveTradeDefaults = {
  bizType: 'payment_sdk_live',
  goodsType: GoodsType.GOODS_TYPE_VIRTUAL,
  items: [{
    skuId: 'sdk-live-test-sku', skuName: '支付 SDK 联调商品',
    skuSnapshot: { wechatVirtualProductId: 'sdk-live-test-sku', bizSnapshot: '{}' },
    quantity: '1', unitPrice: '100', discountAmount: '0', payAmount: '100',
  }],
  originalAmount: '100', discountAmount: '0', payAmount: '100',
};

const INT64_MAX = 9223372036854775807n;
const INT32_MAX = 2147483647n;
let draftSequence = 0;
let itemSequence = 0;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function randomHex16(): string {
  let output = '';
  for (let index = 0; index < 16; index += 1) output += Math.floor(Math.random() * 16).toString(16);
  return output;
}

function nextTradeNo(): string {
  draftSequence += 1;
  return `live-${Date.now().toString(36)}-${randomHex16()}-${draftSequence}`;
}

function itemWithOrderNo(item: LiveTradeDefaultItem, bizTradeNo: string, index: number): LiveItemDraft {
  return { ...item, bizOrderNo: `${bizTradeNo}-${index}` };
}

function cloneItem(item: LiveItemDraft): LiveItemDraft {
  return { ...item, skuSnapshot: { ...item.skuSnapshot } };
}

/** 创建一份新的 Live 测试草稿；业务单号只用于受控联调幂等，不作为安全标识。 */
export function createTradeDraft(defaults: LiveTradeDefaults = defaultTradeDefaults, userId = ''): LiveTradeDraft {
  const bizTradeNo = nextTradeNo();
  return {
    userId, bizType: defaults.bizType, bizTradeNo, goodsType: defaults.goodsType,
    items: defaults.items.map((item, index) => itemWithOrderNo(item, bizTradeNo, index + 1)),
    originalAmount: defaults.originalAmount, discountAmount: defaults.discountAmount, payAmount: defaults.payAmount,
  };
}

/** 新增行时分配从不回收的页面序号，避免删除后复用旧的幂等子单号。 */
export function addTradeDraftItem(draft: LiveTradeDraft, item: LiveTradeDefaultItem): LiveTradeDraft {
  itemSequence += 1;
  const prefix = draft.bizTradeNo.slice(0, 50);
  return { ...draft, items: [...draft.items.map(cloneItem), { ...item, bizOrderNo: `${prefix}-i${itemSequence}` }] };
}

export function removeTradeDraftItem(draft: LiveTradeDraft, index: number): LiveTradeDraft {
  return { ...draft, items: draft.items.filter((_item, itemIndex) => itemIndex !== index).map(cloneItem) };
}

function push(fields: string[], field: string): void {
  if (!fields.includes(field)) fields.push(field);
}

function validString(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && codePointLength(value) >= min && codePointLength(value) <= max;
}

function decimal(value: unknown, max: bigint, positive: boolean): bigint | undefined {
  if (typeof value !== 'string' || !(positive ? /^[1-9]\d*$/ : /^(?:0|[1-9]\d*)$/).test(value)) return undefined;
  const parsed = BigInt(value);
  if (parsed > max) return undefined;
  return parsed;
}

function validJsonString(value: unknown, max: number): value is string {
  if (!validString(value, 0, max)) return false;
  try { JSON.parse(value); return true; } catch { return false; }
}

/** 返回复制后的提交快照；错误仅暴露受控字段路径，不包含用户输入。 */
export function validateTradeDraft(draft: LiveTradeDraft): DraftValidation {
  const fields: string[] = [];
  if (decimal(draft.userId, INT64_MAX, true) === undefined) push(fields, 'userId');
  if (!validString(draft.bizType, 1, 32)) push(fields, 'bizType');
  if (!validString(draft.bizTradeNo, 1, 64)) push(fields, 'bizTradeNo');
  if (draft.goodsType !== 'GOODS_TYPE_VIRTUAL' && draft.goodsType !== 'GOODS_TYPE_PHYSICAL') push(fields, 'goodsType');
  if (!Array.isArray(draft.items) || draft.items.length < 1 || draft.items.length > 50) push(fields, 'items');

  const seenOrderNos = new Set<string>();
  let originalTotal = 0n;
  let discountTotal = 0n;
  let payTotal = 0n;
  for (const [index, item] of draft.items.entries()) {
    const path = (name: string) => `items[${index}].${name}`;
    if (!validString(item.bizOrderNo, 1, 64) || seenOrderNos.has(item.bizOrderNo)) push(fields, path('bizOrderNo'));
    seenOrderNos.add(item.bizOrderNo);
    if (!validString(item.skuId, 1, 64)) push(fields, path('skuId'));
    if (!validString(item.skuName, 1, 128)) push(fields, path('skuName'));
    if (!validString(item.skuSnapshot.wechatVirtualProductId, 0, 64)) push(fields, path('skuSnapshot.wechatVirtualProductId'));
    if (!validJsonString(item.skuSnapshot.bizSnapshot, 2048)) push(fields, path('skuSnapshot.bizSnapshot'));
    const quantity = decimal(item.quantity, INT32_MAX, true);
    const unitPrice = decimal(item.unitPrice, INT64_MAX, false);
    const discountAmount = decimal(item.discountAmount, INT64_MAX, false);
    const payAmount = decimal(item.payAmount, INT64_MAX, false);
    if (quantity === undefined) push(fields, path('quantity'));
    if (unitPrice === undefined) push(fields, path('unitPrice'));
    if (discountAmount === undefined) push(fields, path('discountAmount'));
    if (payAmount === undefined) push(fields, path('payAmount'));
    if (quantity !== undefined && unitPrice !== undefined) {
      const original = quantity * unitPrice;
      if (original > INT64_MAX) push(fields, path('unitPrice'));
      else {
        originalTotal += original;
        if (originalTotal > INT64_MAX) push(fields, 'originalAmount');
        if (discountAmount !== undefined && payAmount !== undefined
          && (discountAmount > original || payAmount !== original - discountAmount)) push(fields, path('payAmount'));
      }
    }
    if (discountAmount !== undefined) discountTotal += discountAmount;
    if (payAmount !== undefined) payTotal += payAmount;
  }

  const originalAmount = decimal(draft.originalAmount, INT64_MAX, false);
  const discountAmount = decimal(draft.discountAmount, INT64_MAX, false);
  const payAmount = decimal(draft.payAmount, INT64_MAX, true);
  if (originalAmount === undefined || originalAmount !== originalTotal) push(fields, 'originalAmount');
  if (discountAmount === undefined || discountAmount !== discountTotal || discountTotal > INT64_MAX) push(fields, 'discountAmount');
  if (payAmount === undefined || payAmount !== payTotal || payTotal > INT64_MAX) push(fields, 'payAmount');

  if (fields.length > 0) return { ok: false, fields };
  return { ok: true, value: { ...draft, items: draft.items.map(cloneItem) } };
}

/** 配置中的默认值不含用户和业务单号，但复用同一完整字段及金额规则。 */
export function validateTradeDefaults(defaults: LiveTradeDefaults): boolean {
  const draft: LiveTradeDraft = {
    ...defaults,
    userId: '1',
    bizTradeNo: 'live-default',
    items: defaults.items.map((item, index) => ({ ...item, bizOrderNo: `live-default-${index + 1}` })),
  };
  return validateTradeDraft(draft).ok;
}

/** 将已验证快照映射为 generated DTO；所有 int64 均保持 bigint，不经过 Number。 */
export function toCreateTradeRequest(validDraft: LiveTradeDraft): CreateTradeRequest {
  return {
    bizType: validDraft.bizType,
    bizTradeNo: validDraft.bizTradeNo,
    userId: BigInt(validDraft.userId),
    goodsType: goodsTypeFromJSON(validDraft.goodsType) as GoodsType,
    payAmount: BigInt(validDraft.payAmount),
    items: validDraft.items.map(item => ({
      bizOrderNo: item.bizOrderNo, skuId: item.skuId, skuName: item.skuName,
      skuSnapshot: { wechatVirtualProductId: item.skuSnapshot.wechatVirtualProductId, bizSnapshot: item.skuSnapshot.bizSnapshot },
      quantity: Number(item.quantity), unitPrice: BigInt(item.unitPrice),
      discountAmount: BigInt(item.discountAmount), payAmount: BigInt(item.payAmount),
    })),
    originalAmount: BigInt(validDraft.originalAmount),
    discountAmount: BigInt(validDraft.discountAmount),
  };
}
