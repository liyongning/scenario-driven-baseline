import { afterEach } from 'vitest';
import { discoverExampleRoutes } from '@template-test/protocol';
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
    ownerId: 'FLOW-TEMPLATE-EXAMPLE-001',
    caseId: 'example-normal',
    fixtureCase: 'normal',
    environment: 'integration',
    flowId: 'FLOW-TEMPLATE-EXAMPLE-001',
    flowCase: 'normal',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-011',
        caseKey: 'normal',
        checks: ['stage-order', 'reference-continuity', 'single-final-outcome'],
      },
    ],
  },
  async ({ fixture: value, checkpoint, flow, expect }) => {
    const fixture = value as {
      ownerId: string;
      externalRef: string;
      units: number;
      resourceId: string;
      states: string[];
    };
    expect(discoverExampleRoutes().map((route) => route.methodName)).toEqual([
      'CreateTrade',
      'QueryTrade',
    ]);
    server = await exampleServer('flow-example-normal', {
      CreateTrade: {
        expectedRequests: [{ recordOnly: true }],
        steps: [{ body: { tradeNo: fixture.resourceId, baseResp: { statusCode: '0' } } }],
      },
      QueryTrade: {
        expectedRequests: fixture.states.map(() => ({ recordOnly: true })),
        steps: fixture.states.map((status) => ({
          body: { trade: { tradeNo: fixture.resourceId, status }, baseResp: { statusCode: '0' } },
        })),
      },
    });
    restore = installWx();
    const client = exampleClient(server.url);
    expect(server.records()).toHaveLength(0);
    const created = await client.create({
      ownerId: fixture.ownerId,
      externalRef: fixture.externalRef,
      units: fixture.units,
    });
    expect(created).toMatchObject({
      ok: true,
      reference: { id: fixture.resourceId, externalRef: fixture.externalRef },
    });
    if (!created.ok) return;
    const outcome = await client.observe(created.reference);
    await checkpoint('stage-order', () => {
      expect(server!.records().map((record) => record.methodName)).toEqual([
        'CreateTrade',
        'QueryTrade',
        'QueryTrade',
      ]);
      expect(server!.verify()).toEqual([]);
    });
    await checkpoint('reference-continuity', () =>
      expect(
        server!
          .records()
          .slice(1)
          .map((record) => (record.rawBody as { tradeNo: string }).tradeNo),
      ).toEqual([fixture.resourceId, fixture.resourceId]),
    );
    await checkpoint('single-final-outcome', () =>
      expect(outcome).toMatchObject({ end: 'completed', lastState: 'completed' }),
    );
    await flow(fixture.resourceId, [
      'createExampleClient',
      'create',
      'CreateTrade',
      'observe',
      'QueryTrade(CREATED',
      'PAID)',
      '一次最终结果；资源引用贯通各阶段，调用顺序和次数一致，初始化时不发请求',
    ]);
  },
  { fixtureRoot },
);
