import { normalizeStandardContractConventions } from '../conventions.ts';

/**
 * 引擎测试契约的协议约定；与产品侧独立，避免产品契约替换影响引擎证据。
 */
export function normalizeContractConventions(value: unknown) {
  return normalizeStandardContractConventions(value);
}
