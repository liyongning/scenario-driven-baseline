import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createEngineeringFormRoot, runCli } from './engineering-form-fixture.ts';
import { repositoryRoot } from './helpers.ts';
import { writeAndRestore } from './web-cli-helpers.ts';

const realRoot = { root: repositoryRoot, env: process.env, cleanup: () => {} };

cliEvidence(
  'SCN-WEB-APP-004',
  'component-tree-cli',
  [
    'single-vue-named',
    'no-parent-import',
    'css-locality',
    'subtree-privacy',
    'orphan-rejected',
    'tree-violation-located',
    'tree-restorable',
  ],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    const source = join(root.root, 'packages/web-product/src');
    const main = join(source, 'main.ts');
    const app = join(source, 'AppRoot/AppRoot.vue');
    const child = join(source, 'AppRoot/components/Child/Child.vue');
    try {
      await check('single-vue-named', () => {
        writeAndRestore(join(source, 'AppRoot/Other.vue'), '<template />\n', () => {
          const result = runCli(root, 'scripts/check-component-tree.ts');
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toContain('component-tree/1');
        });
      });
      await check('no-parent-import', () => {
        const changed = readFileSync(child, 'utf8').replace(
          'const label = "child";',
          "import Parent from '../../AppRoot.vue';\nconst label = String(Parent);",
        );
        writeAndRestore(child, changed, () => {
          const result = runCli(root, 'scripts/check-component-tree.ts');
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toContain('component-tree/2');
          context.expect(result.output).toContain('Child/Child.vue');
        });
      });
      await check('css-locality', () => {
        const changed = readFileSync(app, 'utf8').replace('./AppRoot.css', '../global.css');
        writeAndRestore(join(source, 'global.css'), '.global {}\n', () => {
          writeAndRestore(app, changed, () => {
            const result = runCli(root, 'scripts/check-component-tree.ts');
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('component-tree/3');
          });
        });
      });
      await check('subtree-privacy', () => {
        writeAndRestore(
          join(source, 'AppRoot/useAppRoot.ts'),
          'export const hook = true;\n',
          () => {
            writeAndRestore(
              main,
              "import { hook } from './AppRoot/useAppRoot';\nvoid hook;\n",
              () => {
                const result = runCli(root, 'scripts/check-component-tree.ts');
                context.expect(result.status, result.output).not.toBe(0);
                context.expect(result.output).toContain('component-tree/4');
              },
            );
          },
        );
      });
      await check('orphan-rejected', () => {
        writeAndRestore(main, "import './deployment-config';\n", () => {
          const result = runCli(root, 'scripts/check-component-tree.ts');
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toContain('component-tree/5');
        });
      });
      await check('tree-violation-located', () => {
        writeAndRestore(join(source, 'AppRoot/Broken.vue'), '<template />\n', () => {
          const result = runCli(root, 'scripts/check-component-tree.ts');
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toMatch(/component-tree\/[1-5]/);
          context.expect(result.output).toContain('packages/web-product/src');
        });
      });
      await check('tree-restorable', () => {
        const template = runCli(realRoot, 'scripts/check-component-tree.ts');
        context.expect(template.status, template.output).toBe(0);
        context.expect(template.json?.issues).toEqual([]);
        const fixture = runCli(root, 'scripts/check-component-tree.ts');
        context.expect(fixture.status, fixture.output).toBe(0);
        context.expect(fixture.json?.issues).toEqual([]);
      });
    } finally {
      root.cleanup();
    }
  },
);
