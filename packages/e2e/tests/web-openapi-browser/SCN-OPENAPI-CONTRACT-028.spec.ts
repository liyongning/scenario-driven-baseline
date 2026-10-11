import { createTrade } from '@daqian/template-openapi/generated/operations';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { clientFor, routesFor } from './openapi-wire.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-028',
    caseId: 'fetch-adapter-wire',
    fixtureCase: 'fetch-adapter-wire',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-028',
        caseKey: 'fetch-adapter-wire',
        checks: ['no-replay', 'request-options'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const server = await createShadowServer({
      routes: routesFor([createTrade]),
      environmentClass: 'integration',
      scenarios: [
        {
          id: 'fetch-adapter-wire',
          routes: {
            createTrade: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
            },
          },
        },
      ],
    }).start();
    const originalFetch = globalThis.fetch;
    let options: RequestInit | undefined;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      options = init;
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      const result = await clientFor(server.url).request(createTrade, {
        body: { merchant_id: 1001, amount: 1, channel: 'WEB' },
      });
      await checkpoint('no-replay', () => {
        expect(result.kind).toBe('success');
        expect(server.records()).toHaveLength(1);
        expect(server.verify()).toEqual([]);
      });
      await checkpoint('request-options', () => {
        expect(options?.credentials).toBe('same-origin');
        expect(options?.cache).toBe('no-store');
      });
    } finally {
      globalThis.fetch = originalFetch;
      await server.close();
    }
  },
);

function trade() {
  return { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 };
}
