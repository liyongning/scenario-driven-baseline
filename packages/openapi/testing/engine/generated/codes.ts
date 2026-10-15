// Generated from the registered OpenAPI contract. Do not edit by hand.

export const businessCodeTable = {
  OK: 0,
  INVALID_REQUEST: 40001,
  TRADE_NOT_FOUND: 40401,
  TRADE_CONFLICT: 40901,
  AMOUNT_LIMIT_EXCEEDED: 42201,
} as const;

export type BusinessCode = keyof typeof businessCodeTable;

const operationCodeTable = {
  createTrade: ["AMOUNT_LIMIT_EXCEEDED","INVALID_REQUEST","TRADE_CONFLICT"] as const,
  getTrade: ["INVALID_REQUEST","TRADE_NOT_FOUND"] as const,
  listTrades: ["INVALID_REQUEST"] as const,
  cancelTrade: ["INVALID_REQUEST","TRADE_CONFLICT","TRADE_NOT_FOUND"] as const,
} as const;

export type OperationCodes<Id extends keyof typeof operationCodeTable> =
  (typeof operationCodeTable)[Id][number];
