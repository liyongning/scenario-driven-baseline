export interface paths {
    "/api/v1/trades": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a trade
         * @description Creates one trade and returns its initial state.
         */
        post: operations["createTrade"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/trades/{trade_no}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a trade
         * @description Returns a trade for polling until a terminal state is reached.
         */
        get: operations["getTrade"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/merchants/{merchant_id}/trades": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List merchant trades
         * @description Lists trades for one merchant without identity headers.
         */
        get: operations["listTrades"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/trades/{trade_no}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel a trade
         * @description Cancels a trade with an operator identity; the template marks it unimplemented.
         */
        post: operations["cancelTrade"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Envelope: {
            /** @enum {integer} */
            code: 0 | 40001 | 40401 | 40901;
            message: string;
        } & {
            data: (components["schemas"]["Trade"] | components["schemas"]["TradeConflictData"] | components["schemas"]["TradeList"] | components["schemas"]["EmptyData"]) | null;
        };
        CreateTradeRequest: {
            /** Format: int64 */
            merchant_id: number;
            amount: number;
            /** @enum {string} */
            channel: "WEB" | "APP";
        };
        Trade: {
            trade_no: string;
            /** @enum {string} */
            status: "CREATED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
            amount: number;
            /** Format: int64 */
            merchant_id: number;
            failure_reason?: string | null;
        };
        TradeConflictData: {
            trade_no: string;
            /** @enum {string} */
            conflict_code: "DUPLICATE_REQUEST" | "STATE_CHANGED";
        };
        TradeList: {
            items: components["schemas"]["Trade"][];
        };
        EmptyData: Record<string, never>;
    };
    responses: never;
    parameters: {
        /** @description Stable trade number. */
        TradeNo: string;
        /** @description Integer merchant identifier. */
        MerchantId: number;
        /** @description Standard request correlation identifier. */
        XRequestId: string;
    };
    requestBodies: never;
    headers: {
        /** @description Echoed request correlation identifier. */
        XRequestId: string;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createTrade: {
        parameters: {
            query?: never;
            header: {
                /** @description Standard request correlation identifier. */
                "X-Request-Id": components["parameters"]["XRequestId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateTradeRequest"];
            };
        };
        responses: {
            /** @description Create result envelope. */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["XRequestId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope"];
                };
            };
        };
    };
    getTrade: {
        parameters: {
            query?: never;
            header: {
                /** @description Standard request correlation identifier. */
                "X-Request-Id": components["parameters"]["XRequestId"];
            };
            path: {
                /** @description Stable trade number. */
                trade_no: components["parameters"]["TradeNo"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trade result envelope. */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["XRequestId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope"];
                };
            };
        };
    };
    listTrades: {
        parameters: {
            query?: {
                /** @description Maximum number of trades to return. */
                limit?: number;
            };
            header: {
                /** @description Standard request correlation identifier. */
                "X-Request-Id": components["parameters"]["XRequestId"];
            };
            path: {
                /** @description Integer merchant identifier. */
                merchant_id: components["parameters"]["MerchantId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trade list envelope. */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["XRequestId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope"];
                };
            };
        };
    };
    cancelTrade: {
        parameters: {
            query?: never;
            header: {
                /** @description Standard request correlation identifier. */
                "X-Request-Id": components["parameters"]["XRequestId"];
            };
            path: {
                /** @description Stable trade number. */
                trade_no: components["parameters"]["TradeNo"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cancellation result envelope. */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["XRequestId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope"];
                };
            };
        };
    };
}
