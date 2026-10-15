import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createEngineeringFormRoot } from '../../packages/e2e/tests/tooling/engineering-form-fixture.ts';
import {
  bundleManifestPath,
  classifyBundleSource,
  leakedSourceIssues,
  parseBundleManifest,
  relativeAssetIssues,
  type BundleManifest,
} from './bundle-manifest.ts';
import { checkBundle, checkParsedBundle, productDigest } from './bundle.ts';
import { loadProjectManifest, type ManifestPackage } from './project-manifest.ts';

const productDirectory = 'web-product';
const mainSource = `packages/${productDirectory}/src/main.ts`;
const appSource = `packages/${productDirectory}/src/AppRoot/AppRoot.vue`;

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
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
  const manifest = loadProjectManifest(root);
  return {
    formatVersion: 1,
    product: productDirectory,
    entry: mainSource,
    productDigest: productDigest(root, manifest, webProduct(root)),
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
  const path = bundleManifestPath(root, productDirectory);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2));
}

function setup(): ReturnType<typeof createEngineeringFormRoot> & { manifest: BundleManifest } {
  const root = createEngineeringFormRoot();
  writeBuildFiles(root.root);
  const manifest = validManifest(root.root);
  writeManifest(root.root, manifest);
  return Object.assign(root, { manifest });
}

describe('bundle manifest parser', () => {
  test('reports malformed manifest fields', () => {
    const calls = [
      [null, 'must be an object'],
      [{ formatVersion: 2 }, 'formatVersion'],
      [{ formatVersion: 1, product: 'other' }, 'product'],
      [{ formatVersion: 1, product: productDirectory, entry: 1 }, 'entry'],
      [
        { formatVersion: 1, product: productDirectory, entry: 'main.ts', productDigest: 'bad' },
        'productDigest',
      ],
      [
        {
          formatVersion: 1,
          product: productDirectory,
          entry: 'main.ts',
          productDigest: '0'.repeat(64),
          outputs: [],
          modules: [],
        },
        'outputs',
      ],
      [
        {
          formatVersion: 1,
          product: productDirectory,
          entry: 'main.ts',
          productDigest: '0'.repeat(64),
          outputs: [null, { file: 1, sha256: 2 }, { file: '../x', sha256: 'bad' }],
          modules: [null],
        },
        'output',
      ],
      [
        {
          formatVersion: 1,
          product: productDirectory,
          entry: 'main.ts',
          productDigest: '0'.repeat(64),
          outputs: [{ file: 'assets/index.js', sha256: '0'.repeat(64) }],
          modules: [
            { source: 1, dependency: false },
            { source: '../x', dependency: false, outputs: [] },
            { source: 'x.ts', dependency: false, outputs: [1] },
          ],
        },
        'module',
      ],
    ] as const;
    for (const [value, message] of calls)
      expect(parseBundleManifest(value, productDirectory).issues.join('\n')).toContain(message);
  });

  test('returns a parsed manifest for valid input', () => {
    const parsed = parseBundleManifest(
      {
        formatVersion: 1,
        product: productDirectory,
        entry: mainSource,
        productDigest: '0'.repeat(64),
        modules: [{ source: mainSource, dependency: false, outputs: ['assets/index.js'] }],
        outputs: [{ file: 'assets/index.js', sha256: '0'.repeat(64) }],
      },
      productDirectory,
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.manifest?.entry).toBe(mainSource);
  });
});

describe('web bundle boundary check', () => {
  test('accepts a valid manifest and restores after counterexamples', () => {
    const root = setup();
    try {
      expect(checkBundle(root.root)).toEqual({
        checked: [`packages/${productDirectory}`],
        issues: [],
      });
      const path = bundleManifestPath(root.root, productDirectory);

      writeManifest(root.root, { ...root.manifest, modules: [] });
      expect(checkBundle(root.root).issues.join('\n')).toContain('modules must be non-empty');

      writeManifest(root.root, {
        ...root.manifest,
        modules: [
          ...root.manifest.modules,
          {
            source: `packages/${productDirectory}/src/missing.ts`,
            dependency: false,
            outputs: ['assets/index.js'],
          },
        ],
      });
      expect(checkBundle(root.root).issues.join('\n')).toContain(
        'neither handwritten source nor dependency',
      );

      writeManifest(root.root, { ...root.manifest, entry: 'packages/web/src/missing.ts' });
      expect(checkBundle(root.root).issues.join('\n')).toContain('entry');

      writeManifest(root.root, {
        ...root.manifest,
        modules: root.manifest.modules.map((module) =>
          module.source === mainSource ? { ...module, dependency: true } : module,
        ),
      });
      expect(checkBundle(root.root).issues.join('\n')).toContain(
        'is not handwritten product source',
      );

      const withoutOutput = root.manifest.outputs.filter(
        (output) => output.file !== 'assets/index.js',
      );
      writeManifest(root.root, { ...root.manifest, outputs: withoutOutput });
      expect(checkBundle(root.root).issues.join('\n')).toContain('is not recorded');

      rmSync(join(root.root, 'packages', productDirectory, 'dist/assets/index.js'));
      writeManifest(root.root, root.manifest);
      expect(checkBundle(root.root).issues.join('\n')).toContain('is missing from');

      writeBuildFiles(root.root, { html: '<script src="/assets/index.js"></script>\n' });
      expect(checkBundle(root.root).issues.join('\n')).toContain('resource is not relative');

      writeBuildFiles(root.root, { css: ':global(.x) {}\n' });
      const css = readFileSync(
        join(root.root, 'packages', productDirectory, 'dist/assets/index.css'),
      );
      const cssOutput = root.manifest.outputs.map((output) =>
        output.file === 'assets/index.css' ? { ...output, sha256: digest(css) } : output,
      );
      writeManifest(root.root, { ...root.manifest, outputs: cssOutput });
      expect(checkBundle(root.root).issues.join('\n')).toContain(':global(');

      writeBuildFiles(root.root);
      writeManifest(root.root, {
        ...root.manifest,
        modules: [
          ...root.manifest.modules,
          {
            source: `packages/${productDirectory}/src/features/shadow/Card.vue`,
            dependency: false,
            outputs: ['assets/index.js'],
          },
        ],
      });
      write(
        join(root.root, `packages/${productDirectory}/src/features/shadow/Card.vue`),
        '<template />\n',
      );
      const manifest = loadProjectManifest(root.root);
      writeManifest(root.root, {
        ...root.manifest,
        productDigest: productDigest(root.root, manifest, webProduct(root.root)),
      });
      expect(checkBundle(root.root).issues).toEqual([]);

      expect(readFileSync(path, 'utf8')).toContain('packages/web-product/src/main.ts');
    } finally {
      root.cleanup();
    }
  });

  test('rejects test infrastructure and contract modules by exact source path', () => {
    const root = setup();
    try {
      const manifest = loadProjectManifest(root.root);
      expect(
        classifyBundleSource(root.root, manifest, {
          source: 'packages/sample-test/src/not-shadow.ts',
          dependency: false,
        }),
      ).toBe('test-infrastructure');
      expect(
        classifyBundleSource(root.root, manifest, {
          source: 'packages/web-protocol/testing/adapter.ts',
          dependency: false,
        }),
      ).toBe('test-infrastructure');
      expect(
        classifyBundleSource(root.root, manifest, {
          source: 'packages/web-protocol/testing/contract.bundle.json',
          dependency: false,
        }),
      ).toBe('contract');
      const withContract = {
        ...manifest,
        packages: manifest.packages.map((item) =>
          item.directory === 'web-protocol'
            ? {
                ...item,
                contract: {
                  file: 'packages/web-protocol/contracts/api.yaml',
                  lock: 'packages/web-protocol/contracts/api.lock.json',
                },
              }
            : item,
        ),
      };
      expect(
        classifyBundleSource(root.root, withContract, {
          source: 'packages/web-protocol/contracts/api.yaml',
          dependency: false,
        }),
      ).toBe('contract');
      expect(
        classifyBundleSource(root.root, manifest, {
          source: 'node_modules/vue/index.js',
          dependency: true,
        }),
      ).toBe('dependency');
      expect(
        classifyBundleSource(root.root, manifest, {
          source: `packages/${productDirectory}/dist/assets/index.js`,
          dependency: true,
        }),
      ).toBe('dependency');
      expect(
        classifyBundleSource(root.root, manifest, {
          source: `packages/${productDirectory}/src/runtime/not-in-inventory.ts`,
          dependency: true,
        }),
      ).toBe('unknown');

      const withoutTestPackage = {
        ...manifest,
        packages: manifest.packages.filter((item) => item.role !== 'test'),
      };
      expect(
        classifyBundleSource(root.root, withoutTestPackage, {
          source: 'node_modules/vue/index.js',
          dependency: true,
        }),
      ).toBe('dependency');

      write(
        join(root.root, `packages/${productDirectory}/src/features/shadow/Card.vue`),
        '<template />\n',
      );
      expect(
        classifyBundleSource(root.root, manifest, {
          source: `packages/${productDirectory}/src/features/shadow/Card.vue`,
          dependency: false,
        }),
      ).toBe('handwritten');
    } finally {
      root.cleanup();
    }
  });

  test('locates leaked manifests, source paths and missing dist html', () => {
    const root = setup();
    try {
      const dist = join(root.root, 'packages', productDirectory, 'dist');
      write(join(dist, 'bundle-manifest.json'), '{}\n');
      write(
        join(dist, 'assets/index.js'),
        'bundle-manifest.json packages/web-product/src/leaked.ts\n',
      );
      expect(checkBundle(root.root).issues.join('\n')).toContain('must live outside dist');
      expect(checkBundle(root.root).issues.join('\n')).toContain('contains bundle manifest path');
      expect(checkBundle(root.root).issues.join('\n')).toContain('leaks source path');
      write(bundleManifestPath(root.root, productDirectory), '{invalid json\n');
      expect(checkBundle(root.root).issues.join('\n')).toContain('is not valid JSON');
      writeManifest(root.root, root.manifest);
      rmSync(bundleManifestPath(root.root, productDirectory));
      expect(leakedSourceIssues(root.root, dist, productDirectory).join('\n')).toContain(
        'bundle manifest is not outside dist',
      );
      rmSync(join(dist, 'index.html'));
      expect(relativeAssetIssues(dist).join('\n')).toContain('dist/index.html is missing');
    } finally {
      root.cleanup();
    }
  });

  test('rejects contract modules in a parsed manifest', () => {
    const root = setup();
    try {
      const product = webProduct(root.root);
      const manifest = loadProjectManifest(root.root);
      const value = {
        ...root.manifest,
        modules: [
          ...root.manifest.modules,
          {
            source: 'packages/web-protocol/testing/contract.bundle.json',
            dependency: false,
            outputs: ['assets/index.js'],
          },
        ],
      };
      expect(checkParsedBundle(root.root, manifest, product, value).join('\n')).toContain(
        'protocol contract',
      );
    } finally {
      root.cleanup();
    }
  });

  test('rejects test infrastructure modules in a parsed manifest', () => {
    const root = setup();
    try {
      const product = webProduct(root.root);
      const manifest = loadProjectManifest(root.root);
      const value = {
        ...root.manifest,
        modules: [
          ...root.manifest.modules,
          {
            source: 'packages/sample-test/src/leaked.ts',
            dependency: false,
            outputs: ['assets/index.js'],
          },
        ],
      };
      expect(checkParsedBundle(root.root, manifest, product, value).join('\n')).toContain(
        'test infrastructure module',
      );
    } finally {
      root.cleanup();
    }
  });
});

describe('bundle product digest', () => {
  test('requires one product binding with a protocol package', () => {
    const root = createEngineeringFormRoot();
    try {
      const product = webProduct(root.root);
      const manifest = loadProjectManifest(root.root);
      expect(() => productDigest(root.root, { ...manifest, bindings: [] }, product)).toThrow(
        /has no binding/,
      );
      expect(() =>
        productDigest(
          root.root,
          {
            ...manifest,
            packages: manifest.packages.filter((item) => item.role !== 'protocol'),
          },
          product,
        ),
      ).toThrow(/has no protocol package/);
    } finally {
      root.cleanup();
    }
  });

  test('tracks product, protocol and build inputs but not tests, gates or ignored files', () => {
    const root = createEngineeringFormRoot();
    try {
      const manifestPath = join(root.root, 'project.manifest.json');
      const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        fingerprints: { buildInputs: string[] };
      };
      raw.fingerprints.buildInputs = ['.env*', 'pnpm-lock.yaml'];
      writeFileSync(manifestPath, JSON.stringify(raw, null, 2));
      write(join(root.root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      write(join(root.root, '.gitignore'), '.env.local\n');
      write(join(root.root, '.env.local'), 'TOKEN=fixture\n');
      const initial = productDigest(
        root.root,
        loadProjectManifest(root.root),
        webProduct(root.root),
      );

      write(
        join(root.root, `packages/${productDirectory}/tests/type-check.test.ts`),
        'export const changed = true;\n',
      );
      expect(productDigest(root.root, loadProjectManifest(root.root), webProduct(root.root))).toBe(
        initial,
      );
      write(join(root.root, 'scripts/check-bundle.ts'), 'export const changed = true;\n');
      expect(productDigest(root.root, loadProjectManifest(root.root), webProduct(root.root))).toBe(
        initial,
      );

      const sourcePath = join(root.root, `packages/${productDirectory}/src/main.ts`);
      const source = readFileSync(sourcePath, 'utf8');
      writeFileSync(sourcePath, `${source}\n`);
      const productChanged = productDigest(
        root.root,
        loadProjectManifest(root.root),
        webProduct(root.root),
      );
      expect(productChanged).not.toBe(initial);
      writeFileSync(sourcePath, source);

      const protocolPath = join(root.root, 'packages/web-protocol/src/index.ts');
      const protocol = readFileSync(protocolPath, 'utf8');
      writeFileSync(protocolPath, `${protocol}\n`);
      const protocolChanged = productDigest(
        root.root,
        loadProjectManifest(root.root),
        webProduct(root.root),
      );
      expect(protocolChanged).not.toBe(initial);
      writeFileSync(protocolPath, protocol);

      const lockPath = join(root.root, 'pnpm-lock.yaml');
      writeFileSync(lockPath, 'lockfileVersion: 9\nchanged: true\n');
      expect(
        productDigest(root.root, loadProjectManifest(root.root), webProduct(root.root)),
      ).not.toBe(initial);
      writeFileSync(lockPath, 'lockfileVersion: 9\n');

      write(join(root.root, '.env.local'), 'TOKEN=fixture-2\n');
      expect(productDigest(root.root, loadProjectManifest(root.root), webProduct(root.root))).toBe(
        initial,
      );
    } finally {
      root.cleanup();
    }
  });
});
