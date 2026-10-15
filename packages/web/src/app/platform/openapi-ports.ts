import type { RestClient } from '@daqian/template-openapi';
import { createTradePort } from '../../trade-create/adapters/openapi';
import { createTradeListPort } from '../../trade-list/adapters/openapi';
import { createTradeStatusPort } from '../../trade-status/adapters/openapi';

/** 在唯一装配点把 OpenAPI 执行器转换成三个页面端口。 */
export function createOpenApiPorts(client: RestClient) {
  return {
    createTrade: createTradePort(client),
    getTrade: createTradeStatusPort(client),
    listTrades: createTradeListPort(client),
  } as const;
}
