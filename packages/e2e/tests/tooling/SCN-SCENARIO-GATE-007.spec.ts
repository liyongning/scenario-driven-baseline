import {
  cliEvidence,
  enableInventory,
  fixtureRoot,
  flowHeader,
  runGate,
  verification,
  writeSpec,
} from './scenario-gate-helpers.ts';

const registered = `### Requirement: flow\n#### Scenario: SCN-TEST-001 Example\n${verification()}\n`;

cliEvidence(
  'SCN-SCENARIO-GATE-007',
  'invalid-flow-row-cli',
  ['flow-row-schema'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        `### Requirement: flow\n${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | sdk-unit | invalid |`,
      );
      const result = runGate(fixture.root);
      await check('flow-row-schema', () =>
        context.expect(result.output?.issues.join('\n')).toContain('invalid FLOW row'),
      );
    } finally {
      fixture.cleanup();
    }
  },
);

cliEvidence(
  'SCN-SCENARIO-GATE-007',
  'outside-flow-table-cli',
  ['outside-table-rejected', 'inside-table-accepted'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        `${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | integration | outside |`,
      );
      const result = runGate(fixture.root);
      await check('outside-table-rejected', () =>
        context.expect(result.output?.issues.join('\n')).toContain('would be lost during archive'),
      );
      writeSpec(
        fixture.root,
        `${registered}${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | integration | inside |`,
      );
      enableInventory(fixture.root);
      const restored = runGate(fixture.root, ['--inventory']);
      await check('inside-table-accepted', () =>
        context
          .expect(((restored.output?.flows as Array<{ id: string }>) ?? []).map((item) => item.id))
          .toContain('FLOW-TEST-001'),
      );
    } finally {
      fixture.cleanup();
    }
  },
);

cliEvidence(
  'SCN-SCENARIO-GATE-007',
  'unregistered-related-scenario-cli',
  ['related-scenarios-registered'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        `${registered}${flowHeader}| FLOW-TEST-001 | SCN-TEST-001、SCN-TEST-999 | create → observe | normal | integration | unregistered |`,
      );
      enableInventory(fixture.root);
      const result = runGate(fixture.root);
      await check('related-scenarios-registered', () =>
        context.expect(result.output?.issues.join('\n')).toContain('SCN-TEST-999'),
      );
    } finally {
      fixture.cleanup();
    }
  },
);
