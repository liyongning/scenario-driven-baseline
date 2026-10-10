/**
 * 公司规范的请求 ID：`yyyyMMdd_HHmmss_SSS_abcdef`，时间按北京时间（UTC+8）计算，
 * 末尾 6 位为随机小写字母。格式来源见协议契约 PC-05。
 */
export const REQUEST_ID_PATTERN = /^\d{8}_\d{6}_\d{3}_[a-z]{6}$/;

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const SUFFIX_LENGTH = 6;

type RandomSource = (length: number) => Uint8Array;

/**
 * 默认随机源是全平台通用的 `Math.random`（PC-05 修订）：请求 ID 只用于链路追踪，不是凭据，
 * 公司规范只规定格式；小程序宿主没有 `crypto`，因此不按平台分支，也不引入运行时依赖。
 */
function defaultRandomSource(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return bytes;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * 生成规范格式的请求 ID。`now` 与 `random` 只供单测注入时钟与随机源，
 * 不从协议包根入口导出，宿主无法覆盖。
 */
export function createRequestId(
  now: Date = new Date(),
  random: RandomSource = defaultRandomSource,
): string {
  // 先换算到北京时间再取 UTC 分量：结果与宿主时区无关。
  const beijing = new Date(now.getTime() + BEIJING_OFFSET_MS);
  const date = `${beijing.getUTCFullYear()}${pad(beijing.getUTCMonth() + 1, 2)}${pad(beijing.getUTCDate(), 2)}`;
  const clock = `${pad(beijing.getUTCHours(), 2)}${pad(beijing.getUTCMinutes(), 2)}${pad(beijing.getUTCSeconds(), 2)}`;
  const millis = pad(beijing.getUTCMilliseconds(), 3);
  const bytes = random(SUFFIX_LENGTH);
  let suffix = '';
  for (let index = 0; index < SUFFIX_LENGTH; index += 1)
    suffix += SUFFIX_ALPHABET[bytes[index]! % SUFFIX_ALPHABET.length];
  return `${date}_${clock}_${millis}_${suffix}`;
}
