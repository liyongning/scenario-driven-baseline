import { expect, test, vi } from 'vitest';
import type { RestClient } from '@daqian/template-openapi';
import { createTradePort } from './openapi';

function client(result: unknown) {
  const request = vi.fn(async () => result);
  return { client: { request } as unknown as RestClient, request };
}

test('create trade adapter maps success, generated business codes and transport failures', async () => {
  const trade = { trade_no: 'T-1', status: 'CREATED', amount: 25, merchant_id: 1001 } as const;
  const success = client({ kind: 'success', data: trade });
  await expect(
    createTradePort(success.client).submit({ merchantId: 1001, amount: 25, channel: 'WEB' }),
  ).resolves.toEqual({ kind: 'success', trade });
  expect(success.request).toHaveBeenCalledWith(
    expect.objectContaining({ meta: expect.objectContaining({ id: 'createTrade' }) }),
    { body: { merchant_id: 1001, amount: 25, channel: 'WEB' } },
    { deadlineAtMs: expect.any(Number) },
  );

  await expect(
    createTradePort(client({ kind: 'business-failure', code: 40001 }).client).submit({
      merchantId: 1001,
      amount: 25,
      channel: 'WEB',
    }),
  ).resolves.toEqual({ kind: 'business-failure', outcome: 'invalid-request' });
  await expect(
    createTradePort(client({ kind: 'business-failure', code: 40901 }).client).submit({
      merchantId: 1001,
      amount: 25,
      channel: 'WEB',
    }),
  ).resolves.toEqual({ kind: 'business-failure', outcome: 'trade-conflict' });
  for (const code of [0, '40001']) {
    await expect(
      createTradePort(client({ kind: 'business-failure', code }).client).submit({
        merchantId: 1001,
        amount: 25,
        channel: 'WEB',
      }),
    ).resolves.toEqual({ kind: 'transport-failure' });
  }
  await expect(
    createTradePort(client({ kind: 'transport-failure', reason: 'HTTP_STATUS' }).client).submit({
      merchantId: 1001,
      amount: 25,
      channel: 'WEB',
    }),
  ).resolves.toEqual({ kind: 'transport-failure' });
});
