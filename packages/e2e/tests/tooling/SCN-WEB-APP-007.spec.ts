import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createEngineeringFormRoot } from './engineering-form-fixture.ts';
import { repositoryRoot } from './helpers.ts';
import { checkCoreTsconfig } from '../../../../scripts/lib/web-app-checks.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import { runEslint, runTsc, writeAndRestore } from './web-cli-helpers.ts';

const corePath = 'packages/web-product/src/runtime/platform.ts';
const uiPath = 'packages/web-product/src/AppRoot/browser.ts';

cliEvidence(
  'SCN-WEB-APP-007',
  'core-dom-cli',
  ['core-tsconfig-derived', 'core-dom-type-rejected', 'core-dom-lint-rejected', 'core-restorable'],
  async (context, check) => {
    const root = createEngineeringFormRoot(undefined, {
      'packages/web-product/src/runtime/platform.ts': 'export const platform = true;\n',
    });
    try {
      await check('core-tsconfig-derived', () => {
        const manifest = loadProjectManifest(root.root);
        context.expect(checkCoreTsconfig(root.root, manifest)).toEqual([]);
        const value = JSON.parse(
          readFileSync(join(root.root, 'packages/web-product/tsconfig.core.json'), 'utf8'),
        ) as { compilerOptions: { lib: string[]; types: string[] } };
        context.expect(value.compilerOptions).toMatchObject({ lib: ['ES2022'], types: [] });
        context
          .expect(checkCoreTsconfig(repositoryRoot, loadProjectManifest(repositoryRoot)))
          .toEqual([]);
      });
      await check('core-dom-type-rejected', () => {
        writeAndRestore(
          join(root.root, corePath),
          'export const platform: HTMLElement = document.body;\n',
          () => {
            const result = runTsc(root, 'packages/web-product/tsconfig.core.json');
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain(corePath.replace('packages/web-product/', ''));
            context.expect(result.output).toMatch(/Cannot find name 'document'|HTMLElement/);
          },
        );
      });
      await check('core-dom-lint-rejected', () => {
        writeAndRestore(
          join(root.root, corePath),
          'export const platform = document.body;\n',
          () => {
            const result = runEslint(root, [corePath]);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('no-restricted-globals');
          },
        );
        writeAndRestore(join(root.root, uiPath), 'export const platform = document.body;\n', () => {
          const result = runEslint(root, [uiPath]);
          context.expect(result.status, result.output).toBe(0);
        });
      });
      await check('core-restorable', () => {
        const types = runTsc(root, 'packages/web-product/tsconfig.core.json');
        context.expect(types.status, types.output).toBe(0);
        const lint = runEslint(root, [corePath]);
        context.expect(lint.status, lint.output).toBe(0);
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 60_000 },
);
