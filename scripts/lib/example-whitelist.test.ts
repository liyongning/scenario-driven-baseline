import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { checkExampleWhitelist, exampleWhitelistEntries } from './example-whitelist.ts';
import type { ProjectManifest } from './project-manifest.ts';

const roots: string[] = [];

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
        directories: ['openspec/specs/template-example'],
        files: ['packages/sample-sdk/src/removed.ts'],
        globs: [{ directory: 'packages/sample-sdk/src', prefixes: ['removed-'] }],
        ...(matrices === undefined ? {} : { matrices }),
      },
    }),
  );
}

function writeWebRemovalFixture(root: string) {
  const fixture = join(root, 'packages/sample-tests/tests/fixtures/SCN-WEB-EXAMPLE-015');
  mkdirSync(fixture, { recursive: true });
  writeFileSync(
    join(fixture, 'web-example-removal.json'),
    JSON.stringify({
      removal: {
        directories: ['openspec/specs/web-example'],
        files: ['packages/sample-web/src/example.ts'],
        globs: [{ directory: 'packages/sample-web/src', prefixes: ['example-'] }],
        matrices: [
          {
            fixture: 'packages/sample-tests/tests/fixtures/SCN-SAMPLE-CONTRACT-001/matrix.json',
            owner: 'SCN-SAMPLE-CONTRACT-001',
            kind: 'openapi-plans',
            declaration: 'packages/sample-web/src/consumed-operations.ts',
          },
        ],
      },
    }),
  );
}

const manifest = {
  packages: [
    { directory: 'sample-sdk', role: 'product', form: 'sdk' },
    { directory: 'sample-web', role: 'product', form: 'web-app' },
    { directory: 'sample-protocol', role: 'protocol', protocolKind: 'idl' },
    { directory: 'sample-tests', role: 'test' },
  ],
  bindings: [],
} as unknown as ProjectManifest;

test('derives non-empty removal entries without requiring a matrices field', () => {
  const root = controlledRoot();
  writeRemovalFixture(root);
  writeWebRemovalFixture(root);
  const entries = exampleWhitelistEntries(root, manifest);
  expect(entries.templateExample).toEqual(
    expect.arrayContaining([
      'openspec/specs/template-example/',
      'packages/sample-sdk/src/removed.ts',
      'packages/sample-sdk/src/removed-*',
    ]),
  );
  expect(entries.webExample).toEqual(
    expect.arrayContaining([
      'openspec/specs/web-example/',
      'packages/sample-web/src/example.ts',
      'packages/sample-web/src/example-*',
      'packages/sample-tests/tests/fixtures/SCN-SAMPLE-CONTRACT-001/matrix.json',
    ]),
  );
  expect(exampleWhitelistEntries(controlledRoot(), manifest)).toEqual({
    templateExample: [],
    webExample: [],
  });
});

test('guide whitelist parsing handles present and absent section boundaries', () => {
  const root = controlledRoot();
  writeRemovalFixture(root);
  writeWebRemovalFixture(root);
  expect(checkExampleWhitelist(root, manifest, '# guide')).toContain(
    'missing removal whitelist entry openspec/specs/template-example/',
  );
  expect(checkExampleWhitelist(root, manifest, '## 移除模板示例')).toContain(
    'missing removal whitelist entry openspec/specs/web-example/',
  );
  expect(
    checkExampleWhitelist(root, manifest, '## 移除模板示例\nopenspec/specs/template-example/'),
  ).toContain('missing removal whitelist entry openspec/specs/web-example/');
  expect(checkExampleWhitelist(root, manifest, '## 移除模板示例\n## 归档已知限制\n')).toContain(
    'missing removal whitelist entry openspec/specs/web-example/',
  );
  expect(checkExampleWhitelist(root, manifest, '## 移除模板示例\nWeb 示例白名单\n')).toContain(
    'missing removal whitelist entry openspec/specs/web-example/',
  );
  expect(
    checkExampleWhitelist(
      root,
      manifest,
      [
        '## 移除模板示例',
        ...exampleWhitelistEntries(root, manifest).templateExample,
        'Web 示例白名单',
        ...exampleWhitelistEntries(root, manifest).webExample,
        '## 归档已知限制',
      ].join('\n'),
    ),
  ).toEqual([]);
  expect(
    checkExampleWhitelist(
      root,
      manifest,
      '## 移除模板示例\nWeb 示例白名单\nopenspec/specs/web-example/\n## 归档已知限制\n',
    ),
  ).toContain('missing removal whitelist entry openspec/specs/template-example/');
});
