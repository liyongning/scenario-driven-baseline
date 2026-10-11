import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createControlledRoot,
  minimalManifest,
} from '../../packages/e2e/tests/tooling/controlled-root.ts';
import {
  classifySourceFile,
  codeFiles,
  listGitFiles,
  readSourceInventory,
} from './source-inventory.ts';

const manifestWith = (sourceRoots: ReadonlyArray<string>) => ({
  ...minimalManifest(),
  fingerprints: { sourceRoots, buildInputs: [], protocolInputs: ['proto-gen.lock'] },
});

describe('source inventory', () => {
  it('classifies tracked and new files, excluding generated code and AGENTS/CLAUDE files', () => {
    const fixture = createControlledRoot({
      manifest: manifestWith(['scripts', 'packages/sample-test/tests']),
      files: {
        'scripts/check.ts': 'code',
        'scripts/check.test.ts': 'test',
        'scripts/flow.schema.json': 'asset',
        'scripts/AGENTS.md': 'agents',
        'scripts/CLAUDE.md': 'claude',
        'scripts/generated/api.ts': 'generated',
        'packages/sample-test/tests/helpers.ts': 'helper',
        'packages/sample-test/tests/fixture.json': 'fixture',
      },
    });
    try {
      const inventory = readSourceInventory(fixture.root);
      expect(codeFiles(inventory)).toEqual(['scripts/check.ts']);
      expect(
        inventory.files.filter((file) => file.class === 'test').map((file) => file.path),
      ).toEqual([
        'packages/sample-test/tests/fixture.json',
        'packages/sample-test/tests/helpers.ts',
        'scripts/check.test.ts',
      ]);
      expect(
        inventory.files.filter((file) => file.class === 'asset').map((file) => file.path),
      ).toEqual(['scripts/flow.schema.json']);
      const paths = inventory.files.map((file) => file.path);
      expect(paths).not.toContain('scripts/generated/api.ts');
      expect(paths).not.toContain('scripts/AGENTS.md');
      expect(paths).not.toContain('scripts/CLAUDE.md');

      // 初始提交之后新增、尚未 git add 的源码文件同样进入清单。
      writeFileSync(join(fixture.root, 'scripts/new.ts'), 'new');
      expect(codeFiles(readSourceInventory(fixture.root))).toEqual([
        'scripts/check.ts',
        'scripts/new.ts',
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it('treats ignored files as absent and requires a git work tree', () => {
    const fixture = createControlledRoot({
      manifest: manifestWith(['scripts']),
      files: { 'scripts/kept.ts': 'kept', '.gitignore': 'scripts/ignored.ts\n' },
    });
    try {
      writeFileSync(join(fixture.root, 'scripts/ignored.ts'), 'ignored');
      expect(listGitFiles(fixture.root, ['scripts'])).toEqual(['scripts/kept.ts']);
      expect(listGitFiles(fixture.root, [])).toEqual([]);
      expect(codeFiles(readSourceInventory(fixture.root))).toEqual(['scripts/kept.ts']);
    } finally {
      fixture.cleanup();
    }

    const plain = mkdtempSync(join(tmpdir(), 'source-inventory-plain-'));
    try {
      writeFileSync(
        join(plain, 'project.manifest.json'),
        JSON.stringify(manifestWith(['scripts'])),
      );
      expect(() => readSourceInventory(plain)).toThrow(/not a git work tree/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }

    // 裸仓库里 `git rev-parse --is-inside-work-tree` 返回 false，同样必须报错退出。
    const bare = mkdtempSync(join(tmpdir(), 'source-inventory-bare-'));
    try {
      execFileSync('git', ['init', '-q', '--bare'], { cwd: bare });
      writeFileSync(join(bare, 'project.manifest.json'), JSON.stringify(manifestWith(['scripts'])));
      expect(() => readSourceInventory(bare)).toThrow(/not a git work tree/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('drops tracked files deleted from the worktree but not yet staged', () => {
    const fixture = createControlledRoot({
      manifest: manifestWith(['scripts']),
      files: { 'scripts/kept.ts': 'kept', 'scripts/removed.ts': 'removed' },
    });
    try {
      expect(listGitFiles(fixture.root, ['scripts'])).toEqual([
        'scripts/kept.ts',
        'scripts/removed.ts',
      ]);
      // 反例：文件已从工作区删除、但还没 `git rm`（索引里仍在），
      // `git ls-files -co` 仍会列出它；清单必须剔除，否则下游读取内容时报 ENOENT。
      rmSync(join(fixture.root, 'scripts/removed.ts'));
      expect(listGitFiles(fixture.root, ['scripts'])).toEqual(['scripts/kept.ts']);
      expect(codeFiles(readSourceInventory(fixture.root))).toEqual(['scripts/kept.ts']);
    } finally {
      fixture.cleanup();
    }
  });

  it('classifies each file by the documented order', () => {
    expect(classifySourceFile('packages/sample-test/tests/helper.ts', 'packages/sample-test')).toBe(
      'test',
    );
    expect(classifySourceFile('scripts/check.spec.mts', 'packages/sample-test')).toBe('test');
    expect(classifySourceFile('scripts/check.mjs', 'packages/sample-test')).toBe('code');
    expect(classifySourceFile('scripts/data.json', 'packages/sample-test')).toBe('asset');
  });
});
