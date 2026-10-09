import {
  cliEvidence,
  enableInventory,
  fixtureRoot,
  runGate,
  verification,
  writeSpec,
} from './scenario-gate-helpers.ts';

cliEvidence(
  'SCN-SCENARIO-GATE-003',
  'active-change-cli',
  ['main-specs-baseline', 'delta-merge', 'archive-ignored'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        '### Requirement: BASE baseline\n#### Scenario: SCN-TEST-001 Old\n' + verification(),
      );
      writeSpec(
        fixture.root,
        '## MODIFIED Requirements\n### Requirement: BASE changed\n#### Scenario: SCN-TEST-002 Changed\n' +
          verification() +
          '\n## ADDED Requirements\n### Requirement: ADD added\n#### Scenario: SCN-TEST-003 Added\n' +
          verification(),
        'openspec/changes/active/specs/sample/spec.md',
      );
      writeSpec(
        fixture.root,
        '### Requirement: ARCHIVE old\n#### Scenario: SCN-TEST-999 Archived\n' + verification(),
        'openspec/changes/archive/old/specs/sample/spec.md',
      );
      enableInventory(fixture.root);
      const result = runGate(fixture.root, ['--inventory']);
      const ids = ((result.output?.scenarios as Array<{ id: string }>) ?? []).map(
        (item) => item.id,
      );
      await check('main-specs-baseline', () => context.expect(ids).toContain('SCN-TEST-002'));
      await check('delta-merge', () =>
        context
          .expect(ids)
          .toEqual(context.expect.arrayContaining(['SCN-TEST-002', 'SCN-TEST-003'])),
      );
      await check('archive-ignored', () => context.expect(ids).not.toContain('SCN-TEST-999'));
    } finally {
      fixture.cleanup();
    }
  },
);
