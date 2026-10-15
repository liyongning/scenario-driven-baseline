import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect } from 'vitest';
import {
  capabilityMapNames,
  checkArchitectureDoc,
} from '../../../../scripts/lib/architecture-doc.ts';
import { headingsOf } from '../../../../scripts/lib/markdown-docs.ts';
import {
  cliEvidence,
  runArchitecture,
  writeProjectManifest,
  writeRepositoryPackages,
} from './scenario-gate-helpers.ts';
import { repositoryRoot, writeTemplateGuideFixture } from './helpers.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** 最小架构根：清单、根 package.json、三包、合法指南与同名的技术架构文档；各反例在其副本上改写。 */
function architectureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'architecture-doc-cli-'));
  roots.push(root);
  writeProjectManifest(root);
  writeFileSync(join(root, 'package.json'), readFileSync(join(repositoryRoot, 'package.json')));
  writeFileSync(join(root, 'AGENTS.md'), '[root](README.md)\n');
  writeFileSync(join(root, 'README.md'), '# readme\n');
  writeRepositoryPackages(root);
  writeTemplateGuideFixture(root);
  return root;
}

const docPath = (root: string) => join(root, 'docs/architecture.md');
const issuesOf = (root: string) => runArchitecture(root).output?.issues.join('\n') ?? '';

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-012',
  'architecture-doc-violations-cli',
  [
    'architecture-present-and-linked',
    'capability-sections',
    'architecture-links-resolve',
    'architecture-restorable',
  ],
  async (context, check) => {
    await check('architecture-present-and-linked', () => {
      const missing = architectureRoot();
      rmSync(docPath(missing));
      context.expect(issuesOf(missing)).toContain('missing docs/architecture.md');

      const unlinked = architectureRoot();
      writeFileSync(join(unlinked, 'AGENTS.md'), '# root\n');
      writeFileSync(join(unlinked, 'README.md'), '# readme\n');
      context.expect(issuesOf(unlinked)).toContain('AGENTS.md does not link docs/architecture.md');
      context.expect(issuesOf(unlinked)).toContain('README.md does not link docs/architecture.md');
    });

    await check('capability-sections', () => {
      const root = architectureRoot();
      const guide = readFileSync(join(root, 'docs/template-guide.md'), 'utf8');
      writeFileSync(
        join(root, 'docs/template-guide.md'),
        guide.replace(
          '| 临时能力 | 临时根占位 | 无 |',
          '| 临时能力 | 临时根占位 | 无 |\n| 未登记能力 | 临时根占位 | 无 |',
        ),
      );
      context
        .expect(issuesOf(root))
        .toContain('docs/architecture.md: missing capability section 未登记能力');
    });

    await check('architecture-links-resolve', () => {
      const root = architectureRoot();
      writeFileSync(
        join(root, 'docs/architecture.md'),
        `${readFileSync(docPath(root), 'utf8')}\n[缺失](missing.md)\n`,
      );
      context.expect(issuesOf(root)).toContain('broken link docs/architecture.md -> missing.md');
    });

    await check('architecture-restorable', () => {
      const root = architectureRoot();
      const result = runArchitecture(root);
      context.expect(result.output?.issues).toEqual([]);
      context.expect(result.status).toBe(0);
    });
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-012',
  'web-capability-sections-fact',
  ['web-capability-sections'],
  async (context, check) => {
    await check('web-capability-sections', () => {
      const required = [
        '组合绑定',
        '协议适配器',
        'Web 应用包（含前端架构规范）',
        '产物边界',
        'OpenAPI 协议包',
        '浏览器平台点位',
        '本地预览',
      ];
      const guide = readFileSync(join(repositoryRoot, 'docs/template-guide.md'), 'utf8');
      const architecture = readFileSync(join(repositoryRoot, 'docs/architecture.md'), 'utf8');
      context.expect(capabilityMapNames(guide)).toEqual(expect.arrayContaining(required));
      const headings = headingsOf(architecture)
        .filter((heading) => heading.depth === 2 || heading.depth === 3)
        .map((heading) => heading.text);
      for (const capability of required) context.expect(headings).toContain(capability);
      if (existsSync(join(repositoryRoot, 'packages/web/src/trade-create'))) {
        context.expect(capabilityMapNames(guide)).toContain('Web 示例');
        context.expect(headings).toContain('Web 示例');
      } else {
        context.expect(capabilityMapNames(guide)).not.toContain('Web 示例');
        context.expect(headings).not.toContain('Web 示例');
      }

      const root = architectureRoot();
      const fixtureGuide = readFileSync(join(root, 'docs/template-guide.md'), 'utf8');
      writeFileSync(
        join(root, 'docs/template-guide.md'),
        fixtureGuide.replace(
          '| Web 示例 | 临时根占位 | 无 |',
          '| Web 示例 | 临时根占位 | 无 |\n| 未登记能力 | 临时根占位 | 无 |',
        ),
      );
      context
        .expect(checkArchitectureDoc(root))
        .toContain('docs/architecture.md: missing capability section 未登记能力');
    });
  },
);
