import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import {
  createEngineeringFormRoot,
  formManifest,
  writeInput,
} from '../packages/e2e/tests/tooling/engineering-form-fixture.ts';
import { checkBundle } from './check-bundle.ts';
import { checkComponentTree } from './check-component-tree.ts';
import { runPackageCli } from './check-package.ts';
import { readReleaseWorkspaceFacts } from './check-release.ts';
import { planCommand } from './run-by-manifest.ts';

function writeSwappedForms(root: ReturnType<typeof createEngineeringFormRoot>): void {
  writeFileSync(
    join(root.root, 'project.manifest.json'),
    JSON.stringify(formManifest({ sdk: 'web-app', web: 'sdk' }), null, 2),
  );
}

function writeManifestWithoutSdk(root: ReturnType<typeof createEngineeringFormRoot>): void {
  const manifest = formManifest();
  const packages = manifest.packages as Array<Record<string, unknown>>;
  const withoutSdk = packages.filter((item) => item.form !== 'sdk');
  const removed = new Set(
    packages.filter((item) => item.form === 'sdk').map((item) => item.directory),
  );
  manifest.packages = withoutSdk;
  manifest.bindings = (manifest.bindings as Array<Record<string, unknown>>).filter(
    (item) => !removed.has(item.product),
  );
  writeFileSync(join(root.root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
}

test(
  'SCN-TEMPLATE-ENGINEERING-015 form-selection-rules',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-ENGINEERING-015',
        caseId: 'form-selection-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-TEMPLATE-ENGINEERING-015',
            caseKey: 'form-selection-rules',
            checks: [
              'typecheck-by-form',
              'artifact-check-by-form',
              'release-by-form',
              'selection-not-by-name',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const root = createEngineeringFormRoot();
    try {
      const before = planCommand(root.root, 'typecheck');
      context.expect(before).toContainEqual({
        command: 'tsc',
        args: ['-p', 'packages/sdk-product/tsconfig.build.json', '--noEmit'],
      });
      context.expect(before).toContainEqual({
        command: 'vue-tsc',
        args: [
          '--build',
          'packages/web-product/tsconfig.app.json',
          'packages/web-product/tsconfig.core.json',
          'packages/web-product/tsconfig.vitest.json',
        ],
      });

      const packageInput = writeInput(root, 'package-input.json', {
        sdkManifest: {
          name: '@sample/sdk-product',
          version: '0.0.0',
          files: ['dist'],
          dependencies: { '@sample/sdk-protocol': '0.0.0' },
        },
        protocolManifest: { name: '@sample/sdk-protocol', version: '0.0.0', files: ['dist'] },
        sdkFiles: ['package/dist/index.js'],
        protocolFiles: ['package/dist/index.js'],
        record: { sdkVersion: '0.0.0', protocolVersion: '0.0.0' },
      });
      context
        .expect((await runPackageCli(['--input', packageInput], root.root)).issues)
        .toEqual([]);
      context.expect(await readReleaseWorkspaceFacts(root.root)).toMatchObject({
        sdk: { name: '@sample/sdk-product' },
        protocol: { name: '@sample/sdk-protocol' },
      });
      context.expect(checkBundle(root.root)).toEqual({
        checked: ['packages/web-product'],
        issues: [],
      });
      context.expect(checkComponentTree(root.root)).toEqual({
        checked: ['packages/web-product'],
        issues: [],
      });

      writeSwappedForms(root);
      const after = planCommand(root.root, 'typecheck');
      context.expect(after).toContainEqual({
        command: 'tsc',
        args: ['-p', 'packages/web-product/tsconfig.build.json', '--noEmit'],
      });
      context.expect(after).toContainEqual({
        command: 'vue-tsc',
        args: [
          '--build',
          'packages/sdk-product/tsconfig.app.json',
          'packages/sdk-product/tsconfig.core.json',
          'packages/sdk-product/tsconfig.vitest.json',
        ],
      });
      context.expect(await readReleaseWorkspaceFacts(root.root)).toMatchObject({
        sdk: { name: '@sample/web-product' },
        protocol: { name: '@sample/web-protocol' },
      });
      context.expect(checkBundle(root.root)).toEqual({
        checked: ['packages/sdk-product'],
        issues: [],
      });
      context.expect(checkComponentTree(root.root)).toEqual({
        checked: ['packages/sdk-product'],
        issues: [],
      });

      writeManifestWithoutSdk(root);
      context.expect(await runPackageCli([], root.root)).toEqual({
        commands: [],
        sdkVersion: undefined,
        protocolVersion: undefined,
        issues: [],
        exitCode: 0,
      });
    } finally {
      root.cleanup();
    }
  },
);
