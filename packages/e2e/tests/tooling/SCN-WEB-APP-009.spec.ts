import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  createEngineeringFormRoot,
  readManifest,
  writeManifest,
} from './engineering-form-fixture.ts';
import { repositoryRoot } from './helpers.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import { runEslint, writeAndRestore } from './web-cli-helpers.ts';

const tsFile = 'packages/web-product/src/AppRoot/ignored.ts';
const vueFile = 'packages/web-product/src/AppRoot/ignored.vue';
const badComponent = 'packages/web-product/src/Bad/Bad.vue';

cliEvidence(
  'SCN-WEB-APP-009',
  'lint-discipline-cli',
  [
    'vue-flat-config',
    'coverage-ignore-banned',
    'multi-word-by-manifest',
    'lint-discipline-restorable',
  ],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      await check('vue-flat-config', () => {
        const config = readFileSync(join(repositoryRoot, 'eslint.config.js'), 'utf8');
        const rootPackage = JSON.parse(
          readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
        ) as { devDependencies?: Record<string, string> };
        context.expect(config).toContain('eslint-plugin-vue');
        context.expect(config).toContain("vue.configs['flat/recommended']");
        context
          .expect(rootPackage.devDependencies?.['@vue/eslint-config-typescript'])
          .toBeUndefined();
      });
      await check('coverage-ignore-banned', () => {
        for (const [path, source, marker] of [
          [tsFile, '// v8 ignore next\nexport const value = 1;\n', 'v8 ignore'],
          [
            vueFile,
            '<script setup lang="ts">\n// istanbul ignore next\nconst value = 1;\n</script>\n',
            'istanbul ignore',
          ],
          [tsFile, '// c8 ignore next\nexport const value = 1;\n', 'c8 ignore'],
        ] as const)
          writeAndRestore(join(root.root, path), source, () => {
            const result = runEslint(root, [path]);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain(marker);
          });
      });
      await check('multi-word-by-manifest', () => {
        writeAndRestore(join(root.root, badComponent), '<template><p>bad</p></template>\n', () => {
          const unregistered = runEslint(root, [badComponent]);
          context.expect(unregistered.status, unregistered.output).not.toBe(0);
          context.expect(unregistered.output).toContain('multi-word-component-names');

          const manifest = readManifest(root);
          const quality = manifest.quality as {
            componentNameExemptions: Array<{ path: string; reason: string }>;
          };
          quality.componentNameExemptions = [{ path: badComponent, reason: '受控反例登记' }];
          writeManifest(root, manifest);
          try {
            const registered = runEslint(root, [badComponent]);
            context.expect(registered.status, registered.output).toBe(0);
          } finally {
            quality.componentNameExemptions = [];
            writeManifest(root, manifest);
          }

          const invalid = readManifest(root) as Record<string, unknown> & {
            quality?: { componentNameExemptions?: unknown };
          };
          invalid.quality = {
            ...((invalid.quality as Record<string, unknown> | undefined) ?? {}),
            componentNameExemptions: [{ path: badComponent }],
          };
          writeManifest(root, invalid);
          try {
            context.expect(() => loadProjectManifest(root.root)).toThrow(/reason/);
          } finally {
            delete invalid.quality;
            writeManifest(root, invalid);
          }
        });
      });
      await check('lint-discipline-restorable', () => {
        const valid = 'packages/web-product/src/GoodComponent/GoodComponent.vue';
        writeAndRestore(join(root.root, valid), '<template><p>valid</p></template>\n', () => {
          const result = runEslint(root, [valid]);
          context.expect(result.status, result.output).toBe(0);
        });
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 60_000 },
);
