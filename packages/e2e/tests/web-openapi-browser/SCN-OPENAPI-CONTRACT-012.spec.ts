import { createTrade } from '../../../openapi/testing/engine/generated/operations.ts';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { clientFor, routesFor } from './openapi-wire.ts';

const requestIdPattern = '^\\d{8}_\\d{6}_\\d{3}_[a-z]{6}$';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-012',
    caseId: 'openapi-request-id-wire',
    fixtureCase: 'request-id-wire',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-012',
        caseKey: 'request-id-wire',
        checks: ['header-format', 'fresh-per-request', 'no-basereq-requirement'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const server = await createShadowServer({
      routes: routesFor([createTrade]),
      environmentClass: 'integration',
      scenarios: [
        {
          id: 'request-id-wire',
          routes: {
            createTrade: {
              expectedRequests: [
                { recordOnly: true, headerPatterns: { 'x-request-id': requestIdPattern } },
                { recordOnly: true, headerPatterns: { 'x-request-id': requestIdPattern } },
              ],
              steps: [
                { body: { code: 0, message: 'ok', data: trade() } },
                { body: { code: 0, message: 'ok', data: trade() } },
              ],
            },
          },
        },
      ],
    }).start();
    try {
      const client = clientFor(server.url);
      for (let index = 0; index < 2; index += 1)
        await client.request(createTrade, {
          body: { merchant_id: 1001, amount: 1, channel: 'WEB' },
        });
      const records = server.records();
      const header = (index: number) => String(records[index]?.headers['x-request-id'] ?? '');

      await checkpoint('header-format', () => {
        expect(header(0)).toMatch(new RegExp(requestIdPattern));
        expect(header(1)).toMatch(new RegExp(requestIdPattern));
        expect(records.every((record) => record.headers.request_id === undefined)).toBe(true);
        expect(server.verify()).toEqual([]);
      });
      await checkpoint('fresh-per-request', () => expect(header(0)).not.toBe(header(1)));
      await checkpoint('no-basereq-requirement', () => {
        expect(records[0]?.rawBody).toEqual({
          merchant_id: 1001,
          amount: 1,
          channel: 'WEB',
        });
        expect(records[0]?.rawBody).not.toHaveProperty('baseReq');
      });
    } finally {
      await server.close();
    }
  },
);

function trade() {
  return { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 };
}
