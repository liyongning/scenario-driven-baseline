import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence, fixtureRoot, runGate } from './scenario-gate-helpers.ts';

function input() {
  return {
    current: {
      runId: 'r',
      sourceDigest: 's',
      specDigest: 's',
      protocolDigest: 'i',
      fixtureDigest: 'f',
    },
    scenarios: [],
    contracts: [],
    flows: [],
    bindings: [
      {
        ownerId: 'SCN-TEST-001',
        caseId: 'unknown',
        fixtureCase: 'unknown',
        environment: 'integration',
        covers: [{ id: 'SCN-TEST-999', caseKey: 'unknown', checks: ['done'] }],
        flowId: 'FLOW-TEST-999',
        flowCase: 'unknown',
      },
    ],
    reports: [],
  };
}

cliEvidence(
  'SCN-SCENARIO-GATE-004',
  'lost-flow-table-cli',
  ['unknown-flow-reference'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeFileSync(join(fixture.root, 'input.json'), JSON.stringify(input()));
      const result = runGate(fixture.root, ['--input', 'input.json']);
      await check('unknown-flow-reference', () => {
        context.expect(result.status).toBe(1);
        context
          .expect(result.output?.issues.join('\n'))
          .toContain('unknown FLOW reference FLOW-TEST-999');
      });
    } finally {
      fixture.cleanup();
    }
  },
);
