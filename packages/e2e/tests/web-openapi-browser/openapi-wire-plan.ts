export function createTradeStep() {
  return {
    method: 'createTrade',
    input: { body: { merchant_id: 1001, amount: 1, channel: 'WEB' } },
  } as const;
}

export function trade() {
  return { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 };
}
