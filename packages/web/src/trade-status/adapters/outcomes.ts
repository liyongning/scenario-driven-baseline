import type { OperationCodes } from '@daqian/template-openapi/generated/codes';
import type { Outcome } from '../../runtime/domain';

/** getTrade 的业务码到页面结果的穷尽映射。 */
export const getTradeOutcomeByCode = {
  INVALID_REQUEST: 'invalid-request',
  TRADE_NOT_FOUND: 'trade-not-found',
} as const satisfies Record<OperationCodes<'getTrade'>, Outcome>;
