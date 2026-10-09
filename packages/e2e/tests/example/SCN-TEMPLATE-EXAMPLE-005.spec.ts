import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { exampleClient, exampleServer, installWx, type ExampleServer } from './example-harness.ts';

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
    ownerId: 'SCN-TEMPLATE-EXAMPLE-005',
    caseId: 'window-and-timeout',
    fixtureCase: 'window-and-timeout',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-005',
        caseKey: 'window-and-timeout',
        checks: ['request-timeout-local', 'window-elapsed', 'no-request-after-end'],
      },
    ],
  },
  async ({ checkpoint, expect, environmentClass }) => {
    const pending = {
      body: {
        trade: { tradeNo: 'resource-005', status: 'TRADE_STATUS_CREATED' },
        baseResp: { statusCode: '0' },
      },
    };
    server = await exampleServer(
      'window-and-timeout',
      {
        QueryTrade: {
          expectedRequests: Array.from({ length: 10 }, () => ({ recordOnly: true })),
          steps: [{ ...pending, delayMs: 100 }, ...Array.from({ length: 9 }, () => pending)],
        },
      },
      environmentClass,
    );
    restore = installWx();
    const result = await exampleClient(server.url, {
      requestTimeoutMs: 50,
      intervalMs: 30,
      windowMs: 140,
    }).observe({ id: 'resource-005', externalRef: 'example-005' });
    await checkpoint('request-timeout-local', () =>
      expect(server!.records().length).toBeGreaterThanOrEqual(2),
    );
    await checkpoint('window-elapsed', () =>
      expect(result).toMatchObject({ end: 'window_elapsed' }),
    );
    const count = server.records().length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    await checkpoint('no-request-after-end', () => expect(server!.records()).toHaveLength(count));
  },
  { fixtureRoot },
);
