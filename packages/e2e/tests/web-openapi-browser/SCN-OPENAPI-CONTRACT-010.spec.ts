import {
  cancelTrade,
  getTrade,
  listTrades,
} from '../../../openapi/testing/engine/generated/operations.ts';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { clientFor, operatorIdentity, routesFor } from './openapi-wire.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-010',
    caseId: 'identity-wire',
    fixtureCase: 'identity-wire',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-010',
        caseKey: 'identity-wire',
        checks: [
          'header-name-from-scheme',
          'anonymous-no-identity',
          'empty-token-rejected',
          'scheme-mismatch-rejected',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const server = await createShadowServer({
      routes: routesFor([getTrade, cancelTrade, listTrades]),
      environmentClass: 'integration',
      scenarios: [
        {
          id: 'identity-wire',
          routes: {
            getTrade: {
              expectedRequests: [
                { recordOnly: true, headers: { 'x-access-token': 'fixture-token' } },
              ],
              steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
            },
            cancelTrade: {
              expectedRequests: [
                { recordOnly: true, headers: { 'x-operator-token': 'operator-token' } },
              ],
              steps: [{ body: { code: 0, message: 'ok', data: {} } }],
            },
            listTrades: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { code: 0, message: 'ok', data: { items: [] } } }],
            },
          },
        },
      ],
    }).start();
    try {
      const access = clientFor(server.url);
      const operator = clientFor(server.url, { identity: operatorIdentity });
      const anonymous = clientFor(server.url, { identity: null });
      await access.request(getTrade, { path: { trade_no: 'T-1' } });
      await operator.request(cancelTrade, { path: { trade_no: 'T-1' }, body: {} });
      await anonymous.request(listTrades, { path: { merchant_id: 1001 } });

      await checkpoint('header-name-from-scheme', () => {
        expect(server.records()[0]?.headers['x-access-token']).toBe('fixture-token');
        expect(server.records()[1]?.headers['x-operator-token']).toBe('operator-token');
      });
      await checkpoint('anonymous-no-identity', () => {
        const headers = server.records()[2]?.headers ?? {};
        expect(headers['x-access-token']).toBeUndefined();
        expect(headers['x-operator-token']).toBeUndefined();
      });
      await checkpoint('empty-token-rejected', async () => {
        const before = server.records().length;
        expect(
          await clientFor(server.url, { identity: null }).request(getTrade, {
            path: { trade_no: 'T-1' },
          }),
        ).toEqual({
          kind: 'transport-failure',
          reason: 'EMPTY_ACCESS_TOKEN',
        });
        expect(
          await clientFor(server.url, {
            identity: { scheme: 'accessToken', token: ' ' },
          }).request(getTrade, { path: { trade_no: 'T-1' } }),
        ).toEqual({ kind: 'transport-failure', reason: 'EMPTY_ACCESS_TOKEN' });
        expect(server.records()).toHaveLength(before);
      });
      await checkpoint('scheme-mismatch-rejected', async () => {
        const before = server.records().length;
        expect(await operator.request(getTrade, { path: { trade_no: 'T-1' } })).toEqual({
          kind: 'transport-failure',
          reason: 'HOST_CONTEXT_ERROR',
        });
        expect(server.records()).toHaveLength(before);
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
