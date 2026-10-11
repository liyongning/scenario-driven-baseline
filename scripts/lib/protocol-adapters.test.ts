import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import {
  createAdapterFixture,
  readAdapterCalls,
  type AdapterFixture,
} from '../../packages/e2e/tests/tooling/protocol-adapter-fixture.ts';
import { loadProjectManifest } from './project-manifest.ts';
import { assertProtocolAdapter, loadProtocolAdapter } from './protocol-adapters.ts';

const fixtures: AdapterFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

async function adapterCalls() {
  const fixture = createAdapterFixture({ prefix: 'protocol-adapter-rules-' });
  fixtures.push(fixture);
  const manifest = loadProjectManifest(fixture.root);
  const adapters = {
    a: await loadProtocolAdapter(manifest, 'protocol-a', { root: fixture.root }),
    b: await loadProtocolAdapter(manifest, 'protocol-b', { root: fixture.root }),
  };
  for (const protocol of ['a', 'b'] as const) {
    adapters[protocol].resolveDeclaration({ position: `${protocol}.ts` } as never);
    adapters[protocol].deriveObligations({
      protocolSrc: `/tmp/${protocol}`,
      requiredIn: ['integration'],
      integrationOnly: ['integration'],
      issues: [],
    } as never);
    adapters[protocol].deriveObligations({
      operation: { key: `${protocol}-op` },
      protocolSrc: `/tmp/${protocol}`,
      requiredIn: [`platform-${protocol}`, 'integration'],
      integrationOnly: ['integration'],
      issues: [],
    } as never);
    adapters[protocol].responseValidator(`${protocol}-op`);
    adapters[protocol].scanCalls({ sourceFiles: [] } as never);
  }
  return { fixture, manifest, calls: readAdapterCalls(fixture) };
}

test(
  'SCN-PROTOCOL-CONTRACT-014 adapter-loading-rules',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-014',
        caseId: 'adapter-loading-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-014',
            caseKey: 'adapter-loading-rules',
            checks: ['adapter-by-binding', 'adapter-interface-required'],
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

    await check('adapter-by-binding', async () => {
      const result = await adapterCalls();
      const byProtocol = (protocol: 'a' | 'b') =>
        result.calls.filter((call) => call.protocol === protocol).map((call) => call.name);
      context
        .expect(byProtocol('a'))
        .toEqual([
          'resolveDeclaration',
          'deriveObligations',
          'deriveObligations',
          'responseValidator',
          'scanCalls',
        ]);
      context
        .expect(byProtocol('b'))
        .toEqual([
          'resolveDeclaration',
          'deriveObligations',
          'deriveObligations',
          'responseValidator',
          'scanCalls',
        ]);
      const inventory = await (
        await import('./contract-inventory.ts')
      ).buildContractInventory(result.fixture.root);
      context.expect(inventory.issues).toEqual([]);
      context
        .expect(inventory.obligations.map((item) => item.id))
        .toEqual(
          expect.arrayContaining([
            'a.error-contract#business-error#$',
            'a-op#http-route#$',
            'b.error-contract#business-error#$',
            'b-op#http-route#$',
          ]),
        );
      context
        .expect(inventory.obligations.find((item) => item.id === 'a-op#http-route#$'))
        .toEqual(expect.objectContaining({ requiredIn: ['integration', 'platform-a'] }));
      context
        .expect(inventory.obligations.find((item) => item.id === 'b-op#http-route#$'))
        .toEqual(expect.objectContaining({ requiredIn: ['integration', 'platform-b'] }));
      context.expect(result.calls.filter((call) => call.name === 'checkFixture')).toEqual([]);
    });

    await check('adapter-interface-required', async () => {
      const missingFile = createAdapterFixture({
        missingAdapter: 'b',
        prefix: 'protocol-adapter-missing-file-',
      });
      fixtures.push(missingFile);
      const manifest = loadProjectManifest(missingFile.root);
      await context
        .expect(loadProtocolAdapter(manifest, 'protocol-b', { root: missingFile.root }))
        .rejects.toThrow(/protocol-b.*testing\/adapter\.ts/);

      const missingMethod = createAdapterFixture({
        missingMethod: 'b',
        prefix: 'protocol-adapter-missing-method-',
      });
      fixtures.push(missingMethod);
      const methodManifest = loadProjectManifest(missingMethod.root);
      await context
        .expect(loadProtocolAdapter(methodManifest, 'protocol-b', { root: missingMethod.root }))
        .rejects.toThrow(/protocol-b.*scanCalls/);

      const namedAdapter = createAdapterFixture({
        namedAdapter: 'b',
        prefix: 'protocol-adapter-named-export-',
      });
      fixtures.push(namedAdapter);
      const namedManifest = loadProjectManifest(namedAdapter.root);
      await context
        .expect(loadProtocolAdapter(namedManifest, 'protocol-b', { root: namedAdapter.root }))
        .resolves.toMatchObject({ responseValidator: expect.any(Function) });

      context
        .expect(() => assertProtocolAdapter(undefined, 'protocol-b'))
        .toThrow(/protocol-b.*exports no adapter/);
      await context
        .expect(loadProtocolAdapter(methodManifest, 'product-a', { root: missingMethod.root }))
        .rejects.toThrow(/product-a is not a protocol package/);
      await context
        .expect(loadProtocolAdapter(loadProjectManifest(process.cwd()), 'protocol'))
        .resolves.toMatchObject({ responseValidator: expect.any(Function) });
    });

    context.expect(executed.sort()).toEqual(['adapter-by-binding', 'adapter-interface-required']);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);
