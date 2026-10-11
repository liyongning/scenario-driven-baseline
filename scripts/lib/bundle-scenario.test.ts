import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { createEngineeringFormRoot } from '../../packages/e2e/tests/tooling/engineering-form-fixture.ts';
import { bundleManifestPath, type BundleManifest } from './bundle-manifest.ts';
import { checkBundle, productDigest } from './bundle.ts';
import { loadProjectManifest, type ManifestPackage } from './project-manifest.ts';

const productDirectory = 'web-product';
const mainSource = `packages/${productDirectory}/src/main.ts`;
const appSource = `packages/${productDirectory}/src/AppRoot/AppRoot.vue`;

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function evidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (context: TestContext, check: (name: string, assertion: () => void) => void) => void,
): void {
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
      body(context, (name, assertion) => {
        assertion();
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

function webProduct(root: string): ManifestPackage {
  const product = loadProjectManifest(root).packages.find(
    (item) => item.form === 'web-app' && item.directory === productDirectory,
  );
  if (!product) throw new Error('fixture has no web product');
  return product;
}

function write(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function writeBuildFiles(
  root: string,
  options: Readonly<{ html?: string; js?: string; css?: string }> = {},
): void {
  const dist = join(root, 'packages', productDirectory, 'dist');
  write(join(dist, 'index.html'), options.html ?? '<script src="./assets/index.js"></script>\n');
  write(join(dist, 'assets/index.js'), options.js ?? 'console.log("web");\n');
  write(join(dist, 'assets/index.css'), options.css ?? '.root { display: block; }\n');
}

function validManifest(root: string): BundleManifest {
  const dist = join(root, 'packages', productDirectory, 'dist');
  return {
    formatVersion: 1,
    product: productDirectory,
    entry: mainSource,
    productDigest: productDigest(root, loadProjectManifest(root), webProduct(root)),
    modules: [
      { source: mainSource, dependency: false, outputs: ['assets/index.js'] },
      {
        source: appSource,
        dependency: false,
        outputs: ['assets/index.js', 'assets/index.css'],
      },
      {
        source: 'node_modules/vue/dist/vue.runtime.esm-bundler.js',
        dependency: true,
        outputs: ['assets/index.js'],
      },
    ],
    outputs: [
      { file: 'assets/index.js', sha256: digest(readFileSync(join(dist, 'assets/index.js'))) },
      { file: 'assets/index.css', sha256: digest(readFileSync(join(dist, 'assets/index.css'))) },
    ],
  };
}

function writeManifest(root: string, manifest: BundleManifest): void {
  write(bundleManifestPath(root, productDirectory), `${JSON.stringify(manifest, null, 2)}\n`);
}

function setup(): ReturnType<typeof createEngineeringFormRoot> & { manifest: BundleManifest } {
  const root = createEngineeringFormRoot();
  writeBuildFiles(root.root);
  const manifest = validManifest(root.root);
  writeManifest(root.root, manifest);
  return Object.assign(root, { manifest });
}

evidence(
  'SCN-WEB-APP-012',
  'bundle-reconcile-rules',
  ['modules-reconciled', 'entry-and-relative-assets', 'bundle-violation-located'],
  (context, check) => {
    const root = setup();
    try {
      check('modules-reconciled', () => {
        writeManifest(root.root, { ...root.manifest, modules: [] });
        context
          .expect(checkBundle(root.root).issues.join('\n'))
          .toContain('modules must be non-empty');
        writeManifest(root.root, {
          ...root.manifest,
          modules: [
            ...root.manifest.modules,
            {
              source: `packages/${productDirectory}/src/unknown.ts`,
              dependency: false,
              outputs: ['assets/index.js'],
            },
          ],
        });
        context
          .expect(checkBundle(root.root).issues.join('\n'))
          .toContain('neither handwritten source nor dependency');
      });
      check('entry-and-relative-assets', () => {
        writeManifest(root.root, {
          ...root.manifest,
          modules: root.manifest.modules.filter((module) => module.source !== mainSource),
        });
        context.expect(checkBundle(root.root).issues.join('\n')).toContain('entry');
        writeBuildFiles(root.root, { html: '<script src="/assets/index.js"></script>\n' });
        writeManifest(root.root, root.manifest);
        context
          .expect(checkBundle(root.root).issues.join('\n'))
          .toContain('resource is not relative');
      });
      check('bundle-violation-located', () => {
        writeBuildFiles(root.root);
        writeManifest(root.root, root.manifest);
        context.expect(checkBundle(root.root)).toEqual({
          checked: [`packages/${productDirectory}`],
          issues: [],
        });
      });
    } finally {
      root.cleanup();
    }
  },
);

evidence(
  'SCN-WEB-APP-013',
  'bundle-boundary-rules',
  ['test-infra-by-source', 'contract-excluded', 'css-residue-rejected'],
  (context, check) => {
    const root = setup();
    try {
      check('test-infra-by-source', () => {
        const manifest = loadProjectManifest(root.root);
        for (const source of [
          'packages/sample-test/src/leaked.ts',
          'packages/web-protocol/testing/adapter.ts',
          'packages/sample-test/tests/fixtures/leaked.ts',
        ]) {
          writeManifest(root.root, {
            ...root.manifest,
            modules: [
              ...root.manifest.modules,
              { source, dependency: false, outputs: ['assets/index.js'] },
            ],
          });
          context.expect(checkBundle(root.root).issues.join('\n')).toContain(source);
        }

        const shadow = `packages/${productDirectory}/src/features/shadow/Card.vue`;
        write(join(root.root, shadow), '<template><p>shadow</p></template>\n');
        writeManifest(root.root, {
          ...root.manifest,
          modules: [
            ...root.manifest.modules,
            { source: shadow, dependency: false, outputs: ['assets/index.js'] },
          ],
          productDigest: productDigest(root.root, manifest, webProduct(root.root)),
        });
        context.expect(checkBundle(root.root).issues).toEqual([]);
        rmSync(join(root.root, shadow));
      });
      check('contract-excluded', () => {
        const path = 'packages/web-protocol/testing/contract.bundle.json';
        write(join(root.root, path), '{}\n');
        const manifest = loadProjectManifest(root.root);
        writeManifest(root.root, {
          ...root.manifest,
          modules: [
            ...root.manifest.modules,
            { source: path, dependency: false, outputs: ['assets/index.js'] },
          ],
          productDigest: productDigest(root.root, manifest, webProduct(root.root)),
        });
        context.expect(checkBundle(root.root).issues.join('\n')).toContain('protocol contract');
        rmSync(join(root.root, path));
      });
      check('css-residue-rejected', () => {
        for (const residue of [':deep(', ':slotted(', ':global(']) {
          writeBuildFiles(root.root, { css: `${residue}.x) {}\n` });
          const css = readFileSync(
            join(root.root, 'packages', productDirectory, 'dist/assets/index.css'),
          );
          writeManifest(root.root, {
            ...root.manifest,
            outputs: root.manifest.outputs.map((output) =>
              output.file === 'assets/index.css' ? { ...output, sha256: digest(css) } : output,
            ),
          });
          context.expect(checkBundle(root.root).issues.join('\n')).toContain(residue);
        }
        writeBuildFiles(root.root);
        writeManifest(root.root, root.manifest);
        context.expect(checkBundle(root.root).issues).toEqual([]);
      });
    } finally {
      root.cleanup();
    }
  },
);

evidence(
  'SCN-WEB-APP-014',
  'digest-scope-rules',
  ['digest-scope', 'ignored-inputs-excluded'],
  (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      writeBuildFiles(root.root);
      const manifestPath = join(root.root, 'project.manifest.json');
      const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        fingerprints: { buildInputs: string[] };
      };
      raw.fingerprints.buildInputs = ['.env*', 'pnpm-lock.yaml'];
      writeFileSync(manifestPath, JSON.stringify(raw, null, 2));
      write(join(root.root, '.gitignore'), '.env.local\n');
      write(join(root.root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      const manifest = loadProjectManifest(root.root);
      const initial = productDigest(root.root, manifest, webProduct(root.root));
      writeManifest(root.root, { ...validManifest(root.root), productDigest: initial });

      check('digest-scope', () => {
        const testPath = join(root.root, `packages/${productDirectory}/tests/type-check.test.ts`);
        const testSource = readFileSync(testPath, 'utf8');
        writeFileSync(testPath, `${testSource}\n`);
        context.expect(productDigest(root.root, manifest, webProduct(root.root))).toBe(initial);
        writeFileSync(testPath, testSource);

        const sourcePath = join(root.root, `packages/${productDirectory}/src/main.ts`);
        const source = readFileSync(sourcePath, 'utf8');
        writeFileSync(sourcePath, `${source}\n`);
        context.expect(productDigest(root.root, manifest, webProduct(root.root))).not.toBe(initial);
        writeFileSync(sourcePath, source);

        const protocolPath = join(root.root, 'packages/web-protocol/src/index.ts');
        const protocol = readFileSync(protocolPath, 'utf8');
        writeFileSync(protocolPath, `${protocol}\n`);
        context.expect(productDigest(root.root, manifest, webProduct(root.root))).not.toBe(initial);
        writeFileSync(protocolPath, protocol);

        const lockPath = join(root.root, 'pnpm-lock.yaml');
        writeFileSync(lockPath, 'lockfileVersion: 9\nchanged: true\n');
        context.expect(productDigest(root.root, manifest, webProduct(root.root))).not.toBe(initial);
        writeFileSync(lockPath, 'lockfileVersion: 9\n');
      });
      check('ignored-inputs-excluded', () => {
        write(join(root.root, '.env.local'), 'TOKEN=fixture\n');
        context.expect(productDigest(root.root, manifest, webProduct(root.root))).toBe(initial);
        context.expect(checkBundle(root.root).issues).toEqual([]);
      });
    } finally {
      root.cleanup();
    }
  },
);
