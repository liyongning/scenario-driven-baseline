import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';
import { checkSchemaDocumentation } from './schema-docs.ts';

const roots: string[] = [];

/** 模板自身事实核验：只读真实仓库的 schema 与根文档，不读取门禁实时状态。 */
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('requires every schema property to carry documentation and AGENTS references', () => {
  const root = mkdtempSync(join(tmpdir(), 'schema-docs-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  for (const path of [
    'scenario-gate.config.schema.json',
    'scripts/verification.schema.json',
    'scripts/flow.schema.json',
  ]) {
    writeFileSync(
      join(root, path),
      JSON.stringify({
        properties: { top: { type: 'object', properties: { nested: { type: 'string' } } } },
      }),
    );
  }
  writeFileSync(join(root, 'AGENTS.md'), 'scenario-gate.config.schema.json');
  const issues = checkSchemaDocumentation(root);
  expect(issues).toEqual(
    expect.arrayContaining([
      expect.stringContaining('property top is missing'),
      expect.stringContaining('property nested is missing'),
      expect.stringContaining('scripts/verification.schema.json'),
    ]),
  );
});

test('accepts the repository schemas and root documentation', () => {
  expect(checkSchemaDocumentation(repositoryRoot)).toEqual([]);
});

test('validates the project manifest schema group independently', () => {
  const root = mkdtempSync(join(tmpdir(), 'schema-docs-'));
  roots.push(root);
  writeFileSync(
    join(root, 'project.manifest.schema.json'),
    JSON.stringify({ properties: { packages: { type: 'array' } } }),
  );
  writeFileSync(join(root, 'AGENTS.md'), 'project.manifest.schema.json');
  expect(checkSchemaDocumentation(root)).toEqual(
    expect.arrayContaining([expect.stringContaining('property packages is missing')]),
  );
  writeFileSync(
    join(root, 'project.manifest.schema.json'),
    JSON.stringify({ properties: { packages: { description: '包列表', type: 'array' } } }),
  );
  expect(checkSchemaDocumentation(root)).toEqual([]);
});

test('handles absent, invalid, and nested schema branches', () => {
  const root = mkdtempSync(join(tmpdir(), 'schema-docs-'));
  roots.push(root);
  expect(checkSchemaDocumentation(root)).toEqual([]);
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scenario-gate.config.schema.json'), '{invalid');
  expect(checkSchemaDocumentation(root)).toEqual(
    expect.arrayContaining([expect.stringContaining('schema cannot be parsed')]),
  );
  writeFileSync(
    join(root, 'scenario-gate.config.schema.json'),
    JSON.stringify({
      allOf: [{ properties: { a: { description: '字段甲', type: 'string' } } }],
      if: { properties: { b: { description: '字段乙' } } },
      then: { properties: { c: { description: '字段丙' } } },
      else: { properties: { d: { description: '字段丁' } } },
      items: { properties: { e: { description: '字段戊' } } },
      additionalProperties: { properties: { f: { description: '字段己' } } },
      propertyNames: { properties: { g: { description: '字段庚' } } },
      properties: { ignoredArray: { description: '数组', properties: [] }, empty: null },
    }),
  );
  writeFileSync(join(root, 'AGENTS.md'), 'scenario-gate.config.schema.json');
  expect(checkSchemaDocumentation(root)).toEqual(
    expect.arrayContaining([expect.stringContaining('property empty is missing')]),
  );
});
