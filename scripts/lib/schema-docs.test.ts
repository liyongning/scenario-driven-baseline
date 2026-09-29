import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { checkSchemaDocumentation } from './schema-docs.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test('requires every schema property to carry documentation and AGENTS references', () => {
  const root = mkdtempSync(join(tmpdir(), 'schema-docs-')); roots.push(root);
  mkdirSync(join(root, 'scripts'));
  for (const path of ['scenario-gate.config.schema.json', 'scripts/verification.schema.json', 'scripts/flow.schema.json']) {
    writeFileSync(join(root, path), JSON.stringify({ properties: { top: { type: 'object', properties: { nested: { type: 'string' } } } } }));
  }
  writeFileSync(join(root, 'AGENTS.md'), 'scenario-gate.config.schema.json');
  const issues = checkSchemaDocumentation(root);
  expect(issues).toEqual(expect.arrayContaining([
    expect.stringContaining('property top is missing'),
    expect.stringContaining('property nested is missing'),
    expect.stringContaining('scripts/verification.schema.json'),
  ]));
});

test('accepts the repository schemas and root documentation', () => {
  expect(checkSchemaDocumentation(process.cwd())).toEqual([]);
});
