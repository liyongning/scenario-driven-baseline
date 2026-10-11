/** 公司规范的请求 ID：北京时间、毫秒与六位随机小写字母。 */
export const REQUEST_ID_PATTERN = /^\d{8}_\d{6}_\d{3}_[a-z]{6}$/;

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const SUFFIX_LENGTH = 6;

type RandomSource = (length: number) => Uint8Array;

function defaultRandomSource(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return bytes;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** 生成规范请求 ID；时钟与随机源仅供内部单测注入，不从包根入口导出。 */
export function createRequestId(
  now: Date = new Date(),
  random: RandomSource = defaultRandomSource,
): string {
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
