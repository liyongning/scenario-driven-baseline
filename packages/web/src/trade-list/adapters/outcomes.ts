import type { OperationCodes } from '@daqian/template-openapi/generated/codes';
import type { Outcome } from '../../runtime/domain';

/** listTrades 的业务码到页面结果的穷尽映射。 */
export const listTradesOutcomeByCode = {
  INVALID_REQUEST: 'invalid-request',
} as const satisfies Record<OperationCodes<'listTrades'>, Outcome>;
