import { defineCase } from '../../src/cases/define-case.ts';
import { baseCoverage, runScenarioCli, type MutableCoverageInput } from './helpers.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const caseChecks = {
  'skipped-required-case': ['execution-validity', 'all-required-subitems'],
  'assertion-not-executed': ['execution-validity', 'all-required-subitems'],
  'missing-required-environment': ['execution-validity', 'all-required-subitems'],
  'stale-source-report': ['execution-validity'],
  'failed-assertion-at-full-coverage': ['execution-validity', 'pass-separate-from-coverage'],
  'missing-flow': ['flow-continuity'],
  'spliced-flow-evidence': ['flow-continuity'],
  'unit-cannot-cover-behavior': ['verification-kind-enforced'],
  'mixed-scenario-module-missing': ['all-kinds-required'],
  'missing-verification-metadata': ['metadata-stays-in-denominator'],
} as const;

for (const [caseKey, checks] of Object.entries(caseChecks) as Array<[keyof typeof caseChecks, readonly string[]]>) {
  defineCase({
    ownerId: 'SCN-SCENARIO-GATE-010', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'SCN-SCENARIO-GATE-010', caseKey, checks: [...checks] }],
  }, async ({ checkpoint, expect }) => {
    const input = structuredClone(baseCoverage()) as MutableCoverageInput;
    const report = input.reports[0]!;
    const binding = input.bindings[0]!;
    switch (caseKey) {
      case 'skipped-required-case': input.reports[0] = { ...report, status: 'skipped' }; break;
      case 'assertion-not-executed': input.reports[0] = { ...report, assertions: 0 }; break;
      case 'missing-required-environment': input.scenarios[0]!.cases[0]!.requiredIn.push('weapp'); break;
      case 'stale-source-report': input.reports[0] = { ...report, sourceDigest: 'stale' }; break;
      case 'failed-assertion-at-full-coverage': input.reports[0] = { ...report, status: 'failed' }; break;
      case 'missing-flow':
        delete input.bindings[0]!.flowId;
        delete input.bindings[0]!.flowCase;
        break;
      case 'spliced-flow-evidence': input.reports.splice(0, 1,
        { ...report, flow: { ...report.flow!, stages: ['prepare', 'invoke'] } },
        { ...report, flow: { ...report.flow!, continuityId: 'run-two', stages: ['query', 'result'] } }); break;
      case 'unit-cannot-cover-behavior':
        input.bindings[0] = { ...binding, environment: 'sdk-unit' };
        input.reports[0] = { ...report, project: 'sdk-unit' };
        break;
      case 'mixed-scenario-module-missing':
        input.scenarios[0]!.cases.push({ key: 'internal', kind: 'module', requiredIn: ['sdk-unit'], checks: ['internal'] });
        break;
      case 'missing-verification-metadata': input.sourceIssues = ['SCN-SAMPLE-TEST-002: verification metadata missing']; break;
    }
    const result = runScenarioCli(input);
    const output = JSON.parse(result.stdout);
    const issues = output.issues.join('\n');
    for (const checkpointName of checks) {
      await checkpoint(checkpointName, () => {
        expect(result.status).toBe(1);
        expect(issues).toMatch({
          'execution-validity': /(skipped|failed|stale|no executed assertions|missing (?:binding for )?weapp(?: evidence)?)/,
          'all-required-subitems': /(skipped|no executed assertions|missing binding)/,
          'pass-separate-from-coverage': /failed/,
          'flow-continuity': /(missing FLOW binding|missing continuous stages)/,
          'verification-kind-enforced': /behavior case cannot bind sdk-unit/,
          'all-kinds-required': /missing binding for sdk-unit/,
          'metadata-stays-in-denominator': /verification metadata missing/,
        }[checkpointName]!);
      });
    }
  }, { fixtureRoot });
}
