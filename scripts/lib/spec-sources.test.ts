import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverSpecSources, readEffectiveSpecs } from './spec-sources.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'effective-specs-'));
  await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
  await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
  await mkdir(join(root, 'openspec/changes/archive/old/specs/example'), { recursive: true });
  await writeFile(
    join(root, 'openspec/specs/example/spec.md'),
    `# Example\n\n### Requirement: BASE base\n\n#### Scenario: SCN-SAMPLE-BASE-001 Base\n\nbase\n\n### Requirement: REMOVE remove\n\n#### Scenario: SCN-SAMPLE-REMOVE-001 Remove\n\nremove\n`,
  );
  await writeFile(
    join(root, 'openspec/changes/active/specs/example/spec.md'),
    `## ADDED Requirements\n\n### Requirement: ADD added\n\n#### Scenario: SCN-TEMPLATE-EXAMPLE-001 Added\n\nadded\n\n## MODIFIED Requirements\n\n### Requirement: BASE base changed\n\n#### Scenario: SCN-SAMPLE-BASE-002 Changed\n\nchanged\n\n## REMOVED Requirements\n\n### Requirement: REMOVE remove\n\n## RENAMED Requirements\n\n- FROM: ADD TO: RENAMED\n`,
  );
  await writeFile(
    join(root, 'openspec/changes/archive/old/specs/example/spec.md'),
    `### Requirement: ARCHIVE ignored\n\n#### Scenario: SCN-SAMPLE-ARCHIVE-001 Ignored\n`,
  );
  return root;
}

describe('readEffectiveSpecs', () => {
  it('reports FLOW tables outside Requirements before archive projection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'effective-specs-flow-placement-'));
    await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
    await writeFile(
      join(root, 'openspec/specs/example/spec.md'),
      '| FLOW ID | Related | Stages | Cases | Environments | Notes |\n| --- | --- | --- | --- | --- | --- |\n| FLOW-TEST-001 | SCN-TEST-001 | create | normal | integration | outside |',
    );
    expect((await readEffectiveSpecs(root)).issues.join('\n')).toContain(
      'would be lost during archive',
    );
    await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
    await writeFile(
      join(root, 'openspec/changes/active/specs/example/spec.md'),
      '| FLOW ID | Related | Stages | Cases | Environments | Notes |\n| --- | --- | --- | --- | --- | --- |\n| FLOW-TEST-002 | SCN-TEST-001 | create | normal | integration | outside |',
    );
    expect((await readEffectiveSpecs(root)).issues.join('\n')).toContain(
      'openspec/changes/active/specs/example/spec.md: FLOW table',
    );
    await writeFile(
      join(root, 'openspec/specs/example/spec.md'),
      '```md\n| FLOW ID | Related | Stages | Cases | Environments | Notes |\n| --- | --- | --- | --- | --- | --- |\n```\n### Requirement: BASE inside\n',
    );
    await writeFile(
      join(root, 'openspec/changes/active/specs/example/spec.md'),
      '## MODIFIED Requirements\n### Requirement: BASE inside\n',
    );
    expect((await readEffectiveSpecs(root)).issues).toEqual([]);
  });
  it('merges active added, modified, removed, and renamed requirements while ignoring archive', async () => {
    const result = await readEffectiveSpecs(await fixture());
    const text = result.documents.map((document) => document.content).join('\n');
    expect(text).toContain('SCN-SAMPLE-BASE-002');
    expect(text).not.toContain('SCN-SAMPLE-BASE-001');
    expect(text).not.toContain('SCN-SAMPLE-REMOVE-001');
    expect(text).toContain('SCN-TEMPLATE-EXAMPLE-001');
    expect(text).not.toContain('ARCHIVE');
    expect((await discoverSpecSources(await fixture())).length).toBeGreaterThan(0);
  });

  it('handles missing spec trees and empty change roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'effective-specs-empty-'));
    expect(await readEffectiveSpecs(root)).toEqual({ documents: [], issues: [] });
    await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
    await writeFile(join(root, 'openspec/specs/example/spec.md'), '### Requirement: ONLY single\n');
    await writeFile(join(root, 'openspec/specs/example/notes.txt'), 'ignored');
    await mkdir(join(root, 'openspec/specs/archive'), { recursive: true });
    await writeFile(
      join(root, 'openspec/specs/archive/spec.md'),
      '### Requirement: ARCHIVED ignored\n',
    );
    expect((await readEffectiveSpecs(root)).documents.map((item) => item.content)).toEqual([
      '### Requirement: ONLY single',
    ]);
    await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
    await mkdir(join(root, 'openspec/changes/zeta/specs'), { recursive: true });
    await writeFile(
      join(root, 'openspec/changes/active/specs/example/spec.md'),
      '## RENAMED Requirements\n\n- FROM: MISSING TO: STILL-MISSING\n',
    );
    expect((await readEffectiveSpecs(root)).documents.map((item) => item.content)).toEqual([
      '### Requirement: ONLY single',
    ]);
  });

  it('reports invalid delta targets and conflicting active changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'effective-specs-conflicts-'));
    await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
    await mkdir(join(root, 'openspec/changes/one/specs/example'), { recursive: true });
    await mkdir(join(root, 'openspec/changes/two/specs/example'), { recursive: true });
    await writeFile(join(root, 'openspec/specs/example/spec.md'), '### Requirement: BASE base\n');
    await writeFile(
      join(root, 'openspec/changes/one/specs/example/spec.md'),
      '## MODIFIED Requirements\n\n### Requirement: MISSING missing\n\n### Requirement: BASE one\n',
    );
    await writeFile(
      join(root, 'openspec/changes/two/specs/example/spec.md'),
      '## MODIFIED Requirements\n\n### Requirement: BASE two\n\n## REMOVED Requirements\n\n### Requirement: MISSING missing\n',
    );
    const result = await readEffectiveSpecs(root);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('MODIFIED Requirement MISSING does not exist'),
        expect.stringContaining('REMOVED Requirement MISSING does not exist'),
        expect.stringContaining('both touch Requirement BASE'),
      ]),
    );
  });

  it('reports duplicate main requirements, added collisions, and rename collisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'effective-specs-collisions-'));
    await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
    await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
    await writeFile(
      join(root, 'openspec/specs/example/spec.md'),
      '### Requirement: BASE one\n\n### Requirement: BASE two\n\n### Requirement: TARGET target\n',
    );
    await writeFile(
      join(root, 'openspec/changes/active/specs/example/spec.md'),
      '## ADDED Requirements\n\n### Requirement: BASE replacement\n\n## RENAMED Requirements\n\n- FROM: BASE TO: TARGET\n',
    );
    const result = await readEffectiveSpecs(root);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate main Requirement BASE'),
        expect.stringContaining('ADDED Requirement BASE already exists'),
        expect.stringContaining('RENAMED target Requirement TARGET already exists'),
      ]),
    );
  });
});
