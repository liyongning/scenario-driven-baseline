import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { repositoryRoot } from './helpers.ts';

const require = createRequire(import.meta.url);

function filesUnder(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path.slice(root.length + 1));
    }
  };
  visit(root);
  return files;
}

cliEvidence(
  'SCN-OPENAPI-CONTRACT-027',
  'openapi-package-shape',
  [
    'dual-format',
    'root-named-export',
    'no-extra-entry',
    'consumers-use-dist',
    'not-in-release-plan',
  ],
  async (context, check) => {
    const manifest = JSON.parse(
      readFileSync(join(repositoryRoot, 'project.manifest.json'), 'utf8'),
    ) as {
      packages: Array<{
        directory: string;
        name: string;
        role: string;
        form?: string;
        protocolKind?: string;
      }>;
      bindings: Array<{ product: string; protocol: string }>;
    };
    const openapi = manifest.packages.find(
      (pkg) => pkg.role === 'protocol' && pkg.protocolKind === 'openapi',
    )!;
    const openapiRoot = join(repositoryRoot, 'packages', openapi.directory);
    const built = spawnSync('pnpm', ['--filter', openapi.name, 'build'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    context.expect(built.status, `${built.stdout}${built.stderr}`).toBe(0);
    const packageJson = JSON.parse(readFileSync(join(openapiRoot, 'package.json'), 'utf8')) as {
      files: string[];
      exports: Record<string, unknown>;
    };
    await check('dual-format', () => {
      for (const file of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts'])
        context.expect(existsSync(join(openapiRoot, 'dist', file)), file).toBe(true);
      context.expect(packageJson.files).toEqual(['dist']);
    });

    await check('root-named-export', async () => {
      const esm = (await import(pathToFileURL(join(openapiRoot, 'dist/index.js')).href)) as Record<
        string,
        unknown
      >;
      const cjs = require(join(openapiRoot, 'dist/index.cjs')) as Record<string, unknown>;
      for (const exports of [esm, cjs]) {
        context.expect(typeof exports.createFetchHttp).toBe('function');
        context.expect(typeof exports.createRestClient).toBe('function');
      }
    });

    await check('no-extra-entry', () => {
      context.expect(Object.keys(packageJson.exports)).toEqual(['.', './generated/*']);
      const files = filesUnder(join(openapiRoot, 'dist'));
      context
        .expect(files.filter((file) => /(?:^|\/)(?:testing|adapter)(?:\/|\.|$)/.test(file)))
        .toEqual([]);
    });

    await check('consumers-use-dist', () => {
      context
        .expect(import.meta.resolve(openapi.name))
        .toContain(`/packages/${openapi.directory}/dist/index.js`);
      const runner = readFileSync(join(openapiRoot, 'testing/browser-runner.ts'), 'utf8');
      context.expect(runner).toContain(`from '${openapi.name}'`);
      context.expect(runner).not.toContain(`packages/${openapi.directory}/src`);
    });

    await check('not-in-release-plan', () => {
      const products = new Map(manifest.packages.map((pkg) => [pkg.directory, pkg]));
      const openapiBindings = manifest.bindings.filter(
        (binding) => binding.protocol === openapi.directory,
      );
      context.expect(openapiBindings.length).toBeGreaterThan(0);
      context
        .expect(
          openapiBindings.every((binding) => products.get(binding.product)?.form === 'web-app'),
        )
        .toBe(true);
      context
        .expect(openapiBindings.filter((binding) => products.get(binding.product)?.form === 'sdk'))
        .toEqual([]);
    });
  },
  { timeoutMs: 60_000 },
);
