import { createFetchHttp } from '@daqian/template-openapi';
import type { Cancellation, HttpPort, RestResult } from '@daqian/template-openapi';
import { createTrade } from '@daqian/template-openapi/generated/operations';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { clientFor, routesFor } from './openapi-wire.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-014',
    caseId: 'transport-failure-wire',
    fixtureCase: 'transport-failure-wire',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-014',
        caseKey: 'transport-failure-wire',
        checks: ['network-error', 'timeout', 'cancelled', 'single-delivery'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const server = await createShadowServer({
      routes: routesFor([createTrade]),
      environmentClass: 'integration',
      scenarios: [
        {
          id: 'transport-failure-wire',
          routes: {
            createTrade: {
              expectedRequests: [{ recordOnly: true }, { recordOnly: true }, { recordOnly: true }],
              steps: [
                { disconnect: true },
                { delayMs: 150, body: { code: 0, message: 'late', data: trade() } },
                { delayMs: 150, body: { code: 0, message: 'late', data: trade() } },
              ],
            },
          },
        },
      ],
    }).start();
    try {
      const cancellation = cancellationSource();
      let cancelNext = false;
      const realHttp = createFetchHttp();
      const http: HttpPort = {
        send(request) {
          const pending = realHttp.send({
            ...request,
            ...(request.cancellation ? {} : { cancellation: cancellation.cancellation }),
          });
          if (cancelNext) {
            cancelNext = false;
            const stopAfterArrival = () => {
              if (server.records().length >= 3) cancellation.stop();
              else setTimeout(stopAfterArrival, 1);
            };
            queueMicrotask(stopAfterArrival);
          }
          return pending;
        },
      };
      const client = clientFor(server.url, { http });
      const request = { body: { merchant_id: 1001, amount: 1, channel: 'WEB' as const } };
      const results: RestResult[] = [];
      results.push(
        await client.request(createTrade, request, { deadlineAtMs: Date.now() + 1_000 }),
      );
      results.push(await client.request(createTrade, request, { deadlineAtMs: Date.now() + 25 }));
      cancelNext = true;
      results.push(
        await client.request(createTrade, request, {
          deadlineAtMs: Date.now() + 1_000,
          cancellation: cancellation.cancellation,
        }),
      );

      await checkpoint('network-error', () => expect(results[0]).toEqual(failure('NETWORK_ERROR')));
      await checkpoint('timeout', () => expect(results[1]).toEqual(failure('TIMEOUT')));
      await checkpoint('cancelled', () => expect(results[2]).toEqual(failure('CANCELLED')));
      await checkpoint('single-delivery', () => {
        expect(results).toHaveLength(3);
        expect(server.records()).toHaveLength(3);
        expect(server.verify()).toEqual([]);
      });
    } finally {
      await server.close();
    }
  },
  { timeoutMs: 30_000 },
);

function failure(reason: 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELLED') {
  return { kind: 'transport-failure', reason };
}

function cancellationSource() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const cancellation: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    cancellation,
    stop() {
      stopped = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

function trade() {
  return { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 };
}
