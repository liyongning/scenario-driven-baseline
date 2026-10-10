import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { minimalManifest } from '../packages/e2e/tests/tooling/controlled-root.ts';
import { writeProjectMapFixture } from '../packages/e2e/tests/tooling/helpers.ts';
import { checkProjectMap, runProjectMapCli } from './check-project-map.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** 模块根下的一级子目录（含被排除与隐藏目录）、模块根外的散落文件与应被跳过的目录。 */
const fixtureDirectories = [
  'packages/sample-product/src/alpha',
  'packages/sample-product/src/beta',
  'packages/sample-product/src/generated/ignored',
  'packages/sample-product/src/.hidden',
  'packages/sample-protocol/src/gamma',
  'packages/sample-protocol/testing/delta',
  'packages/sample-test/src/epsilon',
  'packages/sample-test/host/zeta',
  'packages/sample-test/tests/eta',
  'packages/sample-test/tests/fixtures/ignored',
  'dist/leftover',
  'coverage/leftover',
  '.hidden',
  'node_modules/installed',
] as const;

type FixtureManifest = ReturnType<typeof minimalManifest>;

/** 受控临时根：最小清单、真实模块目录、包级 AGENTS，再由夹具补齐项目地图与 CLAUDE 配对。 */
function fixture(mutate?: (manifest: FixtureManifest) => void): string {
  const root = mkdtempSync(join(tmpdir(), 'project-map-'));
  roots.push(root);
  const manifest = minimalManifest();
  mutate?.(manifest);
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  for (const directory of fixtureDirectories) mkdirSync(join(root, directory), { recursive: true });
  for (const directory of ['sample-product', 'sample-protocol', 'sample-test'])
    writeFileSync(join(root, 'packages', directory, 'AGENTS.md'), `# ${directory}\n`);
  writeFileSync(join(root, 'packages/sample-product/src/loose.ts'), 'export const loose = 1;\n');
  // 不在模块范围或应被跳过的目录即使有 CLAUDE.md 也不参与配对。
  writeFileSync(join(root, 'dist/leftover/CLAUDE.md'), '@AGENTS.md\n');
  writeFileSync(join(root, 'coverage/leftover/CLAUDE.md'), '@AGENTS.md\n');
  writeFileSync(join(root, '.hidden/CLAUDE.md'), '@AGENTS.md\n');
  writeFileSync(join(root, 'node_modules/installed/CLAUDE.md'), '@AGENTS.md\n');
  writeProjectMapFixture(root);
  return root;
}

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
  'SCN-TEMPLATE-ENGINEERING-011',
  'project-map-rules',
  ['agents-present', 'module-skeleton', 'map-consistent', 'claude-pairing'],
  async (context, check) => {
    await check('agents-present', async () => {
      const root = fixture();
      context.expect(checkProjectMap(root)).toEqual([]);

      rmSync(join(root, 'packages/sample-product/src/alpha/AGENTS.md'));
      context
        .expect(checkProjectMap(root))
        .toContain('missing packages/sample-product/src/alpha/AGENTS.md');

      // 根与包目录缺 AGENTS.md 时，列表对账跳过缺失文件但仍报告缺件。
      const noRoot = fixture();
      rmSync(join(noRoot, 'AGENTS.md'));
      context.expect(checkProjectMap(noRoot)).toContain('missing AGENTS.md');
      const noPackage = fixture();
      rmSync(join(noPackage, 'packages/sample-protocol/AGENTS.md'));
      context
        .expect(checkProjectMap(noPackage))
        .toContain('missing packages/sample-protocol/AGENTS.md');

      // generated/ 与 tests/fixtures/ 下的目录不算模块，不要求 AGENTS.md。
      context
        .expect(
          checkProjectMap(root).filter(
            (issue) => issue.includes('/generated/') || issue.includes('/fixtures/'),
          ),
        )
        .toEqual([]);

      // 清单未登记 moduleRoots 时默认 src；登记的 moduleRoot 目录不存在时跳过。
      const fallback = fixture((manifest) => {
        delete (manifest.packages as Array<Record<string, unknown>>)[0]!.moduleRoots;
      });
      context.expect(checkProjectMap(fallback)).toEqual([]);
      const sparse = fixture((manifest) => {
        (manifest.packages as Array<Record<string, unknown>>)[0]!.moduleRoots = [
          'src',
          'missing-root',
        ];
      });
      context.expect(checkProjectMap(sparse)).toEqual([]);
    });

    await check('module-skeleton', async () => {
      const path = (root: string) => join(root, 'packages/sample-protocol/src/gamma/AGENTS.md');
      const body = (headings: ReadonlyArray<string>) =>
        `# AGENTS.md\n\n${headings.map((name) => `## ${name}\n\n无\n`).join('\n')}`;

      const missing = fixture();
      writeFileSync(path(missing), body(['职责', '对外入口', '允许依赖', '本地约束']));
      context
        .expect(checkProjectMap(missing))
        .toContain('packages/sample-protocol/src/gamma/AGENTS.md: missing section ## 子模块');

      const reordered = fixture();
      writeFileSync(path(reordered), body(['子模块', '职责', '对外入口', '允许依赖', '本地约束']));
      context
        .expect(checkProjectMap(reordered))
        .toContain(
          'packages/sample-protocol/src/gamma/AGENTS.md: section ## 子模块 is out of order',
        );

      // 首个标题之前的正文不属于任何节，不参与行内代码对账。
      const preamble = fixture();
      writeFileSync(
        join(preamble, 'packages/sample-product/AGENTS.md'),
        '`packages/sample-product`\n\n# packages/sample-product/AGENTS.md\n\n## 子模块\n\n- `packages/sample-product/src/alpha`\n- `packages/sample-product/src/beta`\n',
      );
      context.expect(checkProjectMap(preamble)).toEqual([]);
    });

    await check('map-consistent', async () => {
      const packagePath = (root: string) => join(root, 'packages/sample-protocol/AGENTS.md');
      const rootPath = (root: string) => join(root, 'AGENTS.md');

      const added = fixture();
      mkdirSync(join(added, 'packages/sample-protocol/src/theta'));
      context
        .expect(checkProjectMap(added))
        .toEqual(
          expect.arrayContaining([
            'packages/sample-protocol/AGENTS.md: 子模块 is missing packages/sample-protocol/src/theta',
            'missing packages/sample-protocol/src/theta/AGENTS.md',
          ]),
        );

      const unknown = fixture();
      writeFileSync(
        packagePath(unknown),
        `${readFileSync(packagePath(unknown), 'utf8')}- \`packages/sample-protocol/src/nowhere\`\n`,
      );
      context
        .expect(checkProjectMap(unknown))
        .toContain(
          'packages/sample-protocol/AGENTS.md: 子模块 lists unknown entry packages/sample-protocol/src/nowhere',
        );

      const sectionless = fixture();
      writeFileSync(packagePath(sectionless), '# packages/sample-protocol/AGENTS.md\n');
      context
        .expect(checkProjectMap(sectionless))
        .toContain('packages/sample-protocol/AGENTS.md: missing section ## 子模块');

      const missingPackage = fixture();
      writeFileSync(
        rootPath(missingPackage),
        '# root\n\n## 项目地图\n\n- `packages/sample-product`：[AGENTS](packages/sample-product/AGENTS.md)\n- `packages/sample-protocol`：[AGENTS](packages/sample-protocol/AGENTS.md)\n',
      );
      context
        .expect(checkProjectMap(missingPackage))
        .toContain('AGENTS.md: 项目地图 is missing packages/sample-test');

      const extraPackage = fixture();
      writeFileSync(
        rootPath(extraPackage),
        '# root\n\n## 项目地图\n\n- `packages/sample-product`：[AGENTS](packages/sample-product/AGENTS.md)\n- `packages/sample-protocol`：[AGENTS](packages/sample-protocol/AGENTS.md)\n- `packages/sample-test`：[AGENTS](packages/sample-test/AGENTS.md)\n- `packages/ghost`\n',
      );
      context
        .expect(checkProjectMap(extraPackage))
        .toContain('AGENTS.md: 项目地图 lists unknown entry packages/ghost');

      const unlinked = fixture();
      writeFileSync(
        rootPath(unlinked),
        '# root\n\n## 项目地图\n\n- `packages/sample-product`：无链接\n- `packages/sample-protocol`：[AGENTS](packages/sample-protocol/AGENTS.md)\n- `packages/sample-test`：[AGENTS](packages/sample-test/AGENTS.md)\n',
      );
      context
        .expect(checkProjectMap(unlinked))
        .toContain('AGENTS.md: 项目地图 does not link packages/sample-product/AGENTS.md');

      const sectionlessRoot = fixture();
      writeFileSync(rootPath(sectionlessRoot), '# root\n');
      context
        .expect(checkProjectMap(sectionlessRoot))
        .toContain('AGENTS.md: missing section ## 项目地图');
    });

    await check('claude-pairing', async () => {
      const missing = fixture();
      rmSync(join(missing, 'packages/sample-test/src/epsilon/CLAUDE.md'));
      context
        .expect(checkProjectMap(missing))
        .toContain('missing packages/sample-test/src/epsilon/CLAUDE.md');

      const wrong = fixture();
      writeFileSync(
        join(wrong, 'packages/sample-protocol/src/gamma/CLAUDE.md'),
        '# not an import\n',
      );
      context
        .expect(checkProjectMap(wrong))
        .toContain(
          'packages/sample-protocol/src/gamma/CLAUDE.md: first non-empty line must be @AGENTS.md, found # not an import',
        );

      const blank = fixture();
      writeFileSync(join(blank, 'packages/sample-protocol/src/gamma/CLAUDE.md'), '\n\n');
      context
        .expect(checkProjectMap(blank))
        .toContain(
          'packages/sample-protocol/src/gamma/CLAUDE.md: first non-empty line must be @AGENTS.md, found ',
        );

      // 模块范围外的孤立 CLAUDE.md 也要求同目录 AGENTS.md。
      const orphan = fixture();
      mkdirSync(join(orphan, 'packages/sample-product/docs'), { recursive: true });
      writeFileSync(join(orphan, 'packages/sample-product/docs/CLAUDE.md'), '@AGENTS.md\n');
      context
        .expect(checkProjectMap(orphan))
        .toContain(
          'packages/sample-product/docs/CLAUDE.md: missing packages/sample-product/docs/AGENTS.md in the same directory',
        );
    });
  },
);

test('runProjectMapCli 解析 --root、回退工作目录并报告读取失败', () => {
  const root = fixture();
  expect(runProjectMapCli(['node', 'script', '--root', root])).toEqual({ issues: [], exitCode: 0 });
  expect(runProjectMapCli(['node', 'script', '--root'], root)).toEqual({ issues: [], exitCode: 0 });
  expect(runProjectMapCli([], root)).toEqual({ issues: [], exitCode: 0 });
  rmSync(join(root, 'project.manifest.json'));
  const failed = runProjectMapCli(['node', 'script', '--root', root]);
  expect(failed.exitCode).toBe(1);
  expect(failed.issues.length).toBeGreaterThan(0);
});
