import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { createEngineeringFormRoot } from '../packages/e2e/tests/tooling/engineering-form-fixture.ts';
import { checkComponentTree, cruiseGraph } from './check-component-tree.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');

function evidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `${id} ${caseId}`,
    {
      timeout: 30_000,
      meta: {
        scenarioCase: {
          ownerId: id,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id, caseKey: caseId, checks }],
        },
      },
    },
    async (context) => {
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

function writeAndRestore(path: string, value: string, assertion: () => void): void {
  const existed = existsSync(path);
  const original = existed ? readFileSync(path, 'utf8') : '';
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
    assertion();
  } finally {
    if (existed) writeFileSync(path, original);
    else rmSync(path, { force: true });
  }
}

test('component tree dependency graph surfaces process failures', () => {
  const failed = (() => ({ error: new Error('spawn failed') })) as unknown as typeof spawnSync;
  expect(() => cruiseGraph(repositoryRoot, 'packages/web/src', failed)).toThrow('spawn failed');

  const empty = (() => ({ stdout: '', stderr: 'no json' })) as unknown as typeof spawnSync;
  expect(() => cruiseGraph(repositoryRoot, 'packages/web/src', empty)).toThrow(
    'dependency-cruiser produced no JSON: no json',
  );
});

evidence(
  'SCN-WEB-APP-004',
  'component-tree-rules',
  [
    'single-vue-named',
    'no-parent-import',
    'css-locality',
    'subtree-privacy',
    'orphan-rejected',
    'tree-violation-located',
  ],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      const base = join(root.root, 'packages/web-product/src');
      const main = join(base, 'main.ts');
      const app = join(base, 'AppRoot/AppRoot.vue');
      const child = join(base, 'AppRoot/components/Child/Child.vue');
      await check('single-vue-named', () => {
        context.expect(checkComponentTree(root.root).issues).toEqual([]);
        writeAndRestore(join(base, 'AppRoot/Other.vue'), '<template />\n', () =>
          context
            .expect(checkComponentTree(root.root).issues.join('\n'))
            .toContain('component-tree/1'),
        );
        writeAndRestore(join(base, 'Mismatch/Other.vue'), '<template />\n', () =>
          context
            .expect(checkComponentTree(root.root).issues.join('\n'))
            .toContain('file name must equal component directory Mismatch'),
        );
        const manifestPath = join(root.root, 'project.manifest.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          packages: Array<Record<string, unknown>>;
        };
        const web = manifest.packages.find((item) => item.directory === 'web-product')!;
        delete web.moduleRoots;
        writeAndRestore(manifestPath, JSON.stringify(manifest, null, 2), () =>
          context.expect(checkComponentTree(root.root).issues).toEqual([]),
        );
      });
      await check('no-parent-import', () => {
        const source = readFileSync(child, 'utf8').replace(
          'const label = "child";',
          "import Parent from '../../AppRoot.vue';\nconst label = String(Parent);",
        );
        writeAndRestore(child, source, () =>
          context
            .expect(checkComponentTree(root.root).issues.join('\n'))
            .toContain('component-tree/2'),
        );
      });
      await check('css-locality', () => {
        const source = readFileSync(app, 'utf8').replace('./AppRoot.css', '../global.css');
        writeAndRestore(join(base, 'global.css'), '.global {}\n', () =>
          writeAndRestore(app, source, () =>
            context
              .expect(checkComponentTree(root.root).issues.join('\n'))
              .toContain('component-tree/3'),
          ),
        );
        writeAndRestore(
          app,
          readFileSync(app, 'utf8').replace('./AppRoot.css', './missing.css'),
          () => context.expect(checkComponentTree(root.root).issues).toEqual([]),
        );
        writeAndRestore(
          app,
          readFileSync(app, 'utf8').replace(
            "import { computed } from 'vue';",
            "void import('virtual:missing-component-dependency');\nimport { computed } from 'vue';",
          ),
          () => context.expect(checkComponentTree(root.root).issues).toEqual([]),
        );
      });
      await check('subtree-privacy', () => {
        const source = "import { hook } from './AppRoot/useAppRoot';\nvoid hook;\n";
        writeAndRestore(join(base, 'AppRoot/useAppRoot.ts'), 'export const hook = true;\n', () =>
          writeAndRestore(main, source, () =>
            context
              .expect(checkComponentTree(root.root).issues.join('\n'))
              .toContain('component-tree/4'),
          ),
        );
      });
      await check('orphan-rejected', () => {
        writeAndRestore(main, "import './deployment-config';\n", () =>
          context
            .expect(checkComponentTree(root.root).issues.join('\n'))
            .toContain('component-tree/5'),
        );
      });
      await check('tree-violation-located', () => {
        context.expect(checkComponentTree(root.root).issues).toEqual([]);
      });
    } finally {
      root.cleanup();
    }
  },
);
