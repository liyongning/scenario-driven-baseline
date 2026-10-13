import { expect, test, vi } from 'vitest';
import type { RestClient } from '@daqian/template-openapi';
import { createTradeListPort } from './openapi';

function client(result: unknown) {
  return {
    request: vi.fn(async () => result),
  } as unknown as RestClient;
}

test('trade list adapter maps success, invalid request and transport failures', async () => {
  const items = [{ trade_no: 'T-1', status: 'SUCCEEDED', amount: 25, merchant_id: 1001 }] as const;
  await expect(
    createTradeListPort(client({ kind: 'success', data: { items } })).list(1001),
  ).resolves.toEqual({
    kind: 'success',
    items,
  });
  await expect(
    createTradeListPort(client({ kind: 'business-failure', code: 40001 })).list(1001),
  ).resolves.toEqual({ kind: 'business-failure', outcome: 'invalid-request' });
  for (const result of [
    { kind: 'business-failure', code: 40401 },
    { kind: 'transport-failure', reason: 'NETWORK_ERROR' },
  ]) {
    await expect(createTradeListPort(client(result)).list(1001)).resolves.toEqual({
      kind: 'transport-failure',
    });
  }
});
