import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createControlledRoot } from './controlled-root.ts';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { repositoryRoot } from './helpers.ts';
import {
  loadProjectManifest,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import { planCommand } from '../../../../scripts/run-by-manifest.ts';
import { productDigest, writeBundleManifest } from '../../../../scripts/lib/bundle.ts';
import { writeProtocolManifest } from '../../../../scripts/lib/protocol-manifest.ts';
import { assertProductBundleFresh, assertProtocolBundleFresh } from '../../src/hosts/freshness.ts';
import { loadWebConfig } from '../../src/hosts/web-config.ts';

const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lockfile = readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
const rootAgents = readFileSync(join(repositoryRoot, 'AGENTS.md'), 'utf8');
const e2eAgents = readFileSync(join(repositoryRoot, 'packages/e2e/AGENTS.md'), 'utf8');

cliEvidence(
  'SCN-BROWSER-PLATFORM-002',
  'browser-dependency-check',
  ['exact-version', 'no-playwright-test', 'install-documented', 'rule-11-extended'],
  async (context, check) => {
    const baseline = {
      packageJson,
      lockfile,
      rootAgents,
      e2eAgents,
    };
    await check('exact-version', () => {
      context.expect(browserDependencyIssues(baseline)).toEqual([]);
      context.expect(packageJson.devDependencies?.playwright).toBe('1.63.0');
      context.expect(lockfile).toMatch(/playwright:\s*\n\s+specifier: 1\.63\.0/);
      context
        .expect(
          browserDependencyIssues({
            ...baseline,
            packageJson: {
              ...packageJson,
              devDependencies: { ...packageJson.devDependencies, playwright: '^1.63.0' },
            },
          }),
        )
        .toContain('playwright must use exact version 1.63.0');
    });
    await check('no-playwright-test', () => {
      context.expect(packageJson.dependencies?.['@playwright/test']).toBeUndefined();
      context.expect(packageJson.devDependencies?.['@playwright/test']).toBeUndefined();
      context.expect(lockfile).not.toContain('@playwright/test');
      context
        .expect(
          browserDependencyIssues({
            ...baseline,
            packageJson: {
              ...packageJson,
              devDependencies: { ...packageJson.devDependencies, '@playwright/test': '1.63.0' },
            },
          }),
        )
        .toContain('@playwright/test must not be used');
    });
    await check('install-documented', () => {
      context.expect(e2eAgents).toContain('pnpm exec playwright install chromium');
      context
        .expect(
          browserDependencyIssues({
            ...baseline,
            e2eAgents: e2eAgents.replace('pnpm exec playwright install chromium', ''),
          }),
        )
        .toContain('e2e AGENTS must document Chromium installation');
    });
    await check('rule-11-extended', () => {
      context.expect(rootAgents).toMatch(/浏览器自动化.*Playwright/);
      context
        .expect(
          browserDependencyIssues({
            ...baseline,
            rootAgents: rootAgents.replace(/浏览器自动化.*Playwright/u, '仅小程序自动化'),
          }),
        )
        .toContain('root AGENTS rule 11 must cover browser automation');
    });
  },
);

cliEvidence(
  'SCN-BROWSER-PLATFORM-007',
  'freshness-host-start',
  [
    'fresh-accepted',
    'source-change-rejected',
    'manifest-missing-rejected',
    'protocol-host-stale-rejected',
  ],
  async (context, check) => {
    const fixture = freshnessFixture();
    try {
      const manifest = loadProjectManifest(fixture.root);
      await check('fresh-accepted', () => {
        context.expect(() => assertProductBundleFresh(fixture.root, 'web')).not.toThrow();
        context.expect(() => assertProtocolBundleFresh(fixture.root, 'openapi')).not.toThrow();
      });
      await check('source-change-rejected', () => {
        writeFileSync(join(fixture.root, 'packages/web/src/main.ts'), 'export const value = 2;\n');
        context.expect(() => assertProductBundleFresh(fixture.root, 'web')).toThrow(/过期|stale/);
      });
      await check('manifest-missing-rejected', () => {
        const product = manifest.packages.find((item) => item.directory === 'web')!;
        writeFileSync(join(fixture.root, 'packages/web/src/main.ts'), 'export const value = 1;\n');
        context.expect(() => assertProductBundleFresh(fixture.root, 'web')).not.toThrow();
        rmSync(join(fixture.root, 'artifacts/build/web/bundle-manifest.json'));
        context
          .expect(() => assertProductBundleFresh(fixture.root, 'web'))
          .toThrow(/先执行 pnpm build/);
        writeBundleManifest(
          fixture.root,
          manifest,
          product,
          bundleManifestFor(fixture.root, manifest, product.directory),
        );
      });
      await check('protocol-host-stale-rejected', () => {
        writeFileSync(
          join(fixture.root, 'packages/openapi/src/index.ts'),
          'export const value = 2;\n',
        );
        context
          .expect(() => assertProtocolBundleFresh(fixture.root, 'openapi'))
          .toThrow(/产物已过期.*pnpm build/);
      });
    } finally {
      fixture.cleanup();
    }
  },
  { timeoutMs: 30_000 },
);

cliEvidence(
  'SCN-BROWSER-PLATFORM-009',
  'harness-single-source',
  ['single-implementation'],
  async (context, check) => {
    await check('single-implementation', () => {
      const actual = harnessImplementations(testSources());
      context.expect(actual).toEqual([]);
      context
        .expect(
          harnessImplementations({
            'packages/e2e/tests/web-openapi-browser/rogue.ts': `export function ${[
              'waitForCalls',
            ].join('')}() {}\n`,
          }),
        )
        .toEqual(['packages/e2e/tests/web-openapi-browser/rogue.ts']);
      const browser = readFileSync(
        join(
          repositoryRoot,
          'packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts',
        ),
        'utf8',
      );
      context.expect(browser).toContain("from '../../src/harness.ts'");
    });
  },
);

cliEvidence(
  'SCN-BROWSER-PLATFORM-010',
  'browser-case-layout',
  ['binding-directory', 'known-behaviors-documented'],
  async (context, check) => {
    await check('binding-directory', () => {
      context.expect(browserEnvironmentIssues(testSources())).toEqual([]);
      context
        .expect(
          browserEnvironmentIssues({
            'packages/e2e/tests/sdk-idl-weapp/rogue.spec.ts': `defineCase({ environment: '${'bro'}${'wser'}' }, () => {});\n`,
          }),
        )
        .toEqual(['packages/e2e/tests/sdk-idl-weapp/rogue.spec.ts']);
    });
    await check('known-behaviors-documented', () => {
      const section = e2eAgents.slice(e2eAgents.indexOf('### 浏览器自动化的注意事项'));
      for (const phrase of ['aria-disabled', '自动滚动', '真实按键', 'scroll anchoring'])
        context.expect(section).toContain(phrase);
      context
        .expect(browserDocumentationIssues(section.replace('scroll anchoring', '')))
        .toContain('missing browser behavior scroll anchoring');
    });
  },
);

cliEvidence(
  'SCN-BROWSER-PLATFORM-011',
  'browser-project-manifest',
  ['project-registered', 'command-composed', 'binding-platform', 'registration-errors'],
  async (context, check) => {
    const manifest = loadProjectManifest(repositoryRoot);
    const browser = manifest.testProjects.find((item) => item.name === 'browser');
    await check('project-registered', () => {
      context.expect(browser).toEqual({
        name: 'browser',
        class: 'platform',
        config: 'packages/e2e/vitest.config.browser.ts',
      });
    });
    await check('command-composed', () => {
      context
        .expect(packageJson.scripts['test:e2e:browser'])
        .toBe('tsx scripts/run-by-manifest.ts test:e2e:browser');
      context.expect(planCommand(repositoryRoot, 'test:e2e:browser')).toEqual([
        {
          command: 'vitest',
          args: ['run', '--project', 'browser'],
          env: {
            VERIFY_REPORT_FILE: resolve(
              repositoryRoot,
              `artifacts/${process.env.VERIFY_RUN_ID ?? 'local'}/reports/browser.json`,
            ),
          },
        },
      ]);
    });
    await check('binding-platform', () => {
      context
        .expect(manifest.bindings.find((item) => item.name === 'web-openapi-browser')?.platforms)
        .toEqual(['browser']);
    });
    await check('registration-errors', () => {
      context.expect(browserRegistrationIssues(manifest)).toEqual([]);
      context
        .expect(
          browserRegistrationIssues({
            ...manifest,
            testProjects: manifest.testProjects.filter((item) => item.name !== 'browser'),
          }),
        )
        .toContain('missing browser project');
      context
        .expect(
          browserRegistrationIssues({
            ...manifest,
            requiredCommands: manifest.requiredCommands.filter(
              (command) => command !== 'test:e2e:browser',
            ),
          }),
        )
        .toContain('missing test:e2e:browser command');
      context
        .expect(
          browserRegistrationIssues({
            ...manifest,
            testProjects: manifest.testProjects.map((item) =>
              item.name === 'browser' ? { ...item, class: 'integration' as const } : item,
            ),
          }),
        )
        .toContain('browser project must be platform class');
    });
  },
);

cliEvidence(
  'SCN-BROWSER-PLATFORM-016',
  'host-layout-check',
  ['logic-in-src', 'config-schema-valid', 'config-violation-located', 'host-layout-restorable'],
  async (context, check) => {
    const schema = JSON.parse(
      readFileSync(join(repositoryRoot, 'packages/e2e/host/web.config.schema.json'), 'utf8'),
    ) as unknown;
    await check('logic-in-src', () => {
      context.expect(hostLogicIssues(repositoryRoot)).toEqual([]);
      const fixture = createControlledRoot({
        files: { 'packages/e2e/host/rogue.ts': 'export const rogue = true;\n' },
      });
      try {
        context.expect(hostLogicIssues(fixture.root)).toContain('packages/e2e/host/rogue.ts');
      } finally {
        fixture.cleanup();
      }
    });
    await check('config-schema-valid', () => {
      context.expect(() => loadWebConfig(repositoryRoot)).not.toThrow();
      context.expect(schemaDescriptionIssues(schema)).toEqual([]);
      const schemaCopy = structuredClone(schema) as {
        properties: { placeholderAssets: { description?: string } };
      };
      delete schemaCopy.properties.placeholderAssets.description;
      context
        .expect(schemaDescriptionIssues(schemaCopy))
        .toContain('placeholderAssets missing Chinese description');
    });
    await check('config-violation-located', () => {
      const fixture = createControlledRoot({
        files: { 'web.config.json': JSON.stringify({ placeholderAssets: [], unexpected: true }) },
      });
      try {
        context.expect(() => loadWebConfig(fixture.root)).toThrow(/unexpected/);
      } finally {
        fixture.cleanup();
      }
    });
    await check('host-layout-restorable', () => {
      const fixture = createControlledRoot({
        files: {
          'web.config.json': readFileSync(
            join(repositoryRoot, 'packages/e2e/host/web.config.json'),
            'utf8',
          ),
        },
      });
      try {
        context.expect(() => loadWebConfig(fixture.root)).not.toThrow();
      } finally {
        fixture.cleanup();
      }
    });
  },
);

function browserDependencyIssues(input: {
  packageJson: typeof packageJson;
  lockfile: string;
  rootAgents: string;
  e2eAgents: string;
}) {
  const issues: string[] = [];
  if (input.packageJson.devDependencies?.playwright !== '1.63.0')
    issues.push('playwright must use exact version 1.63.0');
  if (
    input.packageJson.dependencies?.['@playwright/test'] ||
    input.packageJson.devDependencies?.['@playwright/test'] ||
    input.lockfile.includes('@playwright/test')
  )
    issues.push('@playwright/test must not be used');
  if (!input.e2eAgents.includes('pnpm exec playwright install chromium'))
    issues.push('e2e AGENTS must document Chromium installation');
  if (!/浏览器自动化.*Playwright/u.test(input.rootAgents))
    issues.push('root AGENTS rule 11 must cover browser automation');
  return issues;
}

function freshnessFixture() {
  const manifest = {
    packages: [
      {
        directory: 'web',
        name: '@fixture/web',
        role: 'product',
        form: 'web-app',
        private: true,
        allowedDirectories: ['src', 'dist'],
        moduleRoots: ['src'],
      },
      {
        directory: 'openapi',
        name: '@fixture/openapi',
        role: 'protocol',
        protocolKind: 'openapi',
        private: true,
        allowedDirectories: ['src', 'testing'],
        moduleRoots: ['src', 'testing'],
        contract: { file: 'contract.yaml', lock: 'contract.lock' },
      },
      {
        directory: 'e2e',
        name: '@fixture/e2e',
        role: 'test',
        private: true,
        allowedDirectories: ['src'],
        moduleRoots: ['src'],
      },
    ],
    bindings: [{ name: 'web-openapi-browser', product: 'web', protocol: 'openapi', platforms: [] }],
    requiredCommands: ['check:fast'],
    testProjects: [
      { name: 'fixture-unit', class: 'unit', config: 'packages/web/vitest.config.ts' },
      { name: 'integration', class: 'integration', config: 'packages/e2e/vitest.config.ts' },
    ],
    fingerprints: {
      sourceRoots: ['packages/web/src', 'packages/openapi/src', 'packages/e2e/src'],
      buildInputs: ['package.json'],
      protocolInputs: ['contract.lock', 'contract.yaml'],
    },
    quality: { coverageExclusions: [], maxLinesExemptions: [] },
  };
  const fixture = createControlledRoot({
    manifest,
    files: {
      'packages/web/src/main.ts': 'export const value = 1;\n',
      'packages/web/dist/index.html':
        '<!doctype html><script type="module" src="./assets/app.js"></script>',
      'packages/web/dist/assets/app.js': 'export const value = 1;\n',
      'packages/openapi/src/index.ts': 'export const value = 1;\n',
      'contract.yaml': 'openapi: 3.1.0\n',
      'packages/e2e/src/index.ts': 'export const value = 1;\n',
      'contract.lock': 'fixture\n',
    },
    protocolAdapters: false,
  });
  const loaded = loadProjectManifest(fixture.root);
  const product = loaded.packages.find((item) => item.directory === 'web')!;
  writeBundleManifest(
    fixture.root,
    loaded,
    product,
    bundleManifestFor(fixture.root, loaded, 'web'),
  );
  const protocol = loaded.packages.find((item) => item.directory === 'openapi')!;
  writeProtocolManifest(fixture.root, loaded, protocol);
  return fixture;
}

function bundleManifestFor(root: string, manifest: ProjectManifest, productDirectory: string) {
  const output = 'assets/app.js';
  const source = 'packages/web/src/main.ts';
  return {
    formatVersion: 1 as const,
    product: productDirectory,
    entry: source,
    productDigest: productDigest(
      root,
      manifest,
      manifest.packages.find((item) => item.directory === productDirectory)!,
    ),
    modules: [{ source, dependency: false, outputs: [output] }],
    outputs: [
      {
        file: output,
        sha256: createHash('sha256')
          .update(readFileSync(join(root, 'packages/web/dist', output)))
          .digest('hex'),
      },
    ],
  };
}

function testSources() {
  const root = join(repositoryRoot, 'packages/e2e/tests');
  const files: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.ts'))
        files[relative(repositoryRoot, path)] = readFileSync(path, 'utf8');
    }
  };
  visit(root);
  return files;
}

function harnessImplementations(files: Record<string, string>) {
  return Object.entries(files)
    .filter(([, source]) => new RegExp(`(?:function|const)\\s+${'waitForCalls'}\\b`).test(source))
    .map(([path]) => path)
    .sort();
}

function browserEnvironmentIssues(files: Record<string, string>) {
  return Object.entries(files)
    .filter(([, source]) => /environment\s*:\s*['"]browser['"]/.test(source))
    .map(([path]) => path)
    .filter((path) => !path.startsWith('packages/e2e/tests/web-openapi-browser/'))
    .sort();
}

function browserDocumentationIssues(section: string) {
  return ['aria-disabled', '自动滚动', '真实按键', 'scroll anchoring']
    .filter((phrase) => !section.includes(phrase))
    .map((phrase) => `missing browser behavior ${phrase}`);
}

function browserRegistrationIssues(manifest: ProjectManifest) {
  const issues: string[] = [];
  const browser = manifest.testProjects.find((item) => item.name === 'browser');
  if (!browser) issues.push('missing browser project');
  else {
    if (browser.class !== 'platform') issues.push('browser project must be platform class');
    if (browser.config !== 'packages/e2e/vitest.config.browser.ts')
      issues.push('browser project config is wrong');
  }
  if (!manifest.requiredCommands.includes('test:e2e:browser'))
    issues.push('missing test:e2e:browser command');
  if (
    !manifest.bindings
      .find((item) => item.name === 'web-openapi-browser')
      ?.platforms.includes('browser')
  )
    issues.push('web-openapi-browser must include browser platform');
  return issues;
}

function hostLogicIssues(root: string) {
  const manifest = loadProjectManifest(root);
  const allowed = new Set(
    (manifest.quality?.coverageExclusions ?? [])
      .map((item) => item.path)
      .filter((path) => path.startsWith('packages/e2e/host/')),
  );
  const issues: string[] = [];
  const hostRoot = join(root, 'packages/e2e/host');
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else {
        const relativePath = relative(root, path);
        if (entry.name.endsWith('.ts') && !allowed.has(relativePath)) issues.push(relativePath);
      }
    }
  };
  visit(hostRoot);
  return issues.sort();
}

function schemaDescriptionIssues(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const issues: string[] = [];
  if (record.properties && typeof record.properties === 'object') {
    for (const [name, property] of Object.entries(record.properties as Record<string, unknown>)) {
      const description = (property as { description?: unknown } | null)?.description;
      if (typeof description !== 'string' || !/[\u4e00-\u9fff]/u.test(description))
        issues.push(`${path}${name} missing Chinese description`);
      issues.push(...schemaDescriptionIssues(property, `${path}${name}.`));
    }
  }
  if (record.items) issues.push(...schemaDescriptionIssues(record.items, `${path}items.`));
  return issues;
}
