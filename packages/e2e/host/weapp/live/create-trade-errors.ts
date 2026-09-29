export const createTradeErrorCodes = {
  ErrInfraTradeCreateTradeInvalidParameter: 10100801001010n,
  ErrInfraTradeCreateTradeUnauthorized: 10100801001020n,
  ErrInfraTradeCreateTradeConflict: 10100801001040n,
  ErrInfraTradeCreateTradeUnavailable: 10100801001070n,
} as const;

const gatewayInvalidParameter = 20200002001010n;
const gatewayUnauthorized = 20200002001020n;
const gatewayNotFound = 20200002001030n;

/** 只按已核对的完整业务码分类；未知码不根据 canonical 或 retryable 推断重试。 */
export function mapCreateTradeCode(code: bigint): 'auth' | 'invalid_input' | 'conflict' | 'unavailable' {
  if (code === createTradeErrorCodes.ErrInfraTradeCreateTradeUnauthorized || code === gatewayUnauthorized) return 'auth';
  if (code === createTradeErrorCodes.ErrInfraTradeCreateTradeInvalidParameter || code === gatewayInvalidParameter) return 'invalid_input';
  if (code === createTradeErrorCodes.ErrInfraTradeCreateTradeConflict) return 'conflict';
  if (code === createTradeErrorCodes.ErrInfraTradeCreateTradeUnavailable || code === gatewayNotFound) return 'unavailable';
  return 'unavailable';
}
