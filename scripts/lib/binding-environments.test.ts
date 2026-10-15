import { afterEach, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import {
  adapterFixtureManifest,
  createAdapterFixture,
  type AdapterFixture,
} from '../../packages/e2e/tests/tooling/protocol-adapter-fixture.ts';
import { buildContractInventory } from './contract-inventory.ts';

const fixtures: AdapterFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

test(
  'SCN-SCENARIO-GATE-027 binding-environment-rules',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-SCENARIO-GATE-027',
        caseId: 'binding-environment-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-SCENARIO-GATE-027',
            caseKey: 'binding-environment-rules',
            checks: ['environments-by-binding', 'no-cross-binding-requirement', 'empty-platforms'],
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

    const fixture = createAdapterFixture({ prefix: 'binding-environments-' });
    fixtures.push(fixture);
    const inventory = await buildContractInventory(fixture.root);
    const obligation = (id: string) => inventory.obligations.find((item) => item.id === id);

    await check('environments-by-binding', () => {
      context
        .expect(obligation('a-op#http-route#$')?.requiredIn)
        .toEqual(['integration', 'platform-a']);
      context
        .expect(obligation('b-op#http-route#$')?.requiredIn)
        .toEqual(['integration', 'platform-b']);
      context
        .expect(obligation('a.error-contract#business-error#$')?.requiredIn)
        .toEqual(['integration']);
      context
        .expect(obligation('b.error-contract#business-error#$')?.requiredIn)
        .toEqual(['integration']);
    });

    await check('no-cross-binding-requirement', () => {
      context
        .expect(
          inventory.obligations
            .filter((item) => item.id.startsWith('a'))
            .flatMap((item) => item.requiredIn),
        )
        .not.toContain('platform-b');
      context
        .expect(
          inventory.obligations
            .filter((item) => item.id.startsWith('b'))
            .flatMap((item) => item.requiredIn),
        )
        .not.toContain('platform-a');
    });

    await check('empty-platforms', async () => {
      const manifest = structuredClone(adapterFixtureManifest());
      manifest.bindings.find((binding) => binding.name === 'binding-b')!.platforms = [];
      const empty = createAdapterFixture({
        manifest,
        prefix: 'binding-environments-empty-',
      });
      fixtures.push(empty);
      const emptyInventory = await buildContractInventory(empty.root);
      context
        .expect(
          emptyInventory.obligations.find((item) => item.id === 'b-op#http-route#$')?.requiredIn,
        )
        .toEqual(['integration']);
      context
        .expect(
          emptyInventory.obligations.find((item) => item.id === 'b.error-contract#business-error#$')
            ?.requiredIn,
        )
        .toEqual(['integration']);
    });

    context
      .expect(executed.sort())
      .toEqual(['empty-platforms', 'environments-by-binding', 'no-cross-binding-requirement']);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);
