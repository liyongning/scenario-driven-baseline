import { expect, test } from 'vitest';
import { readSpecInventory } from '../../../../scripts/lib/spec-inventory.ts';

test('GATE-006 rejects multiple verification blocks', async () => {
  const block = '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}';
  const content = ['#### Scenario: SCN-SCENARIO-GATE-006 Duplicate', '', '```json verification', block, '```', '```json verification', block, '```'].join('\n');
  const result = await readSpecInventory([{ path: 'fixture/spec.md', kind: 'main', content }]);
  expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining('multiple verification metadata blocks')]));
});
