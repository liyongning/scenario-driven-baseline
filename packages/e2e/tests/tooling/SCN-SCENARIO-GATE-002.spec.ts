import {
  cliEvidence,
  fixtureRoot,
  runGate,
  verification,
  writeSpec,
} from './scenario-gate-helpers.ts';

cliEvidence(
  'SCN-SCENARIO-GATE-002',
  'missing-id-cli',
  ['missing-id-rejected', 'stays-in-denominator'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        `### Requirement: TEST id\n#### Scenario: Missing\n${verification()}`,
      );
      const result = runGate(fixture.root);
      await check('missing-id-rejected', () => {
        context.expect(result.status).toBe(1);
        context
          .expect(result.output?.issues.join('\n'))
          .toContain('Scenario heading Scenario: Missing is malformed');
      });
      await check('stays-in-denominator', () =>
        context
          .expect(result.output?.scenarios)
          .toEqual([context.expect.objectContaining({ id: 'Scenario: Missing' })]),
      );
    } finally {
      fixture.cleanup();
    }
  },
);

cliEvidence(
  'SCN-SCENARIO-GATE-002',
  'pattern-mismatch-cli',
  ['pattern-mismatch-rejected', 'stays-in-denominator'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        `### Requirement: TEST id\n#### Scenario: OTHER-001 Invalid\n${verification()}`,
      );
      const result = runGate(fixture.root);
      await check('pattern-mismatch-rejected', () => {
        context.expect(result.status).toBe(1);
        context
          .expect(result.output?.issues.join('\n'))
          .toContain('Scenario ID OTHER-001 does not match');
      });
      await check('stays-in-denominator', () =>
        context
          .expect(result.output?.scenarios)
          .toEqual([context.expect.objectContaining({ id: 'OTHER-001' })]),
      );
    } finally {
      fixture.cleanup();
    }
  },
);

cliEvidence(
  'SCN-SCENARIO-GATE-002',
  'duplicate-across-sources-cli',
  ['duplicate-rejected'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        `### Requirement: ONE first\n#### Scenario: SCN-TEST-001 First\n${verification()}`,
      );
      writeSpec(
        fixture.root,
        `### Requirement: TWO second\n#### Scenario: SCN-TEST-001 Second\n${verification()}`,
        'openspec/specs/other/spec.md',
      );
      const result = runGate(fixture.root);
      await check('duplicate-rejected', () => {
        context.expect(result.status).toBe(1);
        context.expect(result.output?.issues).toContain('duplicate Scenario ID SCN-TEST-001');
      });
    } finally {
      fixture.cleanup();
    }
  },
);
