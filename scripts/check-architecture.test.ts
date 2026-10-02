import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkArchitecture, runArchitectureCli } from './check-architecture';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'payment-architecture-')); roots.push(root);
  mkdirSync(join(root, 'packages'));
  writeFileSync(join(root, 'README.md'), '# facts');
  writeFileSync(join(root, 'AGENTS.md'), '[facts](README.md) [external](https://example.invalid)');
  writeFileSync(join(root, 'package.json'), readFileSync('package.json'));
  writeFileSync(join(root, 'project.manifest.json'), readFileSync('project.manifest.json'));
  for (const name of ['payment-sdk', 'payment-protocol', 'e2e']) {
    const dir = join(root, 'packages', name); mkdirSync(dir);
    writeFileSync(join(dir, 'AGENTS.md'), '[root](../../AGENTS.md#rules)');
    writeFileSync(join(dir, 'package.json'), readFileSync(`packages/${name}/package.json`));
  }
  return root;
}

test('完整三包和可解析规则链接通过；依赖工具失败传递', () => {
  const root = fixture();
  expect(checkArchitecture(root, 0)).toEqual([]);
  expect(checkArchitecture(root, 1)).toContain('dependency-cruiser failed');
  expect(runArchitectureCli(['node', 'script', '--root', root, '--dependency-exit-code', '0'])).toMatchObject({ issues: [], exitCode: 0 });
  expect(runArchitectureCli([], root)).toMatchObject({ issues: [], exitCode: 0 });
  expect(() => runArchitectureCli(['node', 'script', '--dependency-exit-code', '-1'], root)).toThrow(/non-negative integer/);
  expect(() => runArchitectureCli(['node', 'script', '--dependency-exit-code', 'bad'], root)).toThrow(/non-negative integer/);
});

test('缺失 AGENTS 和断链被拒绝', () => {
  const root = fixture(); rmSync(join(root, 'packages/e2e/AGENTS.md'));
  writeFileSync(join(root, 'AGENTS.md'), '[missing](missing.md)');
  expect(checkArchitecture(root, 0)).toEqual(expect.arrayContaining(['missing packages/e2e/AGENTS.md', 'broken link AGENTS.md -> missing.md']));
});

test('缺少项目清单时直接报告清单错误', () => {
  const root = fixture(); rmSync(join(root, 'project.manifest.json'));
  expect(checkArchitecture(root, 1).join('\n')).toContain('project.manifest.json cannot be read');
});

test('清单登记但缺失的包目录被报告', () => {
  const root = fixture(); rmSync(join(root, 'packages/e2e'), { recursive: true });
  expect(checkArchitecture(root, 0)).toContain('missing package directory packages/e2e');
});

test('第四个包、未知职责目录及产品测试导出被拒绝', () => {
  const root = fixture(); mkdirSync(join(root, 'packages/fourth'));
  mkdirSync(join(root, 'packages/payment-sdk/ui'));
  const p = join(root, 'packages/payment-sdk/package.json'); const manifest = JSON.parse(readFileSync(p, 'utf8'));
  manifest.exports['./testing'] = './testing/index.ts'; writeFileSync(p, JSON.stringify(manifest));
  expect(checkArchitecture(root, 0)).toEqual(expect.arrayContaining(['unexpected package fourth', 'unexpected directory packages/payment-sdk/ui', 'private entry exported by payment-sdk']));
});

test('包名、private 标识、反向依赖与必需命令错误被拒绝', () => {
  const root = fixture();
  const p = join(root, 'packages/payment-protocol/package.json'); const manifest = JSON.parse(readFileSync(p, 'utf8'));
  manifest.name = 'wrong'; manifest.dependencies = { '@daqian/payment-sdk': 'workspace:*' };
  writeFileSync(p, JSON.stringify(manifest));
  writeFileSync(join(root, 'packages/e2e/package.json'), JSON.stringify({ name: '@daqian/payment-e2e', private: false }));
  writeFileSync(join(root, 'package.json'), JSON.stringify({}));
  const errors = checkArchitecture(root, 0);
  expect(errors).toContain('wrong package name payment-protocol');
  expect(errors).toContain('protocol cannot depend on SDK/E2E');
  expect(errors).toContain('e2e must be private');
  expect(errors).toContain('missing command typecheck');
});

// 运行真实 dependency-cruiser CLI；不以手造依赖图代替解析/退出码验证。
function importFixture(source: string) {
  const root = fixture();
  writeFileSync(join(root, '.dependency-cruiser.cjs'), readFileSync('.dependency-cruiser.cjs'));
  writeFileSync(join(root, 'tsconfig.base.json'), readFileSync('tsconfig.base.json'));
  for (const name of ['payment-sdk', 'payment-protocol']) mkdirSync(join(root, 'packages', name, 'src'), { recursive: true });
  const protocol = join(root, 'packages/payment-protocol');
  mkdirSync(join(protocol, 'src/generated'));
  writeFileSync(join(protocol, 'src/index.ts'), 'export type PublicType = string;');
  writeFileSync(join(protocol, 'src/generated/std.ts'), 'export const config = 1;');
  // 保留真实 package exports，模拟构建后的公开文件，覆盖源码别名与 dist 两条解析路径。
  mkdirSync(join(protocol, 'dist/generated'), { recursive: true });
  writeFileSync(join(protocol, 'dist/index.d.ts'), 'export type PublicType = string;');
  writeFileSync(join(protocol, 'dist/generated/std.d.ts'), 'export declare const config: number;');
  const modules = join(root, 'packages/payment-sdk/node_modules/@daqian');
  mkdirSync(modules, { recursive: true });
  symlinkSync(protocol, join(modules, 'payment-protocol'), 'dir');
  writeFileSync(join(root, 'packages/payment-sdk/src/export-bypass.ts'), source);
  return spawnSync(resolve('node_modules/.bin/depcruise'), [
    '--config', '.dependency-cruiser.cjs', '--output-type', 'err-long',
    'packages/payment-sdk/src/export-bypass.ts',
  ], { cwd: root, encoding: 'utf8' });
}

test.each([
  "export { config } from '../../payment-protocol/src/generated/std';",
  "export type { PublicType } from '../../payment-protocol/src/index';",
  "export const load = () => import('../../payment-protocol/src/generated/std');",
  "export { config } from '../../payment-protocol/dist/generated/std.d.ts';",
  "export { config } from 'packages/payment-protocol/src/generated/std';",
])('真实 CLI 拒绝绕过 exports 的跨包源文件导入：%s', source => {
  const result = importFixture(source);
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain('cross-workspace-no-direct-files');
});

test('真实 CLI 接受完整 npm 名称的 root 和 generated 公开子入口', () => {
  const result = importFixture("export type { PublicType } from '@daqian/payment-protocol';\nexport { config } from '@daqian/payment-protocol/generated/std';");
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
