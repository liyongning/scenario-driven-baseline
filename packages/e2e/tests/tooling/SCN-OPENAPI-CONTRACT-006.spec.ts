import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { defineCase } from '../../src/cases/define-case.ts';
import { writeOpenApiRoot, repositoryRoot } from './openapi-contract-fixture.ts';

function filesBelow(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(path));
    else result.push(path);
  }
  return result;
}

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-006',
    caseId: 'production-graph-check',
    fixtureCase: 'production-graph-check',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-006',
        caseKey: 'production-graph-check',
        checks: [
          'contract-not-in-import-graph',
          'contract-not-in-dist',
          'bundle-in-testing-only',
          'violation-blocked',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await checkpoint('contract-not-in-import-graph', () => {
      const result = spawnSync(
        join(repositoryRoot, 'node_modules/.bin/depcruise'),
        [
          '--config',
          join(repositoryRoot, '.dependency-cruiser.cjs'),
          '--output-type',
          'err-long',
          'packages/openapi/src',
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      );
      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toContain('contract.bundle.json');
    });
    await checkpoint('contract-not-in-dist', () => {
      const build = spawnSync('pnpm', ['--filter', '@daqian/template-openapi', 'build'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      });
      expect(build.status).toBe(0);
      const dist = join(repositoryRoot, 'packages/openapi/dist');
      const production = filesBelow(dist)
        .map((path) => readFileSync(path, 'utf8'))
        .join('\n');
      expect(production).not.toContain('Neutral trade example');
      expect(production).not.toContain('Create a virtual trade');
    });
    await checkpoint('bundle-in-testing-only', () => {
      const bundle = join(repositoryRoot, 'packages/openapi/testing/contract.bundle.json');
      expect(readFileSync(bundle, 'utf8')).toContain('Neutral trade example');
      const openapiFiles = filesBelow(join(repositoryRoot, 'packages/openapi'))
        .filter((path) => path.endsWith('contract.bundle.json'))
        .map((path) => path.slice(join(repositoryRoot, 'packages/openapi').length + 1));
      expect(openapiFiles).toEqual(['testing/contract.bundle.json']);
    });
    await checkpoint('violation-blocked', () => {
      const fixture = writeOpenApiRoot();
      try {
        const source = join(fixture.root, 'packages/openapi/src/violation.ts');
        mkdirSync(dirname(source), { recursive: true });
        writeFileSync(
          source,
          "import bundle from '../testing/contract.bundle.json';\nvoid bundle;\n",
        );
        mkdirSync(join(fixture.root, 'packages/openapi/testing'), { recursive: true });
        writeFileSync(join(fixture.root, 'packages/openapi/testing/contract.bundle.json'), '{}\n');
        const result = spawnSync(
          join(repositoryRoot, 'node_modules/.bin/depcruise'),
          [
            '--config',
            join(repositoryRoot, '.dependency-cruiser.cjs'),
            '--output-type',
            'err-long',
            'packages/openapi/src',
          ],
          { cwd: fixture.root, encoding: 'utf8' },
        );
        expect(result.status).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('production-no-test');
        expect(`${result.stdout}${result.stderr}`).toContain('violation.ts');
      } finally {
        fixture.cleanup();
      }
    });
  },
  { timeoutMs: 60_000 },
);
