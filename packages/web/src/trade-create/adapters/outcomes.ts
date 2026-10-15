import {
  businessCodeTable,
  type BusinessCode,
  type OperationCodes,
} from '@daqian/template-openapi/generated/codes';
import type { Outcome } from '../../runtime/domain';

/** createTrade 的业务码到页面结果的穷尽映射。 */
export const createTradeOutcomeByCode = {
  AMOUNT_LIMIT_EXCEEDED: 'amount-limit-exceeded',
  INVALID_REQUEST: 'invalid-request',
  TRADE_CONFLICT: 'trade-conflict',
} as const satisfies Record<OperationCodes<'createTrade'>, Outcome>;

/** 把创建接口返回的业务码转换为页面结果。 */
export function createOutcomeForCode(code: 'OK'): 'success';
export function createOutcomeForCode(
  code: OperationCodes<'createTrade'>,
): Exclude<Outcome, 'success'>;
export function createOutcomeForCode(code: 'OK' | OperationCodes<'createTrade'>): Outcome {
  if (code === 'OK') return 'success';
  return createTradeOutcomeByCode[code];
}

/** 判断码名是否属于 createTrade 的接口码与通用码集合。 */
export function isCreateTradeCode(code: BusinessCode): code is OperationCodes<'createTrade'> {
  return code in createTradeOutcomeByCode;
}

/** 把数值业务码恢复为生成契约中的码名。 */
export function businessCodeName(value: number | string): BusinessCode | undefined {
  return (Object.entries(businessCodeTable) as Array<[BusinessCode, number]>).find(
    ([, code]) => code === value,
  )?.[0];
}
