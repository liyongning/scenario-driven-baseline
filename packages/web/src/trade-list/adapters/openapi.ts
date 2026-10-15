import type { RestClient } from '@daqian/template-openapi';
import { businessCodeTable } from '@daqian/template-openapi/generated/codes';
import { listTrades } from '@daqian/template-openapi/generated/operations';
import type { Trade } from '../../runtime/domain';
import type { TradeListPort } from '../ports';
import { listTradesOutcomeByCode } from './outcomes';

function failureResult(code: number | string) {
  return code === businessCodeTable.INVALID_REQUEST
    ? ({ kind: 'business-failure', outcome: listTradesOutcomeByCode.INVALID_REQUEST } as const)
    : ({ kind: 'transport-failure' } as const);
}

/** 用 OpenAPI 公共执行器实现交易列表端口。 */
export function createTradeListPort(client: RestClient): TradeListPort {
  return {
    async list(merchantId) {
      const result = await client.request<Readonly<{ items: ReadonlyArray<Trade> }>>(
        listTrades,
        { path: { merchant_id: merchantId } },
        { deadlineAtMs: Date.now() + 30_000 },
      );
      if (result.kind === 'success') return { kind: 'success', items: result.data.items };
      if (result.kind === 'business-failure') return failureResult(result.code);
      return { kind: 'transport-failure' };
    },
  };
}
