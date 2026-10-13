import type { Cancellation, RestClient } from '@daqian/template-openapi';
import { businessCodeTable } from '@daqian/template-openapi/generated/codes';
import { getTrade } from '@daqian/template-openapi/generated/operations';
import type { Trade } from '../../runtime/domain';
import type { CancellationSignal } from '../../runtime/ports';
import type { TradeStatusPort } from '../ports';
import { getTradeOutcomeByCode } from './outcomes';

function failureResult(code: number | string) {
  if (code === businessCodeTable.INVALID_REQUEST)
    return { kind: 'business-failure', outcome: getTradeOutcomeByCode.INVALID_REQUEST } as const;
  if (code === businessCodeTable.TRADE_NOT_FOUND)
    return { kind: 'business-failure', outcome: getTradeOutcomeByCode.TRADE_NOT_FOUND } as const;
  return { kind: 'transport-failure' } as const;
}

function cancellationFrom(signal: CancellationSignal): Cancellation {
  return {
    isStopped: () => signal.aborted,
    subscribe(listener) {
      signal.addEventListener('abort', listener);
      return () => signal.removeEventListener('abort', listener);
    },
  };
}

/** 用 OpenAPI 公共执行器实现交易状态端口。 */
export function createTradeStatusPort(client: RestClient): TradeStatusPort {
  return {
    async get(tradeNo, signal) {
      const result = await client.request<Trade>(
        getTrade,
        { path: { trade_no: tradeNo } },
        { deadlineAtMs: Date.now() + 30_000, cancellation: cancellationFrom(signal) },
      );
      if (result.kind === 'success') return { kind: 'success', trade: result.data };
      if (result.kind === 'business-failure') return failureResult(result.code);
      return { kind: 'transport-failure' };
    },
  };
}
