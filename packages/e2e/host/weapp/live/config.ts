import { validateTradeDefaults, type LiveTradeDefaults } from './trade-form';

export const liveEnvKeys = [
  'PAYMENT_LIVE_GATEWAY_BASE_URL',
  'PAYMENT_LIVE_CREATE_TRADE_URL',
  'PAYMENT_LIVE_PRODUCT_ID',
  'PAYMENT_LIVE_LANE',
  'PAYMENT_LIVE_APP_VERSION',
  'PAYMENT_LIVE_SERVER_ENV',
  'PAYMENT_LIVE_USER_ID',
  'PAYMENT_LIVE_TRADE_DEFAULTS_JSON',
  'LIVE_EXAMPLE_KIND',
  'LIVE_EXAMPLE_ITEM_ID',
  'LIVE_EXAMPLE_ITEM_NAME',
  'LIVE_EXAMPLE_UNIT_VALUE',
] as const;

export type LiveConfig = Readonly<{
  gatewayBaseUrl: string;
  createTradeUrl: string;
  productId: string;
  lane?: string;
  appVersion?: string;
  serverEnv: 'test' | 'prod';
  userId?: string;
  tradeDefaults?: LiveTradeDefaults;
  exampleCatalog?: Readonly<{ kind: string; itemId: string; itemName: string; unitValue: string }>;
}>;

function required(values: Readonly<Record<string, string>>, key: string): string {
  const value = values[key];
  if (value === undefined || value.trim().length === 0) throw new Error(`missing ${key}`);
  return value;
}

function httpsUrl(value: string, key: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`invalid ${key}`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(`invalid ${key}`);
  return url.toString().replace(/\/$/, '');
}

const defaultKeys = ['bizType', 'goodsType', 'items', 'originalAmount', 'discountAmount', 'payAmount'] as const;
const itemKeys = ['skuId', 'skuName', 'skuSnapshot', 'quantity', 'unitPrice', 'discountAmount', 'payAmount'] as const;
const skuSnapshotKeys = ['wechatVirtualProductId', 'bizSnapshot'] as const;
const INT64_MAX = 9223372036854775807n;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactStringKeys(value: unknown, keys: readonly string[]): value is Record<string, string> {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => typeof value[key] === 'string');
}

function isSkuSnapshot(value: unknown): boolean {
  return hasExactStringKeys(value, skuSnapshotKeys);
}

function parseTradeDefaults(raw: string | undefined): LiveTradeDefaults | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('invalid PAYMENT_LIVE_TRADE_DEFAULTS_JSON'); }
  if (!isRecord(value)
    || Object.keys(value).length !== defaultKeys.length
    || !defaultKeys.every(key => key in value)
    || !Array.isArray(value.items)
    || !value.items.every(item => isRecord(item)
      && Object.keys(item).length === itemKeys.length
      && itemKeys.every(key => key === 'skuSnapshot' ? isSkuSnapshot(item[key]) : typeof item[key] === 'string'))
    || defaultKeys.filter(key => key !== 'items').some(key => typeof value[key] !== 'string')) {
    throw new Error('invalid PAYMENT_LIVE_TRADE_DEFAULTS_JSON');
  }
  const defaults = value as LiveTradeDefaults;
  if (!validateTradeDefaults(defaults)) throw new Error('invalid PAYMENT_LIVE_TRADE_DEFAULTS_JSON');
  return defaults;
}

function parseUserId(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > INT64_MAX) throw new Error('invalid PAYMENT_LIVE_USER_ID');
  return value;
}

function parseExampleCatalog(values: Readonly<Record<string, string>>): LiveConfig['exampleCatalog'] {
  const keys = ['LIVE_EXAMPLE_KIND', 'LIVE_EXAMPLE_ITEM_ID', 'LIVE_EXAMPLE_ITEM_NAME', 'LIVE_EXAMPLE_UNIT_VALUE'] as const;
  if (keys.every(key => !values[key]?.trim())) return undefined;
  const [kind, itemId, itemName, unitValue] = keys.map(key => required(values, key).trim());
  if (!/^[1-9]\d*$/.test(unitValue!) || BigInt(unitValue!) > INT64_MAX) throw new Error('invalid LIVE_EXAMPLE_UNIT_VALUE');
  return { kind: kind!, itemId: itemId!, itemName: itemName!, unitValue: unitValue! };
}

// 凭据类 key 一律拒绝；未登记的非凭据 key 不进入宿主配置，也不影响已登记配置解析。
const credentialKeyPattern = /TOKEN|SECRET|SESSION_KEY|SIGNATURE|PASSWORD/i;
const viteKeyPattern = /^VITE_/i;

/** 只解析已评审的非敏感 .env.live 白名单；错误只报告 key 与规则，不输出其值。 */
export function parseLiveConfig(values: Readonly<Record<string, string>>): LiveConfig {
  for (const key of Object.keys(values)) {
    if (credentialKeyPattern.test(key) || viteKeyPattern.test(key)) throw new Error(`credential live config key is not allowed: ${key}`);
    if ((liveEnvKeys as readonly string[]).includes(key) && /\$\{|\$[A-Za-z_]/.test(values[key] ?? '')) throw new Error(`interpolation is forbidden for ${key}`);
  }
  const serverEnv = required(values, 'PAYMENT_LIVE_SERVER_ENV');
  if (serverEnv !== 'test' && serverEnv !== 'prod') throw new Error('invalid PAYMENT_LIVE_SERVER_ENV');
  const lane = values.PAYMENT_LIVE_LANE?.trim();
  const appVersion = values.PAYMENT_LIVE_APP_VERSION?.trim();
  const userId = parseUserId(values.PAYMENT_LIVE_USER_ID);
  const tradeDefaults = parseTradeDefaults(values.PAYMENT_LIVE_TRADE_DEFAULTS_JSON);
  const exampleCatalog = parseExampleCatalog(values);
  return {
    gatewayBaseUrl: httpsUrl(required(values, 'PAYMENT_LIVE_GATEWAY_BASE_URL'), 'PAYMENT_LIVE_GATEWAY_BASE_URL'),
    createTradeUrl: (() => {
      const value = httpsUrl(required(values, 'PAYMENT_LIVE_CREATE_TRADE_URL'), 'PAYMENT_LIVE_CREATE_TRADE_URL');
      if (new URL(value).pathname !== '/api/base/trade/create') throw new Error('invalid PAYMENT_LIVE_CREATE_TRADE_URL');
      return value;
    })(),
    productId: required(values, 'PAYMENT_LIVE_PRODUCT_ID'),
    ...(lane ? { lane } : {}),
    ...(appVersion ? { appVersion } : {}),
    serverEnv,
    ...(userId ? { userId } : {}),
    ...(tradeDefaults ? { tradeDefaults } : {}),
    ...(exampleCatalog ? { exampleCatalog } : {}),
  };
}
