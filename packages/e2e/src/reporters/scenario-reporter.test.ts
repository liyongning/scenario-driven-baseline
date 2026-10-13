import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenarioReporter } from './scenario-reporter.ts';

describe('ScenarioReporter', () => {
  it('writes the Vitest result, concrete binding, executed checkpoints, and run fingerprints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'template-report-'));
    const outputFile = join(root, 'report.json');
    const reporter = new ScenarioReporter({
      outputFile,
      runId: 'run-1',
      fingerprints: {
        sourceDigest: 's',
        specDigest: 'p',
        protocolDigest: 'i',
        fixtureDigest: 'f',
        files: { 'scripts/a.ts': 'hash-a' },
      },
    });
    reporter.onTestCaseResult!({
      name: 'omitted',
      fullName: 'SCN-SAMPLE-CONTRACT-023 > omitted',
      module: { moduleId: '/repo/test.spec.ts' },
      project: { name: 'integration' },
      options: {
        meta: {
          scenarioCase: {
            ownerId: 'SCN-SAMPLE-CONTRACT-023',
            caseId: 'presence-omitted',
            environment: 'integration',
            fixtureCase: 'omitted',
            covers: [],
          },
        },
      },
      result: () => ({ state: 'passed' }),
      annotations: () => [
        { type: 'scenario-evidence', message: '{"assertions":2,"checkpoints":["absence","wire"]}' },
        {
          type: 'scenario-flow',
          message:
            '{"id":"FLOW-SAMPLE-001","caseKey":"normal","continuityId":"one-run","stages":["prepare","result"]}',
        },
      ],
    } as never);
    await reporter.onTestRunEnd!();
    const report = JSON.parse(await readFile(outputFile, 'utf8'));
    expect(report).toMatchObject({
      runId: 'run-1',
      sourceDigest: 's',
      protocolDigest: 'i',
      files: { 'scripts/a.ts': 'hash-a' },
      tests: [
        {
          runId: 'run-1',
          project: 'integration',
          fixtureDigest: 'f',
          caseId: 'presence-omitted',
          status: 'passed',
          assertions: 2,
          checkpoints: ['absence', 'wire'],
          flow: { id: 'FLOW-SAMPLE-001', continuityId: 'one-run' },
        },
      ],
    });
  });

  it('keeps skipped and failed tests as non-passing execution facts', () => {
    const reporter = new ScenarioReporter({
      outputFile: '/dev/null',
      runId: 'r',
      fingerprints: {
        sourceDigest: 's',
        specDigest: 'p',
        protocolDigest: 'i',
        fixtureDigest: 'f',
        files: {},
      },
    });
    const test = (state: string) => ({
      name: 'x',
      fullName: 'x',
      module: { moduleId: 'x.ts' },
      project: { name: 'weapp' },
      options: { meta: { scenarioCase: { caseId: state } } },
      result: () => ({ state }),
      annotations: () => [],
    });
    reporter.onTestCaseResult!(test('skipped') as never);
    reporter.onTestCaseResult!(test('failed') as never);
    expect(reporter.records()).toEqual([
      expect.objectContaining({ status: 'skipped', assertions: 0 }),
      expect.objectContaining({ status: 'failed', assertions: 0 }),
    ]);
  });

  it('records module evidence under its unit project with a null Fixture digest', () => {
    const reporter = new ScenarioReporter({
      outputFile: '/dev/null',
      runId: 'r',
      fingerprints: {
        sourceDigest: 's',
        specDigest: 'p',
        protocolDigest: 'i',
        fixtureDigest: 'f',
        files: {},
      },
    });
    reporter.onTestCaseResult!({
      name: 'internal',
      fullName: 'SCN-SAMPLE-CORE-001 headless-core-import-and-run',
      module: { moduleId: 'core.test.ts' },
      project: { name: 'sdk-unit' },
      options: {
        meta: {
          scenarioCase: {
            ownerId: 'SCN-SAMPLE-CORE-001',
            caseId: 'headless-core-import-and-run',
            environment: 'sdk-unit',
            fixtureCase: null,
            covers: [],
          },
        },
      },
      result: () => ({ state: 'passed' }),
      annotations: () => [
        {
          type: 'scenario-evidence',
          message: '{"assertions":1,"checkpoints":["headless-internal-core"]}',
        },
      ],
    } as never);
    expect(reporter.records()).toEqual([
      expect.objectContaining({ project: 'sdk-unit', fixtureDigest: null }),
    ]);
  });

  it('reads metadata from the Vitest 5 TestCase meta API', () => {
    const reporter = new ScenarioReporter({
      outputFile: '/dev/null',
      runId: 'r',
      fingerprints: {
        sourceDigest: 's',
        specDigest: 'p',
        protocolDigest: 'i',
        fixtureDigest: 'f',
        files: {},
      },
    });
    reporter.onTestCaseResult!({
      name: 'internal',
      fullName: 'SCN-SAMPLE-CORE-001 headless-core-import-and-run',
      module: { moduleId: 'core.test.ts' },
      project: { name: 'sdk-unit' },
      options: {},
      meta: () => ({
        scenarioCase: {
          ownerId: 'SCN-SAMPLE-CORE-001',
          caseId: 'headless-core-import-and-run',
          environment: 'sdk-unit',
          fixtureCase: null,
          covers: [],
        },
      }),
      result: () => ({ state: 'passed' }),
      annotations: () => [
        {
          type: 'scenario-evidence',
          message: '{"assertions":1,"checkpoints":["headless-internal-core"]}',
        },
      ],
    } as never);
    expect(reporter.records()).toEqual([
      expect.objectContaining({ caseId: 'headless-core-import-and-run', project: 'sdk-unit' }),
    ]);
  });

  it('records the logical integration environment for a physically split heavy project', () => {
    const reporter = new ScenarioReporter({
      outputFile: '/dev/null',
      runId: 'r',
      projectEnvironments: { 'integration-heavy': 'integration' },
      fingerprints: {
        sourceDigest: 's',
        specDigest: 'p',
        protocolDigest: 'i',
        fixtureDigest: 'f',
        files: {},
      },
    });
    reporter.onTestCaseResult!({
      name: 'heavy',
      fullName: 'SCN-SAMPLE-CONTRACT-023 heavy',
      module: { moduleId: 'heavy.spec.ts' },
      project: { name: 'integration-heavy' },
      options: {},
      meta: () => ({
        scenarioCase: {
          ownerId: 'SCN-SAMPLE-CONTRACT-023',
          caseId: 'heavy',
          environment: 'integration',
          fixtureCase: 'heavy',
          covers: [],
        },
      }),
      result: () => ({ state: 'passed' }),
      annotations: () => [],
    } as never);
    expect(reporter.records()).toEqual([expect.objectContaining({ project: 'integration' })]);
  });

  it('rejects a declared environment that does not match the physical project mapping', () => {
    const reporter = new ScenarioReporter({
      outputFile: '/dev/null',
      runId: 'r',
      projectEnvironments: { integration: 'integration', weapp: 'weapp' },
      fingerprints: {
        sourceDigest: 's',
        specDigest: 'p',
        protocolDigest: 'i',
        fixtureDigest: 'f',
        files: {},
      },
    });
    reporter.onTestCaseResult!({
      name: 'mismatched',
      fullName: 'SCN-SAMPLE-CONTRACT-023 mismatched',
      module: { moduleId: 'mismatched.spec.ts' },
      project: { name: 'integration' },
      options: {},
      meta: () => ({
        scenarioCase: {
          ownerId: 'SCN-SAMPLE-CONTRACT-023',
          caseId: 'mismatched',
          environment: 'weapp',
          fixtureCase: null,
          covers: [],
        },
      }),
      result: () => ({ state: 'passed' }),
      annotations: () => [],
    } as never);

    const [record] = reporter.records();
    expect(record).toEqual(
      expect.objectContaining({
        project: 'integration',
        status: 'failed',
        error: expect.stringContaining('integration'),
      }),
    );
    expect((record as unknown as { error: string }).error).toContain('weapp');
  });

  it('falls back to the physical project when binding metadata has no environment', () => {
    const reporter = new ScenarioReporter({
      outputFile: '/dev/null',
      runId: 'r',
      fingerprints: {
        sourceDigest: 's',
        specDigest: 'p',
        protocolDigest: 'i',
        fixtureDigest: 'f',
        files: {},
      },
    });
    reporter.onTestCaseResult!({
      name: 'legacy',
      fullName: 'SCN-SAMPLE-CONTRACT-023 legacy',
      module: { moduleId: 'legacy.spec.ts' },
      project: { name: 'integration' },
      options: {},
      meta: () => ({
        scenarioCase: {
          ownerId: 'SCN-SAMPLE-CONTRACT-023',
          caseId: 'legacy',
          fixtureCase: 'legacy',
          covers: [],
        },
      }),
      result: () => ({ state: 'passed' }),
      annotations: () => [],
    } as never);
    expect(reporter.records()).toEqual([expect.objectContaining({ project: 'integration' })]);
  });

  it('ignores unbound tests and preserves invalid evidence as zero assertions', () => {
    const reporter = new ScenarioReporter({
      outputFile: '/dev/null',
      runId: 'r',
      fingerprints: {
        sourceDigest: 's',
        specDigest: 'p',
        protocolDigest: 'i',
        fixtureDigest: 'f',
        files: {},
      },
    });
    const item = (meta: unknown, annotations: unknown[]) => ({
      name: 'case',
      fullName: 'case',
      module: { moduleId: 'case.ts' },
      project: { name: 'integration' },
      options: { meta },
      result: () => ({ state: 'passed' }),
      annotations: () => annotations,
    });
    reporter.onTestCaseResult!(item({}, []) as never);
    reporter.onTestCaseResult!(
      item({ scenarioCase: { caseId: 'invalid-json', fixtureCase: 'case' } }, [
        { type: 'scenario-evidence', message: '{' },
        { type: 'scenario-flow', message: '{' },
      ]) as never,
    );
    expect(reporter.records()).toEqual([
      expect.objectContaining({ caseId: 'invalid-json', assertions: 0, checkpoints: [] }),
    ]);
  });
});
