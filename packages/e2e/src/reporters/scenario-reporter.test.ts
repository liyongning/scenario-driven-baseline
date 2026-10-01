import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenarioReporter } from './scenario-reporter.ts';

describe('ScenarioReporter', () => {
  it('writes the Vitest result, concrete binding, executed checkpoints, and run fingerprints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-report-'));
    const outputFile = join(root, 'report.json');
    const reporter = new ScenarioReporter({ outputFile, runId: 'run-1', project: 'integration', fingerprints: { sourceDigest: 's', specDigest: 'p', idlDigest: 'i', fixtureDigest: 'f' } });
    reporter.onTestCaseResult!({
      name: 'omitted', fullName: 'SCN-SAMPLE-CONTRACT-023 > omitted', module: { moduleId: '/repo/test.spec.ts' },
      options: { meta: { paymentCase: { ownerId: 'SCN-SAMPLE-CONTRACT-023', caseId: 'presence-omitted', environment: 'integration', fixtureCase: 'omitted', covers: [] } } },
      result: () => ({ state: 'passed' }), annotations: () => [
        { type: 'payment-evidence', message: '{"assertions":2,"checkpoints":["absence","wire"]}' },
        { type: 'payment-flow', message: '{"id":"FLOW-SAMPLE-001","caseKey":"normal","continuityId":"one-run","stages":["prepare","result"]}' },
      ],
    } as never);
    await reporter.onTestRunEnd!();
    const report = JSON.parse(await readFile(outputFile, 'utf8'));
    expect(report).toMatchObject({ runId: 'run-1', sourceDigest: 's', tests: [{ runId: 'run-1', project: 'integration', fixtureDigest: 'f', caseId: 'presence-omitted', status: 'passed', assertions: 2, checkpoints: ['absence', 'wire'], flow: { id: 'FLOW-SAMPLE-001', continuityId: 'one-run' } }] });
  });

  it('keeps skipped and failed tests as non-passing execution facts', () => {
    const reporter = new ScenarioReporter({ outputFile: '/dev/null', runId: 'r', project: 'weapp', fingerprints: { sourceDigest: 's', specDigest: 'p', idlDigest: 'i', fixtureDigest: 'f' } });
    const test = (state: string) => ({ name: 'x', fullName: 'x', module: { moduleId: 'x.ts' }, options: { meta: { paymentCase: { caseId: state } } }, result: () => ({ state }), annotations: () => [] });
    reporter.onTestCaseResult!(test('skipped') as never);
    reporter.onTestCaseResult!(test('failed') as never);
    expect(reporter.records()).toEqual([expect.objectContaining({ status: 'skipped', assertions: 0 }), expect.objectContaining({ status: 'failed', assertions: 0 })]);
  });

  it('records module evidence under its unit project with a null Fixture digest', () => {
    const reporter = new ScenarioReporter({ outputFile: '/dev/null', runId: 'r', project: 'sdk-unit', fingerprints: { sourceDigest: 's', specDigest: 'p', idlDigest: 'i', fixtureDigest: 'f' } });
    reporter.onTestCaseResult!({
      name: 'internal', fullName: 'SCN-SAMPLE-CORE-001 headless-core-import-and-run', module: { moduleId: 'core.test.ts' },
      options: { meta: { paymentCase: { ownerId: 'SCN-SAMPLE-CORE-001', caseId: 'headless-core-import-and-run', environment: 'sdk-unit', fixtureCase: null, covers: [] } } },
      result: () => ({ state: 'passed' }), annotations: () => [{ type: 'payment-evidence', message: '{"assertions":1,"checkpoints":["headless-internal-core"]}' }],
    } as never);
    expect(reporter.records()).toEqual([expect.objectContaining({ project: 'sdk-unit', fixtureDigest: null })]);
  });

  it('reads metadata from the Vitest 5 TestCase meta API', () => {
    const reporter = new ScenarioReporter({ outputFile: '/dev/null', runId: 'r', fingerprints: { sourceDigest: 's', specDigest: 'p', idlDigest: 'i', fixtureDigest: 'f' } });
    reporter.onTestCaseResult!({
      name: 'internal', fullName: 'SCN-SAMPLE-CORE-001 headless-core-import-and-run', module: { moduleId: 'core.test.ts' },
      project: { name: 'sdk-unit' }, options: {},
      meta: () => ({ paymentCase: { ownerId: 'SCN-SAMPLE-CORE-001', caseId: 'headless-core-import-and-run', environment: 'sdk-unit', fixtureCase: null, covers: [] } }),
      result: () => ({ state: 'passed' }), annotations: () => [{ type: 'payment-evidence', message: '{"assertions":1,"checkpoints":["headless-internal-core"]}' }],
    } as never);
    expect(reporter.records()).toEqual([expect.objectContaining({ caseId: 'headless-core-import-and-run', project: 'sdk-unit' })]);
  });

  it('ignores unbound tests and preserves invalid evidence as zero assertions', () => {
    const reporter = new ScenarioReporter({ outputFile: '/dev/null', runId: 'r', project: 'integration', fingerprints: { sourceDigest: 's', specDigest: 'p', idlDigest: 'i', fixtureDigest: 'f' } });
    const item = (meta: unknown, annotations: unknown[]) => ({
      name: 'case', fullName: 'case', module: { moduleId: 'case.ts' }, project: { name: 'integration' },
      options: { meta }, result: () => ({ state: 'passed' }), annotations: () => annotations,
    });
    reporter.onTestCaseResult!(item({}, []) as never);
    reporter.onTestCaseResult!(item({ paymentCase: { caseId: 'invalid-json', fixtureCase: 'case' } }, [{ type: 'payment-evidence', message: '{' }, { type: 'payment-flow', message: '{' }]) as never);
    expect(reporter.records()).toEqual([expect.objectContaining({ caseId: 'invalid-json', assertions: 0, checkpoints: [] })]);
  });
});
