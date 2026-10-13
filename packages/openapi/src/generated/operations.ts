// Generated from the registered OpenAPI contract. Do not edit by hand.

export const createTrade = {
  meta: {
    id: "createTrade",
    method: "post",
    path: "/api/v1/trades",
    security: [{"accessToken":[]}] as const,
    codes: ["INVALID_REQUEST","TRADE_CONFLICT","TRADE_NOT_FOUND"] as const,
    implemented: true,
  },
} as const;

export const getTrade = {
  meta: {
    id: "getTrade",
    method: "get",
    path: "/api/v1/trades/{trade_no}",
    security: [{"accessToken":[]}] as const,
    codes: ["INVALID_REQUEST","TRADE_NOT_FOUND"] as const,
    implemented: true,
  },
} as const;

export const listTrades = {
  meta: {
    id: "listTrades",
    method: "get",
    path: "/api/v1/merchants/{merchant_id}/trades",
    security: [] as const,
    codes: ["INVALID_REQUEST"] as const,
    implemented: true,
  },
} as const;

export const cancelTrade = {
  meta: {
    id: "cancelTrade",
    method: "post",
    path: "/api/v1/trades/{trade_no}/cancel",
    security: [{"operatorToken":[]}] as const,
    codes: ["INVALID_REQUEST","TRADE_CONFLICT","TRADE_NOT_FOUND"] as const,
    implemented: false,
  },
} as const;
