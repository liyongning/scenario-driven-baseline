import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import {
  cliEvidence,
  runArchitecture,
  writeProjectManifest,
  writeRepositoryPackages,
} from './scenario-gate-helpers.ts';
import { writeTemplateGuideFixture, repositoryRoot } from './helpers.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** 最小架构根：清单、根 package.json、三包与一份合法指南；各反例在其副本上改写。 */
function guideRoot() {
  const root = mkdtempSync(join(tmpdir(), 'template-guide-cli-'));
  roots.push(root);
  writeProjectManifest(root);
  writeFileSync(join(root, 'package.json'), readFileSync(join(repositoryRoot, 'package.json')));
  writeFileSync(join(root, 'AGENTS.md'), '[root](README.md)\n');
  writeFileSync(join(root, 'README.md'), '# readme\n');
  writeRepositoryPackages(root);
  writeTemplateGuideFixture(root);
  return root;
}

const guidePath = (root: string) => join(root, 'docs/template-guide.md');
const issuesOf = (root: string) => runArchitecture(root).output?.issues.join('\n') ?? '';

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-006',
  'guide-violations-cli',
  [
    'guide-present-and-linked',
    'guide-sections',
    'guide-links-resolve',
    'guide-facts-consistent',
    'guide-restorable',
  ],
  async (context, check) => {
    await check('guide-present-and-linked', () => {
      const missing = guideRoot();
      rmSync(guidePath(missing));
      context.expect(issuesOf(missing)).toContain('missing docs/template-guide.md');

      const unlinked = guideRoot();
      writeFileSync(join(unlinked, 'AGENTS.md'), '# root\n');
      writeFileSync(join(unlinked, 'README.md'), '# readme\n');
      context
        .expect(issuesOf(unlinked))
        .toContain('AGENTS.md does not link docs/template-guide.md');
      context
        .expect(issuesOf(unlinked))
        .toContain('README.md does not link docs/template-guide.md');
    });

    await check('guide-sections', () => {
      const root = guideRoot();
      writeFileSync(guidePath(root), '# guide\n\n## 能力地图\n');
      const issues = issuesOf(root);
      context.expect(issues).toContain('missing guide section ## 从方案到验收');
      context.expect(issues).toContain('missing guide section ## 移除模板示例');
      context.expect(issues).toContain('missing guide section ## 归档已知限制');
      context.expect(issues).toContain('missing guide section ## 版本对齐');
      context.expect(issues).toContain('missing guide section ## 使用方约定');
      context.expect(issues).toContain('missing guide section ## 复刻验收');
      context.expect(issues).toContain('missing guide section ### 包发布');

      // 白名单缺项：章节齐全但少写一项也非零退出。
      const partial = guideRoot();
      writeFileSync(
        guidePath(partial),
        readFileSync(guidePath(partial), 'utf8').replace('`openspec/specs/template-example/`', ''),
      );
      context
        .expect(issuesOf(partial))
        .toContain('missing removal whitelist entry openspec/specs/template-example/');

      // 示例删除验收自身的用例同样必须在白名单里列明（A3：它随示例一起删除）。
      const acceptance = guideRoot();
      writeFileSync(
        guidePath(acceptance),
        readFileSync(guidePath(acceptance), 'utf8').replace(
          '`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`',
          '',
        ),
      );
      context
        .expect(issuesOf(acceptance))
        .toContain(
          'missing removal whitelist entry packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts',
        );
    });

    await check('guide-links-resolve', () => {
      const root = guideRoot();
      writeFileSync(
        guidePath(root),
        `${readFileSync(guidePath(root), 'utf8')}\n[missing](missing.md)\n`,
      );
      context.expect(issuesOf(root)).toContain('broken link docs/template-guide.md -> missing.md');
    });

    await check('guide-facts-consistent', () => {
      const root = guideRoot();
      writeFileSync(
        guidePath(root),
        `${readFileSync(guidePath(root), 'utf8')}\n\`SCN-NOT-REGISTERED-001\` \`pnpm not:a:command\` \`manifest.not.a.field\`\n`,
      );
      const issues = issuesOf(root);
      context.expect(issues).toContain('unregistered Scenario ID SCN-NOT-REGISTERED-001');
      context.expect(issues).toContain('unknown pnpm command not:a:command');
      context.expect(issues).toContain('unknown manifest field manifest.not.a.field');
    });

    await check('guide-restorable', () => {
      const root = guideRoot();
      const result = runArchitecture(root);
      context.expect(result.output?.issues).toEqual([]);
      context.expect(result.status).toBe(0);
    });
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-006',
  'example-marker-violations-cli',
  ['example-markers-paired', 'guide-restorable'],
  async (context, check) => {
    await check('example-markers-paired', () => {
      const root = guideRoot();
      mkdirSync(join(root, 'packages/sdk/src'), { recursive: true });
      writeFileSync(join(root, 'packages/sdk/src/marked.ts'), '// template-example:begin\n');
      const result = runArchitecture(root);
      context
        .expect(result.output?.issues.join('\n'))
        .toContain('packages/sdk/src/marked.ts:1: template-example:begin 没有对应的 end');
      context.expect(result.status).not.toBe(0);
    });

    await check('guide-restorable', () => {
      const root = guideRoot();
      mkdirSync(join(root, 'packages/sdk/src'), { recursive: true });
      writeFileSync(
        join(root, 'packages/sdk/src/marked.ts'),
        '// template-example:begin\nconst example = 1;\n// template-example:end\n',
      );
      const result = runArchitecture(root);
      context.expect(result.output?.issues).toEqual([]);
      context.expect(result.status).toBe(0);
    });
  },
);
