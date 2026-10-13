import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { checkExampleWhitelist, exampleWhitelistEntries } from './example-whitelist.ts';
import { loadProjectManifest, type ProjectManifest } from './project-manifest.ts';

const roots: string[] = [];
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function controlledRoot() {
  const root = mkdtempSync(join(tmpdir(), 'example-whitelist-'));
  roots.push(root);
  return root;
}

function writeRemovalFixture(root: string, matrices?: unknown) {
  const fixture = join(root, 'packages/sample-tests/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008');
  mkdirSync(fixture, { recursive: true });
  writeFileSync(
    join(fixture, 'example-removal.json'),
    JSON.stringify({
      removal: {
        directories: ['packages/sample-sdk/src/removed'],
        files: ['packages/sample-sdk/src/removed.ts'],
        globs: [{ directory: 'packages/sample-sdk/src', prefixes: ['removed-'] }],
        ...(matrices === undefined ? {} : { matrices }),
      },
    }),
  );
}

const manifest = {
  packages: [
    { directory: 'sample-sdk', role: 'product', form: 'sdk' },
    { directory: 'sample-protocol', role: 'protocol', protocolKind: 'idl' },
    { directory: 'sample-tests', role: 'test' },
  ],
  bindings: [],
} as unknown as ProjectManifest;

test('derives non-empty removal entries without requiring a matrices field', () => {
  const root = controlledRoot();
  writeRemovalFixture(root);
  const entries = exampleWhitelistEntries(root, manifest);
  expect(entries.templateExample).toEqual(
    expect.arrayContaining([
      'packages/sample-sdk/src/removed/',
      'packages/sample-sdk/src/removed.ts',
      'packages/sample-sdk/src/removed-*',
    ]),
  );
  expect(exampleWhitelistEntries(controlledRoot(), manifest).templateExample).not.toEqual([]);
});

test('guide whitelist parsing handles present and absent section boundaries', () => {
  const repository = loadProjectManifest(repositoryRoot);
  expect(checkExampleWhitelist(repositoryRoot, repository, '# guide')).toContain(
    'missing removal whitelist entry openspec/specs/template-example/',
  );
  expect(checkExampleWhitelist(repositoryRoot, repository, '## 移除模板示例')).toContain(
    'missing removal whitelist entry openspec/specs/web-example/',
  );
  expect(
    checkExampleWhitelist(repositoryRoot, repository, '## 移除模板示例\n## 归档已知限制\n'),
  ).toContain('missing removal whitelist entry openspec/specs/web-example/');
  expect(
    checkExampleWhitelist(repositoryRoot, repository, '## 移除模板示例\nWeb 示例白名单\n'),
  ).toContain('missing removal whitelist entry openspec/specs/web-example/');
  expect(
    checkExampleWhitelist(
      repositoryRoot,
      repository,
      '## 移除模板示例\nWeb 示例白名单\n## 归档已知限制\n',
    ),
  ).toContain('missing removal whitelist entry openspec/specs/template-example/');
});
