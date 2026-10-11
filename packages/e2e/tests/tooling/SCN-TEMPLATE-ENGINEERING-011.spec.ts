import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import {
  cliEvidence,
  runArchitecture,
  runProjectMap,
  writeProjectManifest,
  writeRepositoryPackages,
} from './scenario-gate-helpers.ts';
import { repositoryRoot, writeProjectMapFixture, writeTemplateGuideFixture } from './helpers.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** 最小架构根：清单、根 package.json、三包、项目地图与合法指南；各反例在其副本上改写。 */
function projectMapRoot() {
  const root = mkdtempSync(join(tmpdir(), 'template-project-map-cli-'));
  roots.push(root);
  writeProjectManifest(root);
  writeFileSync(join(root, 'package.json'), readFileSync(join(repositoryRoot, 'package.json')));
  writeFileSync(join(root, 'AGENTS.md'), '[root](README.md)\n');
  writeFileSync(join(root, 'README.md'), '# readme\n');
  writeRepositoryPackages(root);
  writeTemplateGuideFixture(root);
  return root;
}

const issuesOf = (root: string) => runProjectMap(root).output?.issues.join('\n') ?? '';

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-011',
  'project-map-violations-cli',
  [
    'agents-present',
    'module-skeleton',
    'map-consistent',
    'claude-pairing',
    'wired-into-architecture',
    'map-restorable',
  ],
  async (context, check) => {
    await check('agents-present', () => {
      const root = projectMapRoot();
      mkdirSync(join(root, 'packages/sdk/src/sample-module'), { recursive: true });
      const result = runProjectMap(root);
      context.expect(result.status).not.toBe(0);
      context
        .expect(result.output?.issues.join('\n'))
        .toContain('missing packages/sdk/src/sample-module/AGENTS.md');
      // generated/ 与 tests/fixtures/ 下的目录不算模块，不要求 AGENTS.md。
      mkdirSync(join(root, 'packages/protocol/src/generated/sample'), { recursive: true });
      mkdirSync(join(root, 'packages/e2e/tests/fixtures/sample'), { recursive: true });
      const issues = issuesOf(root);
      context.expect(issues).not.toContain('generated/sample');
      context.expect(issues).not.toContain('fixtures/sample');
    });

    await check('module-skeleton', () => {
      const root = projectMapRoot();
      mkdirSync(join(root, 'packages/e2e/tests/sample-module'), { recursive: true });
      writeProjectMapFixture(root);
      writeFileSync(
        join(root, 'packages/e2e/tests/sample-module/AGENTS.md'),
        '# AGENTS.md\n\n## 职责\n\n无\n',
      );
      context
        .expect(issuesOf(root))
        .toContain('packages/e2e/tests/sample-module/AGENTS.md: missing section ## 对外入口');
    });

    await check('map-consistent', () => {
      const missing = projectMapRoot();
      mkdirSync(join(missing, 'packages/sdk/src/sample-module'), { recursive: true });
      context
        .expect(issuesOf(missing))
        .toContain('packages/sdk/AGENTS.md: 子模块 is missing packages/sdk/src/sample-module');

      const unknown = projectMapRoot();
      const path = join(unknown, 'packages/sdk/AGENTS.md');
      writeFileSync(path, `${readFileSync(path, 'utf8')}- \`packages/sdk/src/nowhere\`\n`);
      context
        .expect(issuesOf(unknown))
        .toContain('packages/sdk/AGENTS.md: 子模块 lists unknown entry packages/sdk/src/nowhere');
    });

    await check('claude-pairing', () => {
      const root = projectMapRoot();
      mkdirSync(join(root, 'packages/sdk/src/sample-module'), { recursive: true });
      writeProjectMapFixture(root);
      rmSync(join(root, 'packages/sdk/src/sample-module/CLAUDE.md'));
      context.expect(issuesOf(root)).toContain('missing packages/sdk/src/sample-module/CLAUDE.md');
      writeFileSync(join(root, 'packages/sdk/src/sample-module/CLAUDE.md'), '# wrong\n');
      context
        .expect(issuesOf(root))
        .toContain(
          'packages/sdk/src/sample-module/CLAUDE.md: first non-empty line must be @AGENTS.md',
        );
    });

    await check('wired-into-architecture', () => {
      const root = projectMapRoot();
      mkdirSync(join(root, 'packages/sdk/src/sample-module'), { recursive: true });
      const result = runArchitecture(root);
      context.expect(result.status).not.toBe(0);
      context
        .expect(result.output?.issues.join('\n'))
        .toContain('missing packages/sdk/src/sample-module/AGENTS.md');
    });

    await check('map-restorable', () => {
      const root = projectMapRoot();
      const map = runProjectMap(root);
      context.expect(map.output?.issues).toEqual([]);
      context.expect(map.status).toBe(0);
      const architecture = runArchitecture(root);
      context.expect(architecture.output?.issues).toEqual([]);
      context.expect(architecture.status).toBe(0);
    });
  },
);
