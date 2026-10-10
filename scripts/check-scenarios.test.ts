import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { base } from '../packages/e2e/tests/tooling/helpers.ts';
import { evaluateCoverage, loadReporterOutputs } from './check-scenarios.ts';

describe('evaluateCoverage', () => {
  it('keeps source inventory, bindings, and execution evidence as independent inputs', () => {
    const input = base();
    const missingBinding = evaluateCoverage({ ...input, bindings: [] });
    expect(missingBinding.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('missing binding')]),
    );
    const missingEvidence = evaluateCoverage({ ...input, reports: [] });
    expect(missingEvidence.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('missing integration evidence')]),
    );
    const failed = evaluateCoverage({
      ...input,
      reports: [{ ...input.reports[0]!, status: 'failed' }],
    });
    expect(failed.executed).toBeGreaterThan(0);
    expect(failed.issues).toEqual(expect.arrayContaining([expect.stringContaining('failed')]));
  });

  it('rejects duplicate keys, zero assertions, stale reports, and Node evidence substituted for weapp', () => {
    const input = base();
    const duplicate = evaluateCoverage({
      ...input,
      bindings: [input.bindings[0]!, input.bindings[0]!],
    });
    expect(duplicate.issues).toContain('duplicate binding key integration/flow-normal');
    const bad = { ...input.reports[0]!, assertions: 0, sourceDigest: 'old' };
    const result = evaluateCoverage({
      ...input,
      bindings: [
        ...input.bindings,
        { ...input.bindings[0]!, environment: 'weapp', caseId: 'flow-normal-weapp' },
      ],
      reports: [bad],
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('has no executed assertions'),
        expect.stringContaining('is stale'),
        expect.stringContaining('missing weapp evidence'),
      ]),
    );
  });

  it('requires each FLOW case to contain every stage in one continuous report', () => {
    const input = base();
    const split = [
      {
        ...input.reports[0]!,
        fullName: 'part one',
        flow: {
          id: 'FLOW-SAMPLE-001',
          caseKey: 'normal',
          continuityId: 'run-a',
          stages: ['prepare', 'invoke'],
        },
      },
      {
        ...input.reports[0]!,
        fullName: 'part two',
        caseId: 'flow-normal-2',
        flow: {
          id: 'FLOW-SAMPLE-001',
          caseKey: 'normal',
          continuityId: 'run-b',
          stages: ['query', 'result'],
        },
      },
    ];
    expect(evaluateCoverage({ ...input, reports: split }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining('missing continuous stages')]),
    );
  });

  it('rejects an unexplained inventory reduction against the saved baseline', () => {
    const input = base();
    expect(
      evaluateCoverage({ ...input, baselineIds: ['SCN-SAMPLE-CORE-001', 'SCN-SAMPLE-CORE-999'] })
        .issues,
    ).toContain('inventory item SCN-SAMPLE-CORE-999 was removed without an approved reason');
    expect(
      evaluateCoverage({
        ...input,
        baselineIds: ['SCN-SAMPLE-CORE-999'],
        reductionReasons: {
          'SCN-SAMPLE-CORE-999': {
            reason: 'approved Spec removal',
            reviewId: 'review-1',
            sourceDigest: input.current.sourceDigest,
            evidence: ['review.json'],
          },
        },
      }).issues,
    ).not.toContain(expect.stringContaining('inventory item SCN-SAMPLE-CORE-999'));
    expect(
      evaluateCoverage({
        ...input,
        baselineIds: ['SCN-SAMPLE-CORE-999'],
        reductionReasons: {
          'SCN-SAMPLE-CORE-999': {
            reason: '',
            reviewId: '',
            sourceDigest: 'old',
            evidence: [],
          },
        },
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('incomplete review record'),
        expect.stringContaining('review record is stale'),
      ]),
    );
  });

  it('keeps all-Spec, public behavior, protocol, and FLOW summaries independent', () => {
    const input = base();
    const moduleScenario = {
      id: 'SCN-SAMPLE-CORE-002',
      cases: [
        {
          key: 'internal',
          kind: 'module' as const,
          requiredIn: ['sdk-unit' as const],
          checks: ['internal'],
        },
      ],
    };
    const moduleBinding = {
      ownerId: 'SCN-SAMPLE-CORE-002',
      caseId: 'internal',
      fixtureCase: null,
      environment: 'sdk-unit' as const,
      covers: [{ id: 'SCN-SAMPLE-CORE-002', caseKey: 'internal', checks: ['internal'] }],
    };
    const moduleReport = {
      ...input.reports[0]!,
      project: 'sdk-unit' as const,
      caseId: 'internal',
      fullName: 'SCN-SAMPLE-CORE-002 internal',
      fixtureDigest: null,
      checkpoints: ['internal'],
    };
    const result = evaluateCoverage({
      ...input,
      scenarios: [...input.scenarios, moduleScenario],
      bindings: [...input.bindings, moduleBinding],
      reports: [...input.reports, moduleReport],
    });

    expect(result.summaries.allSpec).toMatchObject({ required: 2, executed: 1, passed: 1 });
    expect(result.summaries.publicBehavior).toMatchObject({ required: 1, executed: 0, passed: 0 });
    expect(result.summaries.byKind.module).toMatchObject({ required: 1, executed: 1, passed: 1 });
    expect(result.summaries.protocol.required).toBeGreaterThan(0);
    expect(result.summaries.flows.required).toBeGreaterThan(0);
  });

  it('rejects project-kind mismatches and non-null module fixtures', () => {
    const input = base();
    const result = evaluateCoverage({
      ...input,
      scenarios: [
        {
          id: 'SCN-SAMPLE-CORE-002',
          cases: [
            { key: 'internal', kind: 'module', requiredIn: ['sdk-unit'], checks: ['internal'] },
          ],
        },
      ],
      contracts: [],
      flows: [],
      bindings: [
        {
          ...input.bindings[0]!,
          environment: 'integration',
          fixtureCase: 'forbidden',
          covers: [{ id: 'SCN-SAMPLE-CORE-002', caseKey: 'internal', checks: ['internal'] }],
        },
      ],
      reports: [],
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('module case cannot bind integration'),
        expect.stringContaining('module binding fixtureCase must be null'),
      ]),
    );
  });

  it('rejects a FLOW reference that is absent from the declared inventory', () => {
    const input = base();
    const binding = { ...input.bindings[0]!, flowId: 'FLOW-SAMPLE-999' };
    expect(evaluateCoverage({ ...input, bindings: [binding] }).issues).toContain(
      'integration/flow-normal: unknown FLOW reference FLOW-SAMPLE-999',
    );
  });

  it('loads bindings and execution facts from saved reporter outputs without changing their project or fingerprints', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'template-reports-'));
    const file = join(directory, 'integration.json');
    const withFiles = join(directory, 'integration-files.json');
    const binding = base().bindings[0]!;
    const envelope = {
      runId: 'run-1',
      sourceDigest: 'source',
      specDigest: 'spec',
      protocolDigest: 'idl',
      fixtureDigest: 'fixture',
      tests: [{ ...base().reports[0], binding }],
    };
    await writeFile(file, JSON.stringify(envelope));
    // 信封带 files 明细时随之进入报告；不带时保持原样（GATE-14 变化文件明细）。
    await writeFile(withFiles, JSON.stringify({ ...envelope, files: { 'src/a.ts': 'hash' } }));
    const loaded = await loadReporterOutputs([file, withFiles]);
    expect(loaded.issues).toEqual([]);
    expect(loaded.bindings).toEqual([binding, binding]);
    expect(loaded.reports).toHaveLength(2);
    expect(loaded.reports[0]).toEqual(
      expect.objectContaining({
        project: 'integration',
        caseId: 'flow-normal',
        sourceDigest: 'source',
      }),
    );
    expect(loaded.reports[0]).not.toHaveProperty('files');
    expect(loaded.reports[1]).toEqual(expect.objectContaining({ files: { 'src/a.ts': 'hash' } }));
  });

  it('rejects partial reports from affected runs and keeps full reports acceptable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'template-reports-partial-'));
    const partial = join(directory, 'partial.json');
    const full = join(directory, 'full.json');
    const envelope = {
      runId: base().reports[0]!.runId,
      sourceDigest: 'source',
      specDigest: 'spec',
      protocolDigest: 'idl',
      fixtureDigest: 'fixture',
      tests: [{ ...base().reports[0], binding: base().bindings[0]! }],
    };
    await writeFile(partial, JSON.stringify({ ...envelope, partial: true }));
    await writeFile(full, JSON.stringify(envelope));
    const loaded = await loadReporterOutputs([partial, full]);
    // 带 partial 标记的报告来自按需运行，不能作为验收证据（GATE-13）。
    expect(loaded.partial).toEqual([partial]);
    expect(loaded.issues).toEqual([
      `${partial}: partial 报告来自按需运行，并非零退出，不能作为验收证据`,
    ]);
    const complete = await loadReporterOutputs([full]);
    expect(complete.partial).toEqual([]);
    expect(complete.issues).toEqual([]);
  });

  it('reports malformed reporter envelopes, missing bindings, and record mismatches', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'template-reports-bad-'));
    const malformed = join(directory, 'malformed.json');
    const noTests = join(directory, 'no-tests.json');
    const mismatched = join(directory, 'mismatched.json');
    await writeFile(malformed, '{');
    await writeFile(noTests, '{}');
    await writeFile(
      mismatched,
      JSON.stringify({
        runId: 'envelope',
        sourceDigest: 'envelope',
        specDigest: 'envelope',
        protocolDigest: 'envelope',
        fixtureDigest: 'envelope',
        tests: [
          { ...base().reports[0], binding: undefined },
          {
            ...base().reports[0],
            runId: 'record',
            sourceDigest: 'record',
            specDigest: 'record',
            protocolDigest: 'record',
            fixtureDigest: 'record',
            project: 'weapp',
            binding: base().bindings[0],
          },
          {
            ...base().reports[0],
            fixtureDigest: 'record',
            binding: { ...base().bindings[0], fixtureCase: null },
          },
        ],
      }),
    );
    const loaded = await loadReporterOutputs([
      join(directory, 'missing.json'),
      malformed,
      noTests,
      mismatched,
    ]);
    expect(loaded.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cannot be read'),
        expect.stringContaining('has no tests array'),
        expect.stringContaining('missing scenarioCase binding'),
        expect.stringContaining('report project does not match'),
        expect.stringContaining('record runId differs'),
        expect.stringContaining('record sourceDigest differs'),
        expect.stringContaining('record specDigest differs'),
        expect.stringContaining('record protocolDigest differs'),
        expect.stringContaining('record fixtureDigest differs'),
      ]),
    );
  });

  it('rejects unknown covers, checkpoint drift, wrong fixture class, blocked items, and weak reports', () => {
    const input = base();
    const invalidBinding = {
      ...input.bindings[0]!,
      fixtureCase: null,
      covers: [
        { id: 'SCN-SAMPLE-UNKNOWN-999', caseKey: 'missing', checks: [] },
        { id: 'SCN-SAMPLE-CORE-001', caseKey: 'normal', checks: ['unknown'] },
      ],
    };
    const weakReport = {
      ...input.reports[0]!,
      status: 'skipped' as const,
      fullName: 'wrong',
      checkpoints: [],
    };
    const result = evaluateCoverage({
      ...input,
      sourceIssues: ['source inventory failed'],
      scenarios: [{ ...input.scenarios[0]!, blockedBy: ['review'] }],
      bindings: [invalidBinding],
      reports: [weakReport],
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'source inventory failed',
        expect.stringContaining('has no checkpoints'),
        expect.stringContaining('unknown cover'),
        expect.stringContaining('behavior binding requires a fixtureCase'),
        expect.stringContaining('unknown checkpoint'),
        expect.stringContaining('report fullName does not carry'),
        expect.stringContaining('did not execute'),
        expect.stringContaining('skipped'),
        expect.stringContaining('blocked by review'),
      ]),
    );
  });

  it('reports each incomplete FLOW evidence state independently', () => {
    const input = base();
    const bindingsWithoutFlow = input.bindings.map((binding) => {
      const clone = { ...binding };
      delete clone.flowId;
      delete clone.flowCase;
      return clone;
    });
    expect(evaluateCoverage({ ...input, bindings: bindingsWithoutFlow }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining('missing FLOW binding')]),
    );
    expect(evaluateCoverage({ ...input, reports: [] }).issues).toEqual(
      expect.arrayContaining([expect.stringContaining('missing integration FLOW evidence')]),
    );
    const stale = {
      ...input.reports[0]!,
      sourceDigest: 'old',
      assertions: 0,
      status: 'failed' as const,
    };
    const issues = evaluateCoverage({ ...input, reports: [stale] }).issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('FLOW evidence is stale'),
        expect.stringContaining('FLOW has no executed assertions'),
        expect.stringContaining('FLOW failed'),
      ]),
    );
  });
});
