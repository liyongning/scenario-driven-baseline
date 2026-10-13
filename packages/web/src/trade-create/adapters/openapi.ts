import { createTrade } from '@daqian/template-openapi/generated/operations';
import type { RestClient } from '@daqian/template-openapi';
import { businessCodeName, createOutcomeForCode } from './outcomes';
import type { CreateTradePort } from '../ports';
import type { Trade } from '../../runtime/domain';

function failureResult(code: number | string) {
  const name = typeof code === 'number' ? businessCodeName(code) : undefined;
  if (name && name !== 'OK') {
    const outcome = createOutcomeForCode(name);
    return { kind: 'business-failure', outcome } as const;
  }
  return { kind: 'transport-failure' } as const;
}

/** 用 OpenAPI 公共执行器实现创建交易端口。 */
export function createTradePort(client: RestClient): CreateTradePort {
  return {
    async submit(input) {
      const result = await client.request<Trade>(
        createTrade,
        {
          body: {
            merchant_id: input.merchantId,
            amount: input.amount,
            channel: input.channel,
          },
        },
        { deadlineAtMs: Date.now() + 30_000 },
      );
      if (result.kind === 'success') return { kind: 'success', trade: result.data };
      if (result.kind === 'business-failure') return failureResult(result.code);
      return { kind: 'transport-failure' };
    },
  };
}
