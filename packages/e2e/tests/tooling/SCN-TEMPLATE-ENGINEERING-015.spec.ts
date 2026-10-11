import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  createEngineeringFormRoot,
  formManifest,
  readManifest,
  runCli,
  writeInput,
  writeManifest,
} from './engineering-form-fixture.ts';
import { repositoryRoot } from './helpers.ts';
import { planCommand } from '../../../../scripts/run-by-manifest.ts';
import { validBundle, writeBundle, writeBundleBuild } from './bundle-cli-fixture.ts';

function plan(root: ReturnType<typeof createEngineeringFormRoot>) {
  return runCli(root, 'scripts/run-by-manifest.ts', ['typecheck']);
}

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-015',
  'form-typecheck-cli',
  ['typecheck-by-form', 'vue-type-error-caught'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      await check('typecheck-by-form', () => {
        const result = plan(root);
        context.expect(result.status, result.output).toBe(0);
      });

      await check('vue-type-error-caught', () => {
        const app = join(root.root, 'packages/web-product/src/AppRoot/AppRoot.vue');
        writeFileSync(app, readFileSync(app, 'utf8').replace('number = 1', "number = 'bad'"));
        const vueResult = plan(root);
        context.expect(vueResult.status).not.toBe(0);
        context.expect(vueResult.output).toContain('AppRoot.vue');

        writeFileSync(app, readFileSync(app, 'utf8').replace("number = 'bad'", 'number = 1'));
        const testFile = join(root.root, 'packages/web-product/tests/type-check.test.ts');
        writeFileSync(testFile, 'const value: number = "bad";\nexport { value };\n');
        const testResult = plan(root);
        context.expect(testResult.status).not.toBe(0);
        context.expect(testResult.output).toContain('type-check.test.ts');
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 120_000 },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-015',
  'form-artifact-release-cli',
  ['artifact-check-by-form', 'release-by-form', 'selection-not-by-name'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      await check('artifact-check-by-form', () => {
        writeBundleBuild(root.root);
        writeBundle(root.root, validBundle(root.root));
        const bundle = runCli(root, 'scripts/check-bundle.ts');
        const tree = runCli(root, 'scripts/check-component-tree.ts');
        context.expect(bundle.status, bundle.output).toBe(0);
        context.expect(bundle.json?.checked).toEqual(['packages/web-product']);
        context.expect(tree.status, tree.output).toBe(0);
        context.expect(tree.json?.checked).toEqual(['packages/web-product']);

        const manifest = readManifest(root);
        const packages = manifest.packages as Array<{ directory: string; role: string }>;
        const bindings = manifest.bindings as Array<{ product: string }>;
        manifest.packages = packages.filter((pkg) => pkg.directory !== 'web-product');
        manifest.bindings = bindings.filter((binding) => binding.product !== 'web-product');
        writeManifest(root, manifest);
        const withoutWebBundle = runCli(root, 'scripts/check-bundle.ts');
        const withoutWebTree = runCli(root, 'scripts/check-component-tree.ts');
        context.expect(withoutWebBundle.status, withoutWebBundle.output).toBe(0);
        context.expect(withoutWebBundle.json?.checked).toEqual([]);
        context.expect(withoutWebTree.status, withoutWebTree.output).toBe(0);
        context.expect(withoutWebTree.json?.checked).toEqual([]);

        const withoutSdk = formManifest();
        withoutSdk.packages = (withoutSdk.packages as Array<{ directory: string }>).filter(
          (pkg) => pkg.directory !== 'sdk-product',
        );
        withoutSdk.bindings = (withoutSdk.bindings as Array<{ product: string }>).filter(
          (binding) => binding.product !== 'sdk-product',
        );
        writeManifest(root, withoutSdk);
        const packageInput = writeInput(root, 'package-none.json', {
          sdkManifest: { name: '@sample/sdk-product', version: '0.0.0', files: ['dist'] },
          protocolManifest: { name: '@sample/sdk-protocol', version: '0.0.0', files: ['dist'] },
          sdkFiles: ['package/dist/index.js'],
          protocolFiles: ['package/dist/index.js'],
          record: { sdkVersion: '0.0.0', protocolVersion: '0.0.0' },
        });
        const packageResult = runCli(root, 'scripts/check-package.ts', ['--input', packageInput]);
        context.expect(packageResult.status, packageResult.output).toBe(0);
        context.expect(packageResult.json?.issues).toEqual([]);
        writeManifest(root, formManifest());
      });

      await check('release-by-form', () => {
        writeInput(root, 'release-sdk.json', {
          registry: 'https://registry.example/npm/',
          execution: 'local',
          tag: 'sample-sdk-v0.0.0',
          sourceRevision: 'a'.repeat(40),
          sdk: { name: '@sample/sdk-product', version: '0.0.0', changed: true },
          protocol: { name: '@sample/sdk-protocol', version: '0.0.0', changed: false },
        });
        writeInput(root, 'release-web.json', {
          registry: 'https://registry.example/npm/',
          execution: 'local',
          tag: 'sample-sdk-v0.0.0',
          sourceRevision: 'a'.repeat(40),
          sdk: { name: '@sample/web-product', version: '0.0.0', changed: true },
          protocol: { name: '@sample/web-protocol', version: '0.0.0', changed: false },
        });
        const accepted = runCli(root, 'scripts/check-release.ts', ['--input', 'release-sdk.json']);
        const rejected = runCli(root, 'scripts/check-release.ts', ['--input', 'release-web.json']);
        context.expect(accepted.status, accepted.output).toBe(0);
        context.expect(rejected.status).not.toBe(0);
        context.expect(rejected.output).toContain('does not match the current workspace');
      });

      await check('selection-not-by-name', () => {
        writeManifest(root, formManifest({ sdk: 'web-app', web: 'sdk' }));
        const bundle = runCli(root, 'scripts/check-bundle.ts');
        const tree = runCli(root, 'scripts/check-component-tree.ts');
        context.expect(bundle.json?.checked).toEqual(['packages/sdk-product']);
        context.expect(tree.json?.checked).toEqual(['packages/sdk-product']);
        writeInput(root, 'release-swapped.json', {
          registry: 'https://registry.example/npm/',
          execution: 'local',
          tag: 'sample-sdk-v0.0.0',
          sourceRevision: 'a'.repeat(40),
          sdk: { name: '@sample/web-product', version: '0.0.0', changed: true },
          protocol: { name: '@sample/web-protocol', version: '0.0.0', changed: false },
        });
        const swapped = runCli(root, 'scripts/check-release.ts', [
          '--input',
          'release-swapped.json',
        ]);
        context.expect(swapped.status, swapped.output).toBe(0);
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 120_000 },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-015',
  'form-checks-registered',
  ['checks-registered'],
  async (context, check) => {
    await check('checks-registered', () => {
      const manifest = JSON.parse(
        readFileSync(join(repositoryRoot, 'project.manifest.json'), 'utf8'),
      ) as { requiredCommands: string[] };
      const packageJson = JSON.parse(
        readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
      ) as { scripts: Record<string, string> };
      for (const command of ['check:package', 'check:bundle', 'check:component-tree']) {
        context.expect(manifest.requiredCommands).toContain(command);
        context.expect(packageJson.scripts[command]).toBeDefined();
      }
      const planned = planCommand(repositoryRoot, 'check:fast').map((step) => step.args[0]);
      for (const command of ['check:package', 'check:bundle', 'check:component-tree'])
        context.expect(planned).toContain(command);
    });
  },
);
