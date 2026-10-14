import { createTrade } from '../../../openapi/testing/engine/generated/operations.ts';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { clientFor, routesFor } from './openapi-wire.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-007',
    caseId: 'envelope-results-wire',
    fixtureCase: 'envelope-results-wire',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-007',
        caseKey: 'envelope-results-wire',
        checks: [
          'success-result',
          'business-failure-result',
          'http-status-result',
          'invalid-envelope-result',
          'no-throw',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const steps = [
      {
        body: {
          code: 0,
          message: 'ok',
          data: { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1 },
        },
      },
      {
        body: {
          code: 40901,
          message: 'conflict',
          data: { trade_no: 'T-1', conflict_code: 'STATE_CHANGED' },
        },
      },
      {
        status: 500,
        body: { code: 0, message: 'ok', data: {} },
        malformed: { reason: '契约未声明 500 响应 schema' },
      },
      { body: { not: 'an envelope' }, malformed: { reason: '故意构造非法信封' } },
    ];
    const server = await createShadowServer({
      routes: routesFor([createTrade]),
      environmentClass: 'integration',
      scenarios: [
        {
          id: 'envelope-results-wire',
          routes: {
            createTrade: {
              expectedRequests: steps.map(() => ({ recordOnly: true })),
              steps,
            },
          },
        },
      ],
    }).start();
    try {
      const client = clientFor(server.url);
      const results: unknown[] = [];
      let threw = false;
      for (let index = 0; index < steps.length; index += 1) {
        try {
          results.push(await client.request(createTrade, { body: { merchant_id: 1 } }));
        } catch {
          threw = true;
        }
      }

      await checkpoint('success-result', () =>
        expect(results[0]).toEqual({
          kind: 'success',
          data: { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1 },
        }),
      );
      await checkpoint('business-failure-result', () =>
        expect(results[1]).toEqual({
          kind: 'business-failure',
          code: 40901,
          message: 'conflict',
          data: { trade_no: 'T-1', conflict_code: 'STATE_CHANGED' },
        }),
      );
      await checkpoint('http-status-result', () =>
        expect(results[2]).toEqual({ kind: 'transport-failure', reason: 'HTTP_STATUS' }),
      );
      await checkpoint('invalid-envelope-result', () =>
        expect(results[3]).toEqual({ kind: 'transport-failure', reason: 'INVALID_ENVELOPE' }),
      );
      await checkpoint('no-throw', () => {
        expect(threw).toBe(false);
        expect(server.records()).toHaveLength(4);
        expect(server.verify()).toEqual([]);
      });
    } finally {
      await server.close();
    }
  },
  { timeoutMs: 30_000 },
);
