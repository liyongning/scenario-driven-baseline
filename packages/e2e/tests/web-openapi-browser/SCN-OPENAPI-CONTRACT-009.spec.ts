import { getTrade, listTrades } from '@daqian/template-openapi/generated/operations';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { clientFor, routesFor } from './openapi-wire.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-009',
    caseId: 'path-params-wire',
    fixtureCase: 'path-params-wire',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-009',
        caseKey: 'path-params-wire',
        checks: ['path-encoded', 'multi-params', 'missing-param-codec-error'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const server = await createShadowServer({
      routes: routesFor([getTrade, listTrades]),
      environmentClass: 'integration',
      scenarios: [
        {
          id: 'path-params-wire',
          routes: {
            getTrade: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
            },
            listTrades: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { code: 0, message: 'ok', data: { items: [trade()] } } }],
            },
          },
        },
      ],
    }).start();
    try {
      const client = clientFor(server.url);
      const encoded = await client.request(getTrade, { path: { trade_no: 'T/测试 1' } });
      const multiple = await client.request(listTrades, { path: { merchant_id: 1001 } });
      const beforeMissing = server.records().length;
      const missing = await client.request(getTrade, { path: {} });

      await checkpoint('path-encoded', () => {
        expect(encoded.kind).toBe('success');
        expect(server.records()[0]?.methodName).toBe('getTrade');
        expect(server.records()[0]?.path).toContain('T%2F%E6%B5%8B%E8%AF%95%201');
      });
      await checkpoint('multi-params', () => {
        expect(multiple.kind).toBe('success');
        expect(server.records()[1]?.methodName).toBe('listTrades');
        expect(server.records()[1]?.path).toBe('/api/v1/merchants/1001/trades');
      });
      await checkpoint('missing-param-codec-error', () => {
        expect(missing).toEqual({ kind: 'transport-failure', reason: 'CODEC_ERROR' });
        expect(server.records()).toHaveLength(beforeMissing);
        expect(server.verify()).toEqual([]);
      });
    } finally {
      await server.close();
    }
  },
);

function trade() {
  return { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 };
}
