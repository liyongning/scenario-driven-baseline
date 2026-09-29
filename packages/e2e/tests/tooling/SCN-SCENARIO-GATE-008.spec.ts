import { expect, test } from 'vitest';
import { checkSchemaDocumentation } from '../../../../scripts/lib/schema-docs.ts';

test('GATE-008 accepts schema descriptions and AGENTS references', () => {
  expect(checkSchemaDocumentation(process.cwd())).toEqual([]);
});
