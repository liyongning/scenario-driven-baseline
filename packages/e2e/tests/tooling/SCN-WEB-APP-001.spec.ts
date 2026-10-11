import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { runCli } from './engineering-form-fixture.ts';
import { createRepositoryCopy, type RepositoryCopy } from './repository-copy.ts';
import { repositoryRoot } from './helpers.ts';
import { writeAndRestore } from './web-cli-helpers.ts';

type PackageManifest = {
  name: string;
  private: boolean;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const declaredWebPackage = 'packages/web/package.json';

function readPackage(root: string): PackageManifest {
  return JSON.parse(readFileSync(join(root, declaredWebPackage), 'utf8')) as PackageManifest;
}

function architecture(root: RepositoryCopy) {
  return runCli(root, 'scripts/check-architecture.ts', ['--dependency-exit-code', '0']);
}

cliEvidence(
  'SCN-WEB-APP-001',
  'template-alignment-fact',
  [
    'root-config-only',
    'exact-dependencies',
    'workspace-protocol-dependency',
    'template-app-package',
  ],
  async (context, check) => {
    await check('template-app-package', () => {
      const manifest = readPackage(repositoryRoot);
      context.expect(manifest.name).toBe('@daqian/template-web');
      context.expect(manifest.private).toBe(true);
    });
    await check('root-config-only', () => {
      const result = runCli(
        { root: repositoryRoot, env: process.env, cleanup: () => {} },
        'scripts/check-architecture.ts',
      );
      context.expect(result.status, result.output).toBe(0);
      context.expect(result.output).toContain('"issues": []');
    });
    await check('exact-dependencies', () => {
      const manifest = readPackage(repositoryRoot);
      const dependencies = { ...manifest.dependencies, ...(manifest.devDependencies ?? {}) };
      for (const [name, version] of Object.entries(dependencies)) {
        if (version === 'workspace:*') continue;
        context
          .expect(version, `${name} must use an exact version`)
          .toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
      }
      context.expect(dependencies['@vue/devtools-api']).toBe('8.2.1');
    });
    await check('workspace-protocol-dependency', () => {
      context
        .expect(readPackage(repositoryRoot).dependencies['@daqian/template-openapi'])
        .toBe('workspace:*');
    });
  },
  { timeoutMs: 120_000 },
);

cliEvidence(
  'SCN-WEB-APP-001',
  'alignment-violation-cli',
  ['alignment-violation-rejected', 'alignment-restorable'],
  async (context, check) => {
    const copy = createRepositoryCopy({ prefix: 'web-app-001-violation-' });
    const packagePath = join(copy.root, declaredWebPackage);
    const valid = readPackage(copy.root);
    try {
      await check('alignment-violation-rejected', () => {
        writeAndRestore(
          join(copy.root, 'packages/web/eslint.config.js'),
          'export default [];\n',
          () => {
            const result = architecture(copy);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('package-level lint or format configuration');
          },
        );
        writeAndRestore(
          packagePath,
          JSON.stringify(
            { ...valid, dependencies: { ...valid.dependencies, vue: '^3.5.43' } },
            null,
            2,
          ),
          () => {
            const result = architecture(copy);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('vue must use an exact version');
          },
        );
        const withoutDevtools = { ...valid.dependencies };
        delete withoutDevtools['@vue/devtools-api'];
        writeAndRestore(
          packagePath,
          JSON.stringify({ ...valid, dependencies: withoutDevtools }, null, 2),
          () => {
            const result = architecture(copy);
            context.expect(result.status, result.output).not.toBe(0);
            context
              .expect(result.output)
              .toContain('missing explicit dependency @vue/devtools-api');
          },
        );
        writeAndRestore(
          packagePath,
          JSON.stringify(
            {
              ...valid,
              dependencies: { ...valid.dependencies, '@daqian/template-openapi': '^0.1.0' },
            },
            null,
            2,
          ),
          () => {
            const result = architecture(copy);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('workspace dependency');
          },
        );
      });
      await check('alignment-restorable', () => {
        const result = architecture(copy);
        context.expect(result.status, result.output).toBe(0);
        context.expect(result.json?.issues).toEqual([]);
      });
    } finally {
      copy.cleanup();
    }
  },
  { timeoutMs: 120_000 },
);
