import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { baseManifest } from '../packages/e2e/tests/tooling/project-manifest-fixture.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// 运行真实 dependency-cruiser CLI；不以手造依赖图代替解析/退出码验证。
function importFixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'template-architecture-import-'));
  roots.push(root);
  const manifest = baseManifest();
  const product = manifest.packages.find((item) => item.role === 'product')!;
  const protocol = manifest.packages.find((item) => item.role === 'protocol')!;
  for (const file of ['.dependency-cruiser.cjs', 'tsconfig.base.json'])
    writeFileSync(join(root, file), readFileSync(file));
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  writeFileSync(
    join(root, 'scripts/lib/dependency-rules.cjs'),
    readFileSync('scripts/lib/dependency-rules.cjs'),
  );
  for (const pkg of manifest.packages) {
    const directory = join(root, 'packages', pkg.directory);
    mkdirSync(join(directory, 'src'), { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        version: '0.0.0',
        private: pkg.private,
        ...(pkg === protocol
          ? {
              type: 'module',
              exports: {
                '.': { import: './dist/index.js', types: './dist/index.d.ts' },
                './generated/*': {
                  import: './dist/generated/*.js',
                  types: './dist/generated/*.d.ts',
                },
              },
            }
          : {}),
      }),
    );
  }
  const protocolRoot = join(root, 'packages', protocol.directory);
  mkdirSync(join(protocolRoot, 'src/generated'));
  writeFileSync(join(protocolRoot, 'src/index.ts'), 'export type PublicType = string;');
  writeFileSync(join(protocolRoot, 'src/generated/std.ts'), 'export const config = 1;');
  // 保留真实 package exports，模拟构建后的公开文件，覆盖源码别名与 dist 两条解析路径。
  mkdirSync(join(protocolRoot, 'dist/generated'), { recursive: true });
  writeFileSync(join(protocolRoot, 'dist/index.d.ts'), 'export type PublicType = string;');
  writeFileSync(join(protocolRoot, 'dist/index.js'), 'export const publicType = true;');
  writeFileSync(
    join(protocolRoot, 'dist/generated/std.d.ts'),
    'export declare const config: number;',
  );
  writeFileSync(join(protocolRoot, 'dist/generated/std.js'), 'export const config = 1;');
  const modules = join(root, 'node_modules', protocol.name.split('/')[0]!);
  mkdirSync(modules, { recursive: true });
  symlinkSync(protocolRoot, join(root, 'node_modules', protocol.name), 'dir');
  writeFileSync(join(root, 'packages', product.directory, 'src/export-bypass.ts'), source);
  return spawnSync(
    resolve('node_modules/.bin/depcruise'),
    [
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'err-long',
      `packages/${product.directory}/src/export-bypass.ts`,
    ],
    { cwd: root, encoding: 'utf8' },
  );
}

const protocolDirectory = 'sample-protocol';
test.each([
  `export { config } from '../../${protocolDirectory}/src/generated/std';`,
  `export type { PublicType } from '../../${protocolDirectory}/src/index';`,
  `export const load = () => import('../../${protocolDirectory}/src/generated/std');`,
  `export { config } from '../../${protocolDirectory}/dist/generated/std.d.ts';`,
  `export { config } from 'packages/${protocolDirectory}/src/generated/std';`,
])('真实 CLI 拒绝绕过 exports 的跨包源文件导入：%s', (source) => {
  const result = importFixture(source);
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain('cross-workspace-no-direct-files');
});

test('真实 CLI 接受完整 npm 名称的 root 和 generated 公开子入口', () => {
  const result = importFixture(
    "export type { PublicType } from '@sample/protocol';\nexport { config } from '@sample/protocol/generated/std';",
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
