import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readEffectiveSpecs } from './spec-sources.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'effective-specs-'));
  await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
  await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
  await mkdir(join(root, 'openspec/changes/archive/old/specs/example'), { recursive: true });
  await writeFile(join(root, 'openspec/specs/example/spec.md'), `# Example\n\n### Requirement: BASE base\n\n#### Scenario: TC-PAYSDK-BASE-001 Base\n\nbase\n\n### Requirement: REMOVE remove\n\n#### Scenario: TC-PAYSDK-REMOVE-001 Remove\n\nremove\n`);
  await writeFile(join(root, 'openspec/changes/active/specs/example/spec.md'), `## ADDED Requirements\n\n### Requirement: ADD added\n\n#### Scenario: SCN-TEMPLATE-EXAMPLE-001 Added\n\nadded\n\n## MODIFIED Requirements\n\n### Requirement: BASE base changed\n\n#### Scenario: TC-PAYSDK-BASE-002 Changed\n\nchanged\n\n## REMOVED Requirements\n\n### Requirement: REMOVE remove\n\n## RENAMED Requirements\n\n- FROM: ADD TO: RENAMED\n`);
  await writeFile(join(root, 'openspec/changes/archive/old/specs/example/spec.md'), `### Requirement: ARCHIVE ignored\n\n#### Scenario: TC-PAYSDK-ARCHIVE-001 Ignored\n`);
  return root;
}

describe('readEffectiveSpecs', () => {
  it('merges active added, modified, removed, and renamed requirements while ignoring archive', async () => {
    const result = await readEffectiveSpecs(await fixture());
    const text = result.documents.map(document => document.content).join('\n');
    expect(text).toContain('TC-PAYSDK-BASE-002');
    expect(text).not.toContain('TC-PAYSDK-BASE-001');
    expect(text).not.toContain('TC-PAYSDK-REMOVE-001');
    expect(text).toContain('SCN-TEMPLATE-EXAMPLE-001');
    expect(text).not.toContain('ARCHIVE');
  });
});
