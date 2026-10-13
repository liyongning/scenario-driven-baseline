import type { RestClient } from '@daqian/template-openapi';
import { businessCodeTable } from '@daqian/template-openapi/generated/codes';
import { getTrade } from '@daqian/template-openapi/generated/operations';
import type { Trade } from '../../runtime/domain';
import type { TradeStatusPort } from '../ports';
import { getTradeOutcomeByCode } from './outcomes';

function failureResult(code: number | string) {
  if (code === businessCodeTable.INVALID_REQUEST)
    return { kind: 'business-failure', outcome: getTradeOutcomeByCode.INVALID_REQUEST } as const;
  if (code === businessCodeTable.TRADE_NOT_FOUND)
    return { kind: 'business-failure', outcome: getTradeOutcomeByCode.TRADE_NOT_FOUND } as const;
  return { kind: 'transport-failure' } as const;
}

/** 用 OpenAPI 公共执行器实现交易状态端口。 */
export function createTradeStatusPort(client: RestClient): TradeStatusPort {
  return {
    async get(tradeNo) {
      const result = await client.request<Trade>(
        getTrade,
        { path: { trade_no: tradeNo } },
        { deadlineAtMs: Date.now() + 30_000 },
      );
      if (result.kind === 'success') return { kind: 'success', trade: result.data };
      if (result.kind === 'business-failure') return failureResult(result.code);
      return { kind: 'transport-failure' };
    },
  };
}
