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
    ownerId: 'SCN-TEMPLATE-EXAMPLE-002',
    caseId: 'create-success',
    fixtureCase: 'create-success',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-002',
        caseKey: 'create-success',
        checks: ['single-create-request', 'executor-owned-context', 'neutral-reference'],
      },
    ],
  },
  async ({ checkpoint, expect, environmentClass }) => {
    server = await exampleServer(
      'create-success',
      {
        CreateTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ body: { tradeNo: 'resource-002', baseResp: { statusCode: '0' } } }],
        },
      },
      environmentClass,
    );
    restore = installWx();
    const result = await exampleClient(server.url).create({
      ownerId: '42',
      externalRef: 'example-002',
      units: 2,
    });
    await checkpoint('single-create-request', () =>
      expect(server!.records().map((record) => record.methodName)).toEqual(['CreateTrade']),
    );
    await checkpoint('executor-owned-context', () =>
      expect(server!.records()[0]!.headers.authorization).toBe('Bearer fixture-token'),
    );
    await checkpoint('neutral-reference', () =>
      expect(result).toEqual({
        ok: true,
        reference: { id: 'resource-002', externalRef: 'example-002' },
      }),
    );
  },
  { fixtureRoot },
);
