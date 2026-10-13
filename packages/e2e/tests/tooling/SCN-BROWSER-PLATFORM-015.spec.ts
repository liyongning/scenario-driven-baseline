import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { repositoryRoot } from './helpers.ts';
import { loadWebConfig } from '../../src/hosts/web-config.ts';

function sourceFiles(root: string, directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(root, directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(root, relative(root, path)));
    else if (['.ts', '.vue'].includes(extname(entry.name)) && !entry.name.includes('.test.'))
      files.push(relative(root, path));
  }
  return files;
}

function productModeIssues(files: Readonly<Record<string, string>>) {
  return Object.entries(files)
    .filter(([, source]) => {
      const executable = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      return /\b(?:mock|preview|shadow)\b|import\.meta\.env\.MODE\b/i.test(executable);
    })
    .map(([path]) => `${path}: product source contains a mode branch`);
}

function agentsIssues(content: string) {
  return content.includes('Shadow 服务测试与本地预览，均不进入生产产物')
    ? []
    : ['root AGENTS must describe Shadow only for tests and local preview'];
}

cliEvidence(
  'SCN-BROWSER-PLATFORM-015',
  'mode-boundary-check',
  ['product-mode-agnostic', 'no-mixed-mode', 'agents-statement'],
  async (context, check) => {
    const productSources = Object.fromEntries(
      sourceFiles(repositoryRoot, 'packages/web/src').map((path) => [
        path,
        readFileSync(join(repositoryRoot, path), 'utf8'),
      ]),
    );
    const rootAgents = readFileSync(join(repositoryRoot, 'AGENTS.md'), 'utf8');

    await check('product-mode-agnostic', () => {
      context.expect(productModeIssues(productSources)).toEqual([]);
      context
        .expect(
          productModeIssues({
            'packages/web/src/mode.ts':
              "export const base = import.meta.env.MODE === 'preview' ? '/mock' : '/api';\n",
          }),
        )
        .toEqual(['packages/web/src/mode.ts: product source contains a mode branch']);
    });

    await check('no-mixed-mode', () => {
      context.expect(() => loadWebConfig(repositoryRoot)).not.toThrow();
      const root = mkdtempSync(join(tmpdir(), 'mixed-mode-'));
      try {
        writeFileSync(
          join(root, 'web.config.json'),
          JSON.stringify({
            placeholderAssets: [],
            proxyPrefixes: ['/api'],
            defaultDataset: 'platform-openapi-primary',
            routes: { getTrade: { server: 'remote' } },
          }),
        );
        context.expect(() => loadWebConfig(root)).toThrow(/routes/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    await check('agents-statement', () => {
      context.expect(agentsIssues(rootAgents)).toEqual([]);
      context
        .expect(
          agentsIssues(
            rootAgents.replace('Shadow 服务测试与本地预览，均不进入生产产物', 'Shadow 只服务测试'),
          ),
        )
        .toEqual(['root AGENTS must describe Shadow only for tests and local preview']);
    });
  },
);
