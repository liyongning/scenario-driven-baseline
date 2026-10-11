import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import {
  exampleInventoryRoot,
  repositoryRoot,
} from '../../packages/e2e/tests/tooling/contract-inventory-fixture.ts';
import { buildContractInventory } from './contract-inventory.ts';
import { loadProjectManifest } from './project-manifest.ts';
import { loadProtocolAdapter } from './protocol-adapters.ts';

const expectedObligations = {
  count: 177,
  digest: '46417e0f18bb012791eca67959ed6d4bab2ca0711ff952966f5f4a0f34638eca',
};

function normalizedObligations(
  obligations: ReadonlyArray<Readonly<{ id: string; cases: string[]; requiredIn: string[] }>>,
) {
  return obligations
    .map(({ id, cases, requiredIn }) => ({ id, cases, requiredIn }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

test(
  'SCN-PROTOCOL-CONTRACT-015 idl-adapter-regression',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-015',
        caseId: 'idl-adapter-regression',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-015',
            caseKey: 'idl-adapter-regression',
            checks: [
              'obligations-unchanged',
              'declaration-unchanged',
              'scan-unchanged',
              'idl-fixture-noop',
            ],
          },
        ],
      },
    },
  },
  async (context: TestContext) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };
    const root = exampleInventoryRoot('idl-adapter-regression-');
    try {
      const inventory = await buildContractInventory(root.root);
      const adapter = await loadProtocolAdapter(loadProjectManifest(repositoryRoot), 'protocol', {
        root: repositoryRoot,
      });

      await check('obligations-unchanged', () => {
        const normalized = normalizedObligations(inventory.obligations);
        context.expect(normalized).toHaveLength(expectedObligations.count);
        context
          .expect(createHash('sha256').update(JSON.stringify(normalized)).digest('hex'))
          .toBe(expectedObligations.digest);
        context
          .expect(normalized.find((item) => item.id === 'infra.trade.v1.CreateTrade#http-route#$'))
          .toEqual({
            id: 'infra.trade.v1.CreateTrade#http-route#$',
            cases: ['CreateTrade'],
            requiredIn: ['integration', 'weapp'],
          });
      });

      await check('declaration-unchanged', () => {
        context.expect(inventory.issues).toEqual([]);
        context.expect(inventory.methods).toEqual([
          { name: 'CreateTrade', method: 'POST', path: '/api/base/trade/create' },
          { name: 'QueryTrade', method: 'POST', path: '/api/base/trade/query' },
        ]);
        context
          .expect(
            inventory.obligations.every(
              (item) =>
                item.id.startsWith('infra.trade.v1.') || item.id.startsWith('idl.error-contract'),
            ),
          )
          .toBe(true);
      });

      await check('scan-unchanged', () => {
        const caller = readFileSync(`${root.root}/packages/sdk/src/caller.ts`, 'utf8');
        context.expect(caller).toContain('protocol.request(CreateTrade.meta');
        context.expect(caller).toContain('protocol.request(QueryTrade');
        context.expect(inventory.issues.filter((item) => item.includes('调用'))).toEqual([]);
      });

      await check('idl-fixture-noop', async () => {
        context.expect(await adapter.checkFixture({}, {})).toEqual([]);
      });
    } finally {
      root.cleanup();
    }
    context
      .expect(executed.sort())
      .toEqual([
        'declaration-unchanged',
        'idl-fixture-noop',
        'obligations-unchanged',
        'scan-unchanged',
      ]);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);
