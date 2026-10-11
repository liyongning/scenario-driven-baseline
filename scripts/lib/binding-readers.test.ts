import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import {
  adapterFixtureManifest,
  createAdapterFixture,
  type AdapterFixture,
} from '../../packages/e2e/tests/tooling/protocol-adapter-fixture.ts';
import { runPackageCli } from '../check-package.ts';
import { readReleaseWorkspaceFacts } from '../check-release.ts';
import { planCommand } from '../run-by-manifest.ts';
import { buildContractInventory } from './contract-inventory.ts';
import { loadProjectManifest, type ProjectManifest } from './project-manifest.ts';

type DependencyRule = Readonly<{
  name: string;
  from: { path: string };
  to: { path: string };
}>;
type Rules = Readonly<{
  dependencyRules(manifest: ProjectManifest): ReadonlyArray<DependencyRule>;
}>;

const rules = createRequire(import.meta.url)('./dependency-rules.cjs') as Rules;
const fixtures: AdapterFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

function createFixture(options: Parameters<typeof createAdapterFixture>[0] = {}): AdapterFixture {
  const fixture = createAdapterFixture({
    ...options,
    prefix: options.prefix ?? 'binding-readers-',
  });
  fixtures.push(fixture);
  return fixture;
}

function reorderedProtocolManifest(): ReturnType<typeof adapterFixtureManifest> {
  const manifest = structuredClone(adapterFixtureManifest());
  const protocolA = manifest.packages.find((pkg) => pkg.directory === 'protocol-a')!;
  manifest.packages = [
    ...manifest.packages.filter((pkg) => pkg.directory !== 'protocol-a'),
    protocolA,
  ];
  return manifest;
}

function evidence(
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    'SCN-TEMPLATE-ENGINEERING-014 binding-readers-rules',
    {
      timeout: 30_000,
      meta: {
        scenarioCase: {
          ownerId: 'SCN-TEMPLATE-ENGINEERING-014',
          caseId: 'binding-readers-rules',
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [
            {
              id: 'SCN-TEMPLATE-ENGINEERING-014',
              caseKey: 'binding-readers-rules',
              checks,
            },
          ],
        },
      },
    },
    async (context: TestContext) => {
      const before = context.expect.getState().assertionCalls;
      const executed: string[] = [];
      await body(context, async (name, assertion) => {
        await assertion();
        executed.push(name);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

evidence(
  ['build-order', 'per-binding-readers', 'bound-dependency-only'],
  async (context, check) => {
    const fixture = createFixture();

    await check('build-order', () => {
      const build = planCommand(fixture.root, 'build').map((step) => step.args[1]);
      context
        .expect(build)
        .toEqual([
          '@sample/protocol-a',
          '@sample/protocol-b',
          '@sample/product-a',
          '@sample/product-b',
        ]);
    });

    await check('per-binding-readers', async () => {
      const inventory = await buildContractInventory(fixture.root);
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
        .expect(inventory.obligations.find((item) => item.id === 'a-op#http-route#$')?.requiredIn)
        .toEqual(['integration', 'platform-a']);
      context
        .expect(inventory.obligations.find((item) => item.id === 'b-op#http-route#$')?.requiredIn)
        .toEqual(['integration', 'platform-b']);

      const reordered = createFixture({ manifest: reorderedProtocolManifest() });
      context.expect(await readReleaseWorkspaceFacts(reordered.root)).toMatchObject({
        sdk: { name: '@sample/product-a', protocolDependency: 'workspace:*' },
        protocol: { name: '@sample/protocol-a' },
      });

      const directory = await mkdtemp(join(tmpdir(), 'binding-package-input-'));
      try {
        const input = join(directory, 'input.json');
        await writeFile(
          input,
          JSON.stringify({
            sdkManifest: {
              name: '@sample/product-a',
              version: '0.0.0',
              dependencies: { '@sample/protocol-b': '0.0.0' },
            },
            protocolManifest: { name: '@sample/protocol-a', version: '0.0.0' },
            sdkFiles: ['package/dist/index.js'],
            protocolFiles: ['package/dist/index.js'],
            record: { sdkVersion: '0.0.0', protocolVersion: '0.0.0' },
          }),
        );
        const result = await runPackageCli(['node', 'script', '--input', input], reordered.root);
        context
          .expect(result.issues.join('\n'))
          .toContain('@sample/protocol-a dependency must be exact');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    await check('bound-dependency-only', () => {
      const manifest = loadProjectManifest(fixture.root);
      const dependencyRules = rules.dependencyRules(manifest);
      const rule = (name: string) => {
        const found = dependencyRules.find((item) => item.name === name);
        if (!found) throw new Error(`missing dependency rule ${name}`);
        return found;
      };
      context
        .expect(rule('product-bound-protocol-only:product-a').to.path)
        .toBe('^packages/(?:protocol-b)/');
      context
        .expect(rule('product-bound-protocol-only:product-b').to.path)
        .toBe('^packages/(?:protocol-a)/');

      const packagePath = join(fixture.root, 'packages/product-a/package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
      packageJson.dependencies = {};
      writeFileSync(packagePath, JSON.stringify(packageJson));
      context
        .expect(() => loadProjectManifest(fixture.root))
        .toThrow(/must declare workspace dependency on @sample\/protocol-a/);
    });
  },
);
