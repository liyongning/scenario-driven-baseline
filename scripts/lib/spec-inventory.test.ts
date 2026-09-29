import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeText, readSpecInventory } from './spec-inventory.ts';

const block = `\n\`\`\`json verification\n{"formatVersion":2,"checkpoints":{"sent":"request sent"},"cases":[{"key":"ok","kind":"behavior","requiredIn":["integration","weapp"],"checks":["sent"]}],"blockedBy":[]}\n\`\`\``;

describe('readSpecInventory', () => {
  it('extracts literal and nested AST text and rejects non-node values', () => {
    expect(nodeText(null)).toBe('');
    expect(nodeText('text')).toBe('');
    expect(nodeText({ value: 'literal' })).toBe('literal');
    expect(nodeText({ children: [{ value: 'nested' }, {}] })).toBe('nested');
  });
  it('uses remark AST to extract scenario verification and the authoritative FLOW table', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-spec-'));
    const path = join(root, 'spec.md');
    await writeFile(path, `#### Scenario: TC-PAYSDK-CORE-001 One\n- **WHEN** x\n- **THEN** y\n${block}\n## 必需集成流程（评审草案）\n\n| FLOW ID | 关联 Scenario | 公共入口与连续阶段/检查点 | 必需 case key | 必需环境 | 输入及验证说明 |\n| --- | --- | --- | --- | --- | --- |\n| FLOW-PAYSDK-001 | CORE-001 | pay → result | normal、long | integration、weapp | fixed |\n`);
    const inventory = await readSpecInventory([path]);
    expect(inventory.issues).toEqual([]);
    expect(inventory.scenarios[0]).toMatchObject({ id: 'TC-PAYSDK-CORE-001', verification: { cases: [{ key: 'ok', kind: 'behavior', requiredIn: ['integration', 'weapp'], checks: ['sent'] }] } });
    expect(inventory.flows[0]).toMatchObject({ id: 'FLOW-PAYSDK-001', cases: ['normal', 'long'], requiredIn: ['integration', 'weapp'] });
  });

  it('keeps missing/invalid metadata and duplicate IDs in the denominator as explicit issues', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-spec-'));
    const first = join(root, 'one.md');
    const second = join(root, 'two.md');
    await writeFile(first, '#### Scenario: TC-PAYSDK-CORE-001 One\n- **WHEN** x\n- **THEN** y\n');
    await writeFile(second, `#### Scenario: TC-PAYSDK-CORE-001 Again\n${block.replace('"sent"', '"unknown"')}`);
    const inventory = await readSpecInventory([first, second]);
    expect(inventory.scenarios).toHaveLength(2);
    expect(inventory.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('TC-PAYSDK-CORE-001: verification metadata missing'),
      expect.stringContaining('duplicate Scenario ID TC-PAYSDK-CORE-001'),
    ]));
  });

  it('reports malformed JSON, duplicate case keys/checkpoints, invalid FLOW IDs, and duplicate FLOW IDs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-spec-errors-'));
    const path = join(root, 'spec.md');
    const duplicateCases = '{"formatVersion":2,"checkpoints":{"x":"x"},"cases":[{"key":"same","kind":"behavior","requiredIn":["integration"],"checks":["x"]},{"key":"same","kind":"behavior","requiredIn":["integration"],"checks":["missing"]}],"blockedBy":[]}';
    await writeFile(path, `#### Scenario: TC-PAYSDK-CORE-001 Broken JSON

\`\`\`json verification
{
\`\`\`

#### Scenario: TC-PAYSDK-CORE-002 Duplicate cases

\`\`\`json verification
${duplicateCases}
\`\`\`

## 必需集成流程（评审草案）

| FLOW ID | 关联 Scenario | 公共入口与连续阶段/检查点 | 必需 case key | 必需环境 | 输入及验证说明 |
| --- | --- | --- | --- | --- | --- |
| BAD-FLOW | CORE-001 | pay → result | normal | integration | bad |
| FLOW-PAYSDK-001 | CORE-001 | pay → result | normal | integration | first |
| FLOW-PAYSDK-001 | CORE-001 | pay → result | normal | integration | duplicate |
`);
    const inventory = await readSpecInventory([path]);
    expect(inventory.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('verification JSON cannot be parsed'), expect.stringContaining('verification metadata missing'),
      expect.stringContaining('duplicate verification case key'), expect.stringContaining('unknown checkpoint missing'),
      expect.stringContaining('invalid FLOW ID BAD-FLOW'), expect.stringContaining('duplicate FLOW ID FLOW-PAYSDK-001'),
    ]));
  });

  it('rejects missing/unknown kinds and project categories that do not match the case kind', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-spec-'));
    const path = join(root, 'spec.md');
    const blocks = [
      '{"formatVersion":2,"checkpoints":{"x":"x"},"cases":[{"key":"x","requiredIn":["integration"],"checks":["x"]}],"blockedBy":[]}',
      '{"formatVersion":2,"checkpoints":{"x":"x"},"cases":[{"key":"x","kind":"unknown","requiredIn":["integration"],"checks":["x"]}],"blockedBy":[]}',
      '{"formatVersion":2,"checkpoints":{"x":"x"},"cases":[{"key":"x","kind":"module","requiredIn":["integration"],"checks":["x"]}],"blockedBy":[]}',
      '{"formatVersion":2,"checkpoints":{"x":"x"},"cases":[{"key":"x","kind":"behavior","requiredIn":["sdk-unit"],"checks":["x"]}],"blockedBy":[]}',
      '{"formatVersion":2,"checkpoints":{"x":"x"},"cases":[{"key":"x","kind":"engineering","requiredIn":["protocol-unit"],"checks":["x"]}],"blockedBy":[]}',
    ];
    await writeFile(path, blocks.map((json, index) => `#### Scenario: TC-PAYSDK-CORE-00${index + 1} Invalid\n\`\`\`json verification\n${json}\n\`\`\``).join('\n'));

    const inventory = await readSpecInventory([path]);

    expect(inventory.scenarios).toHaveLength(5);
    expect(inventory.issues.filter(issue => issue.includes('invalid verification metadata'))).toHaveLength(5);
  });

  it('reads the reviewed v2 denominator without reducing any category', async () => {
    const inventory = await readSpecInventory([
      new URL('../../openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk/spec.md', import.meta.url).pathname,
      new URL('../../openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk-contract/spec.md', import.meta.url).pathname,
    ]);
    const cases = inventory.scenarios.flatMap(scenario => scenario.verification?.cases ?? []);
    expect(inventory.issues).toEqual([]);
    expect(inventory.scenarios).toHaveLength(50);
    expect(cases).toHaveLength(226);
    expect(cases.filter(item => item.kind === 'behavior')).toHaveLength(153);
    expect(cases.filter(item => item.kind === 'module')).toHaveLength(20);
    expect(cases.filter(item => item.kind === 'engineering')).toHaveLength(53);
    expect(inventory.scenarios.filter(scenario => scenario.verification?.cases.some(item => item.kind === 'behavior'))).toHaveLength(40);
  });
});
