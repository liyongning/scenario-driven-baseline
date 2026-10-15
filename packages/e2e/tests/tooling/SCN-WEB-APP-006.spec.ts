import { readFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  createEngineeringFormRoot,
  readManifest,
  runCli,
  writeManifest,
} from './engineering-form-fixture.ts';
import { repositoryRoot } from './helpers.ts';
import {
  prepareDependencyCruiser,
  runDependencyCruiser,
  writeAndRestore,
} from './web-cli-helpers.ts';

const realRoot = { root: repositoryRoot, env: process.env, cleanup: () => {} };
const sourceRoot = 'packages/web-product/src';

function sourcePath(root: string, relative: string): string {
  return join(root, 'packages/web-product/src', relative);
}

function cruise(root: ReturnType<typeof createEngineeringFormRoot>, targets = [sourceRoot]) {
  return runDependencyCruiser(root, targets);
}

cliEvidence(
  'SCN-WEB-APP-006',
  'dependency-direction-cli',
  [
    'ui-boundary',
    'core-framework-free',
    'domain-isolation',
    'shared-boundary',
    'test-pattern-unified',
    'rules-from-manifest',
    'dependency-restorable',
  ],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    symlinkSync(
      resolve(repositoryRoot, 'packages/web/node_modules'),
      join(root.root, 'packages/web-product/node_modules'),
      'dir',
    );
    prepareDependencyCruiser(root);
    try {
      await check('ui-boundary', () => {
        writeAndRestore(
          sourcePath(root.root, 'Feature/adapters/client.ts'),
          'export const client = 1;\n',
          () => {
            writeAndRestore(
              sourcePath(root.root, 'Feature/ui/feature.ts'),
              "import { client } from '../adapters/client';\nvoid client;\n",
              () => {
                const result = cruise(root);
                context.expect(result.status, result.output).not.toBe(0);
                context.expect(result.output).toContain('ui-no-adapters-no-protocol:web-product');
                context.expect(result.output).toContain('Feature/adapters/client.ts');
              },
            );
          },
        );
      });
      await check('core-framework-free', () => {
        writeAndRestore(
          sourcePath(root.root, 'Feature/ui/feature.ts'),
          'export const feature = true;\n',
          () => {
            for (const [relative, source, target] of [
              [
                'Feature/core/view.ts',
                "import { ref } from 'vue';\nvoid ref;\n",
                'node_modules/vue/dist/vue.d.mts',
              ],
              ['Feature/ports/ui.ts', "import '../ui/feature';\n", 'Feature/ui/feature.ts'],
            ] as const)
              writeAndRestore(sourcePath(root.root, relative), source, () => {
                const result = cruise(root);
                context.expect(result.status, result.output).not.toBe(0);
                context.expect(result.output).toContain('core-no-ui-no-framework:web-product');
                context.expect(result.output).toContain(target);
              });
          },
        );
      });
      await check('domain-isolation', () => {
        writeAndRestore(
          sourcePath(root.root, 'Other/core/value.ts'),
          'export const value = 1;\n',
          () => {
            writeAndRestore(
              sourcePath(root.root, 'Feature/core/import-other.ts'),
              "import { value } from '../../Other/core/value';\nvoid value;\n",
              () => {
                const result = cruise(root);
                context.expect(result.status, result.output).not.toBe(0);
                context.expect(result.output).toContain('domain-isolation:web-product');
                context.expect(result.output).toContain('Other/core/value.ts');
              },
            );

            writeAndRestore(
              sourcePath(root.root, 'Feature/core/state.ts'),
              'export const featureState = true;\n',
              () => {
                writeAndRestore(
                  sourcePath(root.root, 'app/assembly.ts'),
                  [
                    "import '../Feature/core/state';",
                    "import '../Other/core/value';",
                    "import '../runtime/ports';",
                    "import '../shared/utils';",
                    "import '../stores/global';",
                    "import '../consumed';",
                    '',
                  ].join('\n'),
                  () => {
                    writeAndRestore(
                      sourcePath(root.root, 'runtime/ports/index.ts'),
                      'export const runtimePort = true;\n',
                      () => {
                        writeAndRestore(
                          sourcePath(root.root, 'shared/utils/index.ts'),
                          'export const sharedValue = true;\n',
                          () => {
                            const result = cruise(root);
                            context.expect(result.status, result.output).toBe(0);
                          },
                        );
                      },
                    );
                  },
                );
              },
            );
          },
        );
      });
      await check('shared-boundary', () => {
        writeAndRestore(
          sourcePath(root.root, 'shared/leak.ts'),
          "import '../stores/global';\n",
          () => {
            const result = cruise(root);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('shared-no-store-no-adapters:web-product');
          },
        );
      });
      await check('test-pattern-unified', () => {
        writeAndRestore(
          sourcePath(root.root, 'Feature/ui/feature.ts'),
          'export const feature = true;\n',
          () => {
            for (const suffix of ['spec', 'test'])
              writeAndRestore(
                sourcePath(root.root, `Feature/core/leak.${suffix}.ts`),
                "import '../ui/feature';\n",
                () => {
                  const result = cruise(root);
                  context.expect(result.status, result.output).toBe(0);
                },
              );
          },
        );
      });
      await check('rules-from-manifest', () => {
        const manifestPath = join(root.root, 'project.manifest.json');
        const original = readFileSync(manifestPath, 'utf8');
        const manifest = readManifest(root);
        const renamed = 'renamed-protocol';
        const packages = manifest.packages as Array<{ directory: string }>;
        packages.find((item) => item.directory === 'web-protocol')!.directory = renamed;
        const bindings = manifest.bindings as Array<{ protocol: string }>;
        bindings.find((item) => item.protocol === 'web-protocol')!.protocol = renamed;
        writeManifest(root, manifest);
        try {
          writeAndRestore(
            join(root.root, `packages/${renamed}/src/index.ts`),
            'export const renamedProtocol = true;\n',
            () => {
              writeAndRestore(
                sourcePath(root.root, 'Feature/ui/renamed.ts'),
                `import '../../../../${renamed}/src/index';\n`,
                () => {
                  const result = cruise(root, [sourceRoot, `packages/${renamed}/src`]);
                  context.expect(result.status, result.output).not.toBe(0);
                  context.expect(result.output).toContain('ui-no-adapters-no-protocol:web-product');
                  context.expect(result.output).toContain(`packages/${renamed}/src/index.ts`);
                },
              );
            },
          );
        } finally {
          writeManifest(root, JSON.parse(original) as Record<string, unknown>);
        }
      });
      await check('dependency-restorable', () => {
        const template = runCli(realRoot, 'scripts/check-architecture.ts');
        context.expect(template.status, template.output).toBe(0);
        const fixture = cruise(root);
        context.expect(fixture.status, fixture.output).toBe(0);
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 120_000 },
);
