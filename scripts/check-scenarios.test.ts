import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateCoverage, loadReporterOutputs, runScenarioPrechecks, runScenariosCli, scenarioCoverageDefinition, type CoverageInput } from './check-scenarios.ts';

function base(): CoverageInput {
  return {
    current: { runId: 'run-1', sourceDigest: 'source', specDigest: 'spec', idlDigest: 'idl', fixtureDigest: 'fixture' },
    scenarios: [{ id: 'TC-PAYSDK-CORE-001', cases: [{ key: 'normal', kind: 'behavior', requiredIn: ['integration', 'weapp'], checks: ['phase', 'result'] }] }],
    contracts: [{ id: 'method#request#field', cases: ['normal'], requiredIn: ['integration'] }],
    flows: [{ id: 'FLOW-PAYSDK-001', cases: ['normal'], requiredIn: ['integration'], requiredStages: ['prepare', 'invoke', 'query', 'result'] }],
    bindings: [{ ownerId: 'FLOW-PAYSDK-001', caseId: 'flow-normal', fixtureCase: 'normal', environment: 'integration', covers: [
      { id: 'TC-PAYSDK-CORE-001', caseKey: 'normal', checks: ['phase', 'result'] },
      { id: 'method#request#field', caseKey: 'normal', checks: ['wire'] },
    ], flowId: 'FLOW-PAYSDK-001', flowCase: 'normal' }],
    reports: [{ runId: 'run-1', sourceDigest: 'source', specDigest: 'spec', idlDigest: 'idl', fixtureDigest: 'fixture', project: 'integration', file: 'flow.spec.ts', fullName: 'FLOW-PAYSDK-001 normal', caseId: 'flow-normal', status: 'passed', assertions: 3, checkpoints: ['phase', 'result', 'wire'], flow: { id: 'FLOW-PAYSDK-001', caseKey: 'normal', continuityId: 'one-run', stages: ['prepare', 'invoke', 'query', 'result'] } }],
  };
}

describe('evaluateCoverage', () => {
  it('keeps source inventory, bindings, and execution evidence as independent inputs', () => {
    const input = base();
    const missingBinding = evaluateCoverage({ ...input, bindings: [] });
    expect(missingBinding.issues).toEqual(expect.arrayContaining([expect.stringContaining('missing binding')]));
    const missingEvidence = evaluateCoverage({ ...input, reports: [] });
    expect(missingEvidence.issues).toEqual(expect.arrayContaining([expect.stringContaining('missing integration evidence')]));
    const failed = evaluateCoverage({ ...input, reports: [{ ...input.reports[0]!, status: 'failed' }] });
    expect(failed.executed).toBeGreaterThan(0);
    expect(failed.issues).toEqual(expect.arrayContaining([expect.stringContaining('failed')]));
  });

  it('rejects duplicate keys, zero assertions, stale reports, and Node evidence substituted for weapp', () => {
    const input = base();
    const duplicate = evaluateCoverage({ ...input, bindings: [input.bindings[0]!, input.bindings[0]!] });
    expect(duplicate.issues).toContain('duplicate binding key integration/flow-normal');
    const bad = { ...input.reports[0]!, assertions: 0, sourceDigest: 'old' };
    const result = evaluateCoverage({ ...input, bindings: [
      ...input.bindings,
      { ...input.bindings[0]!, environment: 'weapp', caseId: 'flow-normal-weapp' },
    ], reports: [bad] });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('has no executed assertions'), expect.stringContaining('is stale'),
      expect.stringContaining('missing weapp evidence'),
    ]));
  });

  it('requires each FLOW case to contain every stage in one continuous report', () => {
    const input = base();
    const split = [
      { ...input.reports[0]!, fullName: 'part one', flow: { id: 'FLOW-PAYSDK-001', caseKey: 'normal', continuityId: 'run-a', stages: ['prepare', 'invoke'] } },
      { ...input.reports[0]!, fullName: 'part two', caseId: 'flow-normal-2', flow: { id: 'FLOW-PAYSDK-001', caseKey: 'normal', continuityId: 'run-b', stages: ['query', 'result'] } },
    ];
    expect(evaluateCoverage({ ...input, reports: split }).issues).toEqual(expect.arrayContaining([expect.stringContaining('missing continuous stages')]));
  });

  it('rejects an unexplained inventory reduction against the saved baseline', () => {
    const input = base();
    expect(evaluateCoverage({ ...input, baselineIds: ['TC-PAYSDK-CORE-001', 'TC-PAYSDK-CORE-999'] }).issues).toContain('inventory item TC-PAYSDK-CORE-999 was removed without an approved reason');
    expect(evaluateCoverage({ ...input, baselineIds: ['TC-PAYSDK-CORE-999'], reductionReasons: { 'TC-PAYSDK-CORE-999': {
      reason: 'approved Spec removal', reviewId: 'review-1', sourceDigest: input.current.sourceDigest, evidence: ['review.json'],
    } } }).issues).not.toContain(expect.stringContaining('inventory item TC-PAYSDK-CORE-999'));
    expect(evaluateCoverage({ ...input, baselineIds: ['TC-PAYSDK-CORE-999'], reductionReasons: { 'TC-PAYSDK-CORE-999': {
      reason: '', reviewId: '', sourceDigest: 'old', evidence: [],
    } } }).issues).toEqual(expect.arrayContaining([
      expect.stringContaining('incomplete review record'), expect.stringContaining('review record is stale'),
    ]));
  });

  it('keeps all-Spec, payment behavior, protocol, and FLOW summaries independent', () => {
    const input = base();
    const moduleScenario = {
      id: 'TC-PAYSDK-CORE-002',
      cases: [{ key: 'internal', kind: 'module' as const, requiredIn: ['sdk-unit' as const], checks: ['internal'] }],
    };
    const moduleBinding = {
      ownerId: 'TC-PAYSDK-CORE-002', caseId: 'internal', fixtureCase: null, environment: 'sdk-unit' as const,
      covers: [{ id: 'TC-PAYSDK-CORE-002', caseKey: 'internal', checks: ['internal'] }],
    };
    const moduleReport = {
      ...input.reports[0]!, project: 'sdk-unit' as const, caseId: 'internal', fullName: 'TC-PAYSDK-CORE-002 internal',
      fixtureDigest: null, checkpoints: ['internal'],
    };
    const result = evaluateCoverage({
      ...input,
      scenarios: [...input.scenarios, moduleScenario],
      bindings: [...input.bindings, moduleBinding],
      reports: [...input.reports, moduleReport],
    });

    expect(result.summaries.allSpec).toMatchObject({ required: 2, executed: 1, passed: 1 });
    expect(result.summaries.paymentBehavior).toMatchObject({ required: 1, executed: 0, passed: 0 });
    expect(result.summaries.byKind.module).toMatchObject({ required: 1, executed: 1, passed: 1 });
    expect(result.summaries.protocol.required).toBeGreaterThan(0);
    expect(result.summaries.flows.required).toBeGreaterThan(0);
  });

  it('rejects project-kind mismatches and non-null module fixtures', () => {
    const input = base();
    const result = evaluateCoverage({
      ...input,
      scenarios: [{ id: 'TC-PAYSDK-CORE-002', cases: [{ key: 'internal', kind: 'module', requiredIn: ['sdk-unit'], checks: ['internal'] }] }],
      contracts: [], flows: [],
      bindings: [{ ...input.bindings[0]!, environment: 'integration', fixtureCase: 'forbidden', covers: [{ id: 'TC-PAYSDK-CORE-002', caseKey: 'internal', checks: ['internal'] }] }],
      reports: [],
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('module case cannot bind integration'),
      expect.stringContaining('module binding fixtureCase must be null'),
    ]));
  });

  it('rejects a FLOW reference that is absent from the declared inventory', () => {
    const input = base();
    const binding = { ...input.bindings[0]!, flowId: 'FLOW-PAYSDK-999' };
    expect(evaluateCoverage({ ...input, bindings: [binding] }).issues).toContain(
      'integration/flow-normal: unknown FLOW reference FLOW-PAYSDK-999',
    );
  });

  it('loads bindings and execution facts from saved reporter outputs without changing their project or fingerprints', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'payment-reports-'));
    const file = join(directory, 'integration.json');
    const binding = base().bindings[0]!;
    await writeFile(file, JSON.stringify({
      runId: 'run-1', sourceDigest: 'source', specDigest: 'spec', idlDigest: 'idl', fixtureDigest: 'fixture',
      tests: [{ ...base().reports[0], binding }],
    }));
    const loaded = await loadReporterOutputs([file]);
    expect(loaded.issues).toEqual([]);
    expect(loaded.bindings).toEqual([binding]);
    expect(loaded.reports).toEqual([expect.objectContaining({ project: 'integration', caseId: 'flow-normal', sourceDigest: 'source' })]);
  });

  it('reports malformed reporter envelopes, missing bindings, and record mismatches', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'payment-reports-bad-'));
    const malformed = join(directory, 'malformed.json');
    const noTests = join(directory, 'no-tests.json');
    const mismatched = join(directory, 'mismatched.json');
    await writeFile(malformed, '{');
    await writeFile(noTests, '{}');
    await writeFile(mismatched, JSON.stringify({
      runId: 'envelope', sourceDigest: 'envelope', specDigest: 'envelope', idlDigest: 'envelope', fixtureDigest: 'envelope',
      tests: [
        { ...base().reports[0], binding: undefined },
        { ...base().reports[0], runId: 'record', sourceDigest: 'record', specDigest: 'record', idlDigest: 'record', fixtureDigest: 'record', project: 'weapp', binding: base().bindings[0] },
        { ...base().reports[0], fixtureDigest: 'record', binding: { ...base().bindings[0], fixtureCase: null } },
      ],
    }));
    const loaded = await loadReporterOutputs([join(directory, 'missing.json'), malformed, noTests, mismatched]);
    expect(loaded.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('cannot be read'), expect.stringContaining('has no tests array'),
      expect.stringContaining('missing paymentCase binding'), expect.stringContaining('report project does not match'),
      expect.stringContaining('record runId differs'), expect.stringContaining('record sourceDigest differs'),
      expect.stringContaining('record specDigest differs'), expect.stringContaining('record idlDigest differs'),
      expect.stringContaining('record fixtureDigest differs'),
    ]));
  });

  it('rejects unknown covers, checkpoint drift, wrong fixture class, blocked items, and weak reports', () => {
    const input = base();
    const invalidBinding = { ...input.bindings[0]!, fixtureCase: null, covers: [
      { id: 'TC-PAYSDK-UNKNOWN-999', caseKey: 'missing', checks: [] },
      { id: 'TC-PAYSDK-CORE-001', caseKey: 'normal', checks: ['unknown'] },
    ] };
    const weakReport = { ...input.reports[0]!, status: 'skipped' as const, fullName: 'wrong', checkpoints: [] };
    const result = evaluateCoverage({
      ...input,
      sourceIssues: ['source inventory failed'],
      scenarios: [{ ...input.scenarios[0]!, blockedBy: ['review'] }],
      bindings: [invalidBinding], reports: [weakReport],
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      'source inventory failed', expect.stringContaining('has no checkpoints'), expect.stringContaining('unknown cover'),
      expect.stringContaining('behavior binding requires a fixtureCase'), expect.stringContaining('unknown checkpoint'),
      expect.stringContaining('report fullName does not carry'), expect.stringContaining('did not execute'),
      expect.stringContaining('skipped'), expect.stringContaining('blocked by review'),
    ]));
  });

  it('reports each incomplete FLOW evidence state independently', () => {
    const input = base();
    const bindingsWithoutFlow = input.bindings.map(binding => {
      const clone = { ...binding };
      delete clone.flowId;
      delete clone.flowCase;
      return clone;
    });
    expect(evaluateCoverage({ ...input, bindings: bindingsWithoutFlow }).issues).toEqual(expect.arrayContaining([expect.stringContaining('missing FLOW binding')]));
    expect(evaluateCoverage({ ...input, reports: [] }).issues).toEqual(expect.arrayContaining([expect.stringContaining('missing integration FLOW evidence')]));
    const stale = { ...input.reports[0]!, sourceDigest: 'old', assertions: 0, status: 'failed' as const };
    const issues = evaluateCoverage({ ...input, reports: [stale] }).issues;
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('FLOW evidence is stale'), expect.stringContaining('FLOW has no executed assertions'), expect.stringContaining('FLOW failed'),
    ]));
  });

  it('runs both controlled-input and live-inventory CLI composition paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'payment-scenario-cli-'));
    const inputFile = join(directory, 'input.json');
    await writeFile(inputFile, JSON.stringify(base()));
    expect(await runScenariosCli(['node', 'script', '--input', inputFile], process.cwd(), { PAYMENT_RUN_ID: 'run-1' })).toMatchObject({ exitCode: 1, output: { issues: expect.any(Array) } });

    const reportFile = join(directory, 'report.json');
    await writeFile(reportFile, JSON.stringify({ runId: 'run-1', sourceDigest: 'source', specDigest: 'spec', idlDigest: 'idl', fixtureDigest: 'fixture', tests: [{ ...base().reports[0], binding: base().bindings[0] }] }));
    const inventory = await runScenariosCli(['node', 'script', '--inventory', '--report', reportFile], process.cwd(), { PAYMENT_RUN_ID: 'run-1' });
    expect(inventory).toMatchObject({ exitCode: 1, output: { mode: 'inventory', scenarios: expect.any(Array), contracts: expect.any(Array) } });
    const complete = await runScenariosCli([], process.cwd(), {});
    expect(complete).toMatchObject({ exitCode: 1, output: { mode: 'complete', issues: expect.any(Array) } });
  });

  it('runs OpenSpec prechecks before report loading and keeps --input pure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-precheck-'));
    try {
      const calls: string[] = [];
      const command = (name: string) => { calls.push(name); return { status: 1 }; };
      const missing = await runScenarioPrechecks(root, command);
      expect(missing.issues[0]).toContain('openspec/specs directory is missing');
      expect(missing.issues).toContain('precheck: openspec CLI cannot be invoked');
      await mkdir(join(root, 'openspec/specs'), { recursive: true });
      await writeFile(join(root, 'scenario-gate.config.json'), JSON.stringify({
        scenarioIdPatterns: ['^SCN-[A-Z]+-\\d+$'], flowIdPatterns: ['^FLOW-[A-Z]+-\\d+$'], ownerIdPattern: '^SCN-[A-Z]+-\\d+$',
      }));
      const input = join(root, 'input.json');
      await writeFile(input, JSON.stringify(base()));
      const result = await runScenariosCli(['node', 'script', '--input', input], root, {}, () => { throw new Error('must not invoke openspec'); });
      expect(result.output.issues).toEqual(expect.any(Array));
      expect(calls).toEqual(['openspec']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps scenarios with missing verification in the denominator with empty executable cases', () => {
    expect(scenarioCoverageDefinition({ id: 'TC-PAYSDK-CORE-999' })).toEqual({ id: 'TC-PAYSDK-CORE-999', cases: [], blockedBy: [] });
    expect(scenarioCoverageDefinition({ id: 'TC-PAYSDK-CORE-001', verification: { cases: base().scenarios[0]!.cases, blockedBy: ['dependency'] } })).toMatchObject({ id: 'TC-PAYSDK-CORE-001', cases: expect.any(Array), blockedBy: ['dependency'] });
  });
});
