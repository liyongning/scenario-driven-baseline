import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import {
  cancellationAfter,
  exampleClient,
  exampleServer,
  installWx,
  type ExampleServer,
} from './example-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let restore: (() => void) | undefined;
let server: ExampleServer | undefined;
afterEach(async () => {
  restore?.();
  restore = undefined;
  await server?.close();
  server = undefined;
});

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-EXAMPLE-006',
    caseId: 'host-cancel',
    fixtureCase: 'host-cancel',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-006',
        caseKey: 'host-cancel',
        checks: ['cancel-while-waiting', 'cancel-in-flight', 'no-request-after-cancel'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    server = await exampleServer('host-cancel', {
      QueryTrade: {
        expectedRequests: [{ recordOnly: true }],
        steps: [
          {
            delayMs: 50,
            body: {
              trade: { tradeNo: 'resource-006', status: 'TRADE_STATUS_CREATED' },
              baseResp: { statusCode: '0' },
            },
          },
        ],
      },
    });
    let aborts = 0;
    restore = installWx(() => {
      aborts += 1;
    });
    let stopped = false;
    const listeners = new Set<() => void>();
    const cancellation = {
      isStopped: () => stopped,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const pending = exampleClient(server.url, {
      requestTimeoutMs: 500,
      intervalMs: 50,
      windowMs: 500,
    }).observe({ id: 'resource-006', externalRef: 'example-006' }, { cancellation });
    while (server.records().length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    stopped = true;
    for (const listener of listeners) listener();
    const result = await pending;
    await checkpoint('cancel-in-flight', () => {
      expect(result).not.toMatchObject({ end: 'window_elapsed' });
      expect(aborts).toBe(1);
    });
    await checkpoint('no-request-after-cancel', () => expect(server!.records()).toHaveLength(1));
    const waitingServer = await exampleServer('host-cancel-waiting', {
      QueryTrade: {
        expectedRequests: [{ recordOnly: true }],
        steps: [
          {
            body: {
              trade: { tradeNo: 'resource-006-waiting', status: 'TRADE_STATUS_CREATED' },
              baseResp: { statusCode: '0' },
            },
          },
        ],
      },
    });
    try {
      const waiting = await exampleClient(waitingServer.url, {
        requestTimeoutMs: 500,
        intervalMs: 100,
        windowMs: 500,
      }).observe(
        { id: 'resource-006-waiting', externalRef: 'example-006' },
        { cancellation: cancellationAfter(50) },
      );
      await checkpoint('cancel-while-waiting', () => {
        expect(waiting.end).toBe('cancelled');
        expect(waitingServer.records()).toHaveLength(1);
        expect(waitingServer.verify()).toEqual([]);
      });
    } finally {
      await waitingServer.close();
    }
  },
  { fixtureRoot },
);
