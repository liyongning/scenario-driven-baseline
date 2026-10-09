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
const responses = (id: string, states: string[]) => ({
  QueryTrade: {
    expectedRequests: states.map(() => ({ recordOnly: true })),
    steps: states.map((status) => ({
      body: { trade: { tradeNo: id, status }, baseResp: { statusCode: '0' } },
    })),
  },
});

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-EXAMPLE-004',
    caseId: 'observe-completed',
    fixtureCase: 'observe-completed',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-004',
        caseKey: 'observe-completed',
        checks: ['terminal-mapped', 'stop-after-terminal', 'single-outcome'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    server = await exampleServer(
      'observe-completed',
      responses('resource-004', ['TRADE_STATUS_CREATED', 'TRADE_STATUS_PAID']),
    );
    restore = installWx();
    const result = await exampleClient(server.url).observe({
      id: 'resource-004',
      externalRef: 'example-004',
    });
    await checkpoint('terminal-mapped', () =>
      expect(result).toMatchObject({ end: 'completed', lastState: 'completed' }),
    );
    await checkpoint('stop-after-terminal', () => expect(server!.records()).toHaveLength(2));
    await checkpoint('single-outcome', () => expect(result).toBeTruthy());
  },
  { fixtureRoot },
);

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-EXAMPLE-004',
    caseId: 'observe-closed',
    fixtureCase: 'observe-closed',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-004',
        caseKey: 'observe-closed',
        checks: ['terminal-mapped', 'stop-after-terminal', 'single-outcome'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    server = await exampleServer(
      'observe-closed',
      responses('resource-004-closed', ['TRADE_STATUS_CLOSED']),
    );
    restore = installWx();
    const result = await exampleClient(server.url).observe({
      id: 'resource-004-closed',
      externalRef: 'example-004',
    });
    await checkpoint('terminal-mapped', () =>
      expect(result).toMatchObject({ end: 'closed', lastState: 'closed' }),
    );
    await checkpoint('stop-after-terminal', () => expect(server!.records()).toHaveLength(1));
    await checkpoint('single-outcome', () => expect(result).toBeTruthy());
  },
  { fixtureRoot },
);
