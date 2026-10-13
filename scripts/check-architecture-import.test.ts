import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// 运行真实 dependency-cruiser CLI；不以手造依赖图代替解析/退出码验证。
function importFixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'template-architecture-import-'));
  roots.push(root);
  for (const file of ['.dependency-cruiser.cjs', 'tsconfig.base.json', 'project.manifest.json'])
    writeFileSync(join(root, file), readFileSync(file));
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  writeFileSync(
    join(root, 'scripts/lib/dependency-rules.cjs'),
    readFileSync('scripts/lib/dependency-rules.cjs'),
  );
  for (const name of ['sdk', 'protocol']) {
    const directory = join(root, 'packages', name);
    mkdirSync(join(directory, 'src'), { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      readFileSync(join('packages', name, 'package.json')),
    );
  }
  const protocol = join(root, 'packages/protocol');
  mkdirSync(join(protocol, 'src/generated'));
  writeFileSync(join(protocol, 'src/index.ts'), 'export type PublicType = string;');
  writeFileSync(join(protocol, 'src/generated/std.ts'), 'export const config = 1;');
  // 保留真实 package exports，模拟构建后的公开文件，覆盖源码别名与 dist 两条解析路径。
  mkdirSync(join(protocol, 'dist/generated'), { recursive: true });
  writeFileSync(join(protocol, 'dist/index.d.ts'), 'export type PublicType = string;');
  writeFileSync(join(protocol, 'dist/generated/std.d.ts'), 'export declare const config: number;');
  const modules = join(root, 'packages/sdk/node_modules/@daqian');
  mkdirSync(modules, { recursive: true });
  symlinkSync(protocol, join(modules, 'template-protocol'), 'dir');
  writeFileSync(join(root, 'packages/sdk/src/export-bypass.ts'), source);
  return spawnSync(
    resolve('node_modules/.bin/depcruise'),
    [
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'err-long',
      'packages/sdk/src/export-bypass.ts',
    ],
    { cwd: root, encoding: 'utf8' },
  );
}

test.each([
  "export { config } from '../../protocol/src/generated/std';",
  "export type { PublicType } from '../../protocol/src/index';",
  "export const load = () => import('../../protocol/src/generated/std');",
  "export { config } from '../../protocol/dist/generated/std.d.ts';",
  "export { config } from 'packages/protocol/src/generated/std';",
])('真实 CLI 拒绝绕过 exports 的跨包源文件导入：%s', (source) => {
  const result = importFixture(source);
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain('cross-workspace-no-direct-files');
});

test('真实 CLI 接受完整 npm 名称的 root 和 generated 公开子入口', () => {
  const result = importFixture(
    "export type { PublicType } from '@daqian/template-protocol';\nexport { config } from '@daqian/template-protocol/generated/std';",
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
