import { createTrade, getTrade } from '../../../openapi/testing/engine/generated/operations.ts';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { clientFor, routesFor } from './openapi-wire.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-011',
    caseId: 'method-wire',
    fixtureCase: 'method-wire',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-011',
        caseKey: 'method-wire',
        checks: ['method-from-meta'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const server = await createShadowServer({
      routes: routesFor([createTrade, getTrade]),
      environmentClass: 'integration',
      scenarios: [
        {
          id: 'method-wire',
          routes: {
            createTrade: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
            },
            getTrade: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
            },
          },
        },
      ],
    }).start();
    try {
      const client = clientFor(server.url);
      const created = await client.request(createTrade, {
        body: { merchant_id: 1001, amount: 1, channel: 'WEB' },
      });
      const fetched = await client.request(getTrade, { path: { trade_no: 'T-1' } });

      await checkpoint('method-from-meta', () => {
        expect(created.kind).toBe('success');
        expect(fetched.kind).toBe('success');
        expect(server.records().map((record) => record.methodName)).toEqual([
          'createTrade',
          'getTrade',
        ]);
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
