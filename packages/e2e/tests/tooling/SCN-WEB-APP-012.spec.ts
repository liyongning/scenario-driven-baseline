import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectFiles } from '../../../../scripts/lib/fingerprints.ts';
import { bundleManifestPath } from '../../../../scripts/lib/bundle-manifest.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createBuildCopy, repositoryRoot } from './repository-copy.ts';
import { createEngineeringFormRoot } from './engineering-form-fixture.ts';
import {
  bundleProductDirectory,
  runBundleBuild,
  runBundleCli,
  validBundle,
  writeBundle,
  writeBundleBuild,
} from './bundle-cli-fixture.ts';

cliEvidence(
  'SCN-WEB-APP-012',
  'bundle-manifest-cli',
  [
    'manifest-outside-dist',
    'modules-reconciled',
    'entry-and-relative-assets',
    'bundle-violation-located',
    'bundle-restorable',
  ],
  async (context, check) => {
    const copy = createBuildCopy({ prefix: 'bundle-manifest-cli-' });
    const root = createEngineeringFormRoot();
    try {
      const copyManifest = loadProjectManifest(copy.root);
      const templateProduct = copyManifest.packages.find(
        (item) =>
          item.form === 'web-app' &&
          existsSync(join(repositoryRoot, 'packages', item.directory, 'index.html')),
      )!;
      const binding = copyManifest.bindings.find(
        (item) => item.product === templateProduct.directory,
      )!;
      const protocol = copyManifest.packages.find((item) => item.directory === binding.protocol)!;
      const test = copyManifest.packages.find((item) => item.role === 'test')!;
      writeFileSync(
        join(copy.root, 'project.manifest.json'),
        JSON.stringify(
          {
            ...copyManifest,
            packages: [templateProduct, protocol, test],
            bindings: [binding],
          },
          null,
          2,
        ),
      );
      await check('manifest-outside-dist', () => {
        cpSync(
          join(repositoryRoot, 'packages', templateProduct.directory, 'index.html'),
          join(copy.root, 'packages', templateProduct.directory, 'index.html'),
        );
        runBundleBuild(copy, templateProduct.directory);
        const manifestPath = bundleManifestPath(copy.root, templateProduct.directory);
        context.expect(existsSync(manifestPath)).toBe(true);
        const dist = join(copy.root, 'packages', templateProduct.directory, 'dist');
        context.expect(existsSync(join(dist, 'bundle-manifest.json'))).toBe(false);
        for (const file of collectFiles(dist, () => true))
          context
            .expect(readFileSync(file, 'utf8'))
            .not.toContain(`packages/${bundleProductDirectory}/src/`);
      });

      writeBundleBuild(root.root);
      const valid = validBundle(root.root);
      writeBundle(root.root, valid);

      await check('modules-reconciled', () => {
        writeBundle(root.root, { ...valid, modules: [] });
        const empty = runBundleCli(root);
        context.expect(empty.status, empty.output).not.toBe(0);
        context.expect(empty.output).toContain('modules must be non-empty');

        writeBundle(root.root, {
          ...valid,
          modules: [
            ...valid.modules,
            {
              source: `packages/${bundleProductDirectory}/src/unknown.ts`,
              dependency: false,
              outputs: ['assets/index.js'],
            },
          ],
        });
        const unknown = runBundleCli(root);
        context.expect(unknown.status, unknown.output).not.toBe(0);
        context.expect(unknown.output).toContain('neither handwritten source nor dependency');
      });

      await check('entry-and-relative-assets', () => {
        writeBundle(root.root, {
          ...valid,
          modules: valid.modules.filter((module) => module.source !== valid.entry),
        });
        const missingEntry = runBundleCli(root);
        context.expect(missingEntry.status, missingEntry.output).not.toBe(0);
        context.expect(missingEntry.output).toContain('entry');

        writeBundleBuild(root.root, { html: '<script src="/assets/index.js"></script>\n' });
        writeBundle(root.root, valid);
        const absolute = runBundleCli(root);
        context.expect(absolute.status, absolute.output).not.toBe(0);
        context.expect(absolute.output).toContain('resource is not relative');
      });

      await check('bundle-violation-located', () => {
        writeBundle(root.root, {
          ...valid,
          modules: [],
        });
        const result = runBundleCli(root);
        context.expect(result.status, result.output).not.toBe(0);
        context.expect(result.output).toContain('modules');
      });

      await check('bundle-restorable', () => {
        writeBundleBuild(root.root);
        writeBundle(root.root, valid);
        const result = runBundleCli(root);
        context.expect(result.status, result.output).toBe(0);
        context.expect(result.json?.issues).toEqual([]);

        const template = runBundleCli(copy);
        context.expect(template.status, template.output).toBe(0);
        context.expect(template.json?.issues).toEqual([]);
      });
    } finally {
      root.cleanup();
      copy.cleanup();
    }
  },
  { timeoutMs: 120_000 },
);
