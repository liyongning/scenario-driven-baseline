import { expect, test, vi } from 'vitest';
import type { RestClient } from '@daqian/template-openapi';
import { createTradeStatusPort } from './openapi';

function client(result: unknown) {
  return {
    request: vi.fn(async () => result),
  } as unknown as RestClient;
}

test('trade status adapter maps success, declared business codes and transport failures', async () => {
  const trade = { trade_no: 'T-1', status: 'SUCCEEDED', amount: 25, merchant_id: 1001 } as const;
  await expect(
    createTradeStatusPort(client({ kind: 'success', data: trade })).get('T-1'),
  ).resolves.toEqual({
    kind: 'success',
    trade,
  });
  await expect(
    createTradeStatusPort(client({ kind: 'business-failure', code: 40001 })).get('T-1'),
  ).resolves.toEqual({ kind: 'business-failure', outcome: 'invalid-request' });
  await expect(
    createTradeStatusPort(client({ kind: 'business-failure', code: 40401 })).get('T-1'),
  ).resolves.toEqual({ kind: 'business-failure', outcome: 'trade-not-found' });
  for (const result of [
    { kind: 'business-failure', code: 40901 },
    { kind: 'transport-failure', reason: 'TIMEOUT' },
  ]) {
    await expect(createTradeStatusPort(client(result)).get('T-1')).resolves.toEqual({
      kind: 'transport-failure',
    });
  }
});
