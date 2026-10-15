import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  testPackage,
  type ManifestPackage,
  type ProjectManifest,
  loadProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import { coreTsconfigInclude } from '../../../../scripts/lib/web-app-checks.ts';
import { writeProjectMapFixture, writeTemplateGuideFixture } from './helpers.ts';
import { baseManifest } from './project-manifest-fixture.ts';

const roots: string[] = [];
type FixtureOptions = Readonly<{ additionalWebApp?: boolean }>;

export function cleanupArchitectureFixtures() {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export function expectedCruiseTargets(manifest: ProjectManifest): string[] {
  return manifest.packages
    .filter((pkg) => pkg.role !== 'test')
    .flatMap((pkg) => {
      const roots = pkg.moduleRoots?.length ? pkg.moduleRoots : ['src'];
      return roots.map((root) => `packages/${pkg.directory}/${root}`);
    })
    .concat(`packages/${testPackage(manifest).directory}/src/shadow`);
}

function writePackageFixture(root: string, pkg: ManifestPackage, manifest: ProjectManifest): void {
  const directory = join(root, 'packages', pkg.directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'AGENTS.md'), '[root](../../AGENTS.md#rules)');
  const binding = manifest.bindings.find((item) => item.product === pkg.directory);
  const protocol = manifest.packages.find((item) => item.directory === binding?.protocol);
  const dependencies = {
    ...(protocol ? { [protocol.name]: 'workspace:*' } : {}),
    ...(pkg.form === 'web-app' ? { '@vue/devtools-api': '1.0.0' } : {}),
  };
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: pkg.name,
      version: '0.0.0',
      ...(pkg.private ? { private: true } : {}),
      ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    }),
  );
  if (pkg.form === 'web-app') {
    writeFileSync(
      join(directory, 'tsconfig.core.json'),
      JSON.stringify(
        {
          compilerOptions: { composite: true, lib: ['ES2022'], types: [] },
          include: coreTsconfigInclude(pkg),
        },
        null,
        2,
      ),
    );
  }
}

export function createArchitectureFixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'template-architecture-'));
  roots.push(root);
  mkdirSync(join(root, 'packages'));
  writeFileSync(join(root, 'README.md'), '# facts');
  writeFileSync(join(root, 'AGENTS.md'), '[facts](README.md) [external](https://example.invalid)');
  writeFileSync(join(root, 'package.json'), readFileSync('package.json'));
  const manifest = baseManifest();
  if (options.additionalWebApp) {
    const protocol = manifest.packages.find((pkg) => pkg.role === 'protocol')!;
    manifest.packages = [
      ...manifest.packages,
      {
        directory: 'web-idl',
        name: '@sample/web-idl',
        role: 'product',
        form: 'web-app',
        private: true,
        allowedDirectories: ['src'],
        moduleRoots: ['src'],
        globalStore: 'src/store/index.ts',
        consumedOperations: ['src/app/consumed-operations.ts'],
      },
    ];
    manifest.bindings = [
      ...manifest.bindings,
      {
        name: 'web-idl-browser',
        product: 'web-idl',
        protocol: protocol.directory,
        platforms: ['browser'],
      },
    ];
    manifest.testProjects = [
      ...manifest.testProjects,
      {
        name: 'browser',
        class: 'platform',
        config: 'packages/sample-test/vitest.config.browser.ts',
      },
    ];
    for (const module of ['trade-create', 'trade-list', 'trade-status']) {
      mkdirSync(join(root, 'packages/web-idl/src', module), { recursive: true });
    }
  }
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  for (const pkg of manifest.packages) writePackageFixture(root, pkg, manifest);
  writeTemplateGuideFixture(root);
  writeProjectMapFixture(root);
  // 默认 CLI 分支调用真实 depcruise：放一个可执行替身，验证参数组装与退出码传递，不依赖真实解析。
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.bin/depcruise'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return root;
}

export function firstProductDirectory(root: string): string {
  const product = loadProjectManifest(root).packages.find((pkg) => pkg.role === 'product');
  if (!product) throw new Error('fixture has no product package');
  return product.directory;
}

export function writeRemovalFixture(
  root: string,
  removal: Readonly<{
    directories?: ReadonlyArray<string>;
    files?: ReadonlyArray<string>;
    globs?: ReadonlyArray<Readonly<{ directory: string; prefixes: ReadonlyArray<string> }>>;
    matrices?: ReadonlyArray<Readonly<{ fixture: string; declaration: string }>>;
  }>,
) {
  const test = testPackage(loadProjectManifest(root));
  const directory = join(
    root,
    'packages',
    test.directory,
    'tests/fixtures/SCN-TEMPLATE-ENGINEERING-008',
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'example-removal.json'),
    JSON.stringify({
      removal: {
        directories: removal.directories ?? [],
        files: removal.files ?? [],
        globs: removal.globs ?? [],
        ...(removal.matrices === undefined ? {} : { matrices: removal.matrices }),
      },
    }),
  );
}
