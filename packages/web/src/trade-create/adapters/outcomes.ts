import {
  businessCodeTable,
  type BusinessCode,
  type OperationCodes,
} from '@daqian/template-openapi/generated/codes';
import type { Outcome } from '../../runtime/domain';

/** createTrade 的业务码到页面结果的穷尽映射。 */
export const createTradeOutcomeByCode = {
  INVALID_REQUEST: 'invalid-request',
  TRADE_CONFLICT: 'trade-conflict',
  TRADE_NOT_FOUND: 'trade-not-found',
} as const satisfies Record<OperationCodes<'createTrade'>, Outcome>;

/** 把创建接口返回的业务码转换为页面结果。 */
export function createOutcomeForCode(code: 'OK'): 'success';
export function createOutcomeForCode(
  code: Exclude<BusinessCode, 'OK'>,
): Exclude<Outcome, 'success'>;
export function createOutcomeForCode(code: BusinessCode): Outcome {
  if (code === 'OK') return 'success';
  if (code === 'INVALID_REQUEST') return createTradeOutcomeByCode.INVALID_REQUEST;
  if (code === 'TRADE_CONFLICT') return createTradeOutcomeByCode.TRADE_CONFLICT;
  return createTradeOutcomeByCode.TRADE_NOT_FOUND;
}

/** 把数值业务码恢复为生成契约中的码名。 */
export function businessCodeName(value: number | string): BusinessCode | undefined {
  return (Object.entries(businessCodeTable) as Array<[BusinessCode, number]>).find(
    ([, code]) => code === value,
  )?.[0];
}
