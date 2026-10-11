import { cpSync, existsSync, readFileSync } from 'node:fs';
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
      await check('manifest-outside-dist', () => {
        cpSync(
          join(repositoryRoot, 'packages/web/index.html'),
          join(copy.root, 'packages/web/index.html'),
        );
        runBundleBuild(copy);
        const product = loadProjectManifest(copy.root).packages.find(
          (item) => item.form === 'web-app',
        )!;
        const manifestPath = bundleManifestPath(copy.root, product.directory);
        context.expect(existsSync(manifestPath)).toBe(true);
        const dist = join(copy.root, 'packages', product.directory, 'dist');
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
