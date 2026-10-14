import { normalizeStandardContractConventions } from '../testing/conventions.ts';

/**
 * 产品契约的默认协议约定；替换产品契约时连同本模块与同目录单测一起替换。
 */
export function normalizeContractConventions(value: unknown) {
  return normalizeStandardContractConventions(value);
}
