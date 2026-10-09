import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, test, type TestContext } from 'vitest';
import {
  createControlledRoot,
  minimalManifest,
} from '../packages/e2e/tests/tooling/controlled-root.ts';
import { enableInventory } from '../packages/e2e/tests/tooling/scenario-gate-helpers.ts';
import { type MutableCoverageInput } from '../packages/e2e/tests/tooling/helpers.ts';
import {
  evaluateCoverage,
  loadReporterOutputs,
  runScenarioPrechecks,
  runScenariosCli,
  scenarioCoverageDefinition,
  type CoverageInput,
} from './check-scenarios.ts';

/** 门禁逻辑自测的受控输入：写入最小清单，不读取仓库实时状态。 */
async function writeProjectManifest(root: string) {
  await writeFile(join(root, 'project.manifest.json'), JSON.stringify(minimalManifest(), null, 2));
}

function base(): CoverageInput {
  return {
    current: {
      runId: 'run-1',
      sourceDigest: 'source',
      specDigest: 'spec',
      protocolDigest: 'idl',
      fixtureDigest: 'fixture',
    },
    scenarios: [
      {
        id: 'SCN-SAMPLE-CORE-001',
        cases: [
          {
            key: 'normal',
            kind: 'behavior',
            requiredIn: ['integration', 'weapp'],
            checks: ['phase', 'result'],
          },
        ],
      },
    ],
    contracts: [{ id: 'method#request#field', cases: ['normal'], requiredIn: ['integration'] }],
    flows: [
      {
        id: 'FLOW-SAMPLE-001',
        cases: ['normal'],
        requiredIn: ['integration'],
        requiredStages: ['prepare', 'invoke', 'query', 'result'],
      },
    ],
    bindings: [
      {
        ownerId: 'FLOW-SAMPLE-001',
        caseId: 'flow-normal',
        fixtureCase: 'normal',
        environment: 'integration',
        covers: [
          { id: 'SCN-SAMPLE-CORE-001', caseKey: 'normal', checks: ['phase', 'result'] },
          {
            id: 'method#request#field',
            caseKey: 'normal',
            checks: ['method#request#field/normal'],
          },
        ],
        flowId: 'FLOW-SAMPLE-001',
        flowCase: 'normal',
      },
    ],
    reports: [
      {
        runId: 'run-1',
        sourceDigest: 'source',
        specDigest: 'spec',
        protocolDigest: 'idl',
        fixtureDigest: 'fixture',
        project: 'integration',
        file: 'flow.spec.ts',
        fullName: 'FLOW-SAMPLE-001 normal',
        caseId: 'flow-normal',
        status: 'passed',
        assertions: 3,
        checkpoints: ['phase', 'result', 'method#request#field/normal'],
        flow: {
          id: 'FLOW-SAMPLE-001',
          caseKey: 'normal',
          continuityId: 'one-run',
          stages: ['prepare', 'invoke', 'query', 'result'],
        },
      },
    ],
  };
}

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

  it('runs both controlled-input and live-inventory CLI composition paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'template-scenario-cli-'));
    const inputFile = join(directory, 'input.json');
    await writeFile(inputFile, JSON.stringify(base()));
    expect(
      await runScenariosCli(['node', 'script', '--input', inputFile], directory, {
        VERIFY_RUN_ID: 'run-1',
      }),
    ).toMatchObject({
      exitCode: 1,
      output: {
        issues: expect.arrayContaining([
          expect.stringContaining('SCN-SAMPLE-CORE-001/normal: missing binding for weapp'),
        ]),
      },
    });

    const reportFile = join(directory, 'report.json');
    await writeFile(
      reportFile,
      JSON.stringify({
        runId: 'run-1',
        sourceDigest: 'source',
        specDigest: 'spec',
        protocolDigest: 'idl',
        fixtureDigest: 'fixture',
        tests: [{ ...base().reports[0], binding: base().bindings[0] }],
      }),
    );
    // live-inventory 路径在受控临时根上运行：Spec、FLOW 与协议义务全部来自测试输入，
    // 结论不随仓库里新增/删除 Change 或 FLOW 变化。
    const controlled = createControlledRoot({
      manifest: JSON.parse(
        await readFile(new URL('../project.manifest.json', import.meta.url), 'utf8'),
      ),
      files: {
        'scenario-gate.config.json': JSON.stringify({
          scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
          flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
          ownerIdPattern: '^(?:FLOW|SCN)-[A-Z0-9-]+$',
        }),
        'openspec/specs/tooling/spec.md': [
          '### Requirement: GATE-TEST 受控临时根的 FLOW 登记',
          '',
          '| FLOW ID | Related | Stages | Cases | Environments | Notes |',
          '| --- | --- | --- | --- | --- | --- |',
          '| FLOW-SAMPLE-001 | SCN-SAMPLE-001 | create → observe | normal | integration | 受控输入 |',
          '',
          '#### Scenario: SCN-SAMPLE-001 受控输入场景',
          '',
          '```json verification',
          '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
          '```',
          '',
        ].join('\n'),
      },
      prefix: 'template-scenario-live-',
    });
    try {
      enableInventory(controlled.root);
      const successfulCommand = () => ({ status: 0 });
      const inventory = await runScenariosCli(
        ['node', 'script', '--inventory', '--report', reportFile],
        controlled.root,
        { VERIFY_RUN_ID: 'run-1' },
        successfulCommand,
      );
      const inventoryOutput = inventory.output as {
        mode: string;
        scenarios: ReadonlyArray<{ id: string }>;
        flows: ReadonlyArray<{ id: string; cases: ReadonlyArray<string> }>;
        contracts: ReadonlyArray<unknown>;
        issues: ReadonlyArray<string>;
      };
      expect(inventory.exitCode).toBe(1);
      expect(inventoryOutput.mode).toBe('inventory');
      expect(inventoryOutput.scenarios).toEqual([
        expect.objectContaining({ id: 'SCN-SAMPLE-001' }),
      ]);
      expect(inventoryOutput.flows).toEqual([
        expect.objectContaining({ id: 'FLOW-SAMPLE-001', cases: ['normal'] }),
      ]);
      expect(inventoryOutput.contracts.length).toBeGreaterThan(0);
      const complete = await runScenariosCli([], controlled.root, {}, successfulCommand);
      const completeOutput = complete.output as { mode: string; issues: ReadonlyArray<string> };
      expect(completeOutput.mode).toBe('complete');
      expect(completeOutput.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('SCN-SAMPLE-001/normal: missing binding for integration'),
          expect.stringContaining('FLOW-SAMPLE-001/normal: missing FLOW binding for integration'),
        ]),
      );
    } finally {
      controlled.cleanup();
    }
    // CLI 组合路径会 spawn 两个 tsx 子进程；与 cliEvidence 一致给 30s，避免机器负载下误判超时。
  }, 30_000);

  it('falls back to the real openspec CLI when no command is injected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'template-default-command-'));
    try {
      const result = await runScenarioPrechecks(root);
      // 默认命令真实调用 spawnSync('openspec', ...)；缺 specs 必进 issues，且不会产出清单。
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('openspec/specs directory is missing')]),
      );
      expect(result.inventory).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('blocks malformed project config before building inventory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-precheck-config-'));
    await mkdir(join(root, 'openspec/specs'), { recursive: true });
    await writeFile(
      join(root, 'scenario-gate.config.json'),
      JSON.stringify({
        scenarioIdPatterns: ['^SCN-'],
        flowIdPatterns: ['^FLOW-'],
        ownerIdPattern: '^[A-Z]+$',
        extra: true,
      }),
    );
    const result = await runScenarioPrechecks(root, () => ({ status: 0 }));
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('does not match schema')]),
    );
    expect(result.inventory).toBeUndefined();
  });

  it('runs OpenSpec prechecks before report loading and keeps --input pure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'template-precheck-'));
    try {
      const calls: string[] = [];
      const command = (name: string) => {
        calls.push(name);
        return { status: 1 };
      };
      const missing = await runScenarioPrechecks(root, command);
      expect(missing.issues[0]).toContain('openspec/specs directory is missing');
      expect(missing.issues).toContain('precheck: openspec CLI cannot be invoked');
      await mkdir(join(root, 'openspec/specs'), { recursive: true });
      await writeFile(
        join(root, 'scenario-gate.config.json'),
        JSON.stringify({
          scenarioIdPatterns: ['^SCN-[A-Z]+-\\d+$'],
          flowIdPatterns: ['^FLOW-[A-Z]+-\\d+$'],
          ownerIdPattern: '^SCN-[A-Z]+-\\d+$',
        }),
      );
      const input = join(root, 'input.json');
      await writeFile(input, JSON.stringify(base()));
      const result = await runScenariosCli(['node', 'script', '--input', input], root, {}, () => {
        throw new Error('must not invoke openspec');
      });
      expect(result.output.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('SCN-SAMPLE-CORE-001/normal: missing binding for weapp'),
        ]),
      );
      expect(calls).toEqual(['openspec']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('classifies malformed effective Spec facts before reading reports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-precheck-facts-'));
    try {
      await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
      await writeProjectManifest(root);
      await writeFile(
        join(root, 'scenario-gate.config.json'),
        JSON.stringify({
          scenarioIdPatterns: ['^SCN-OK$'],
          flowIdPatterns: ['^FLOW-OK$'],
          ownerIdPattern: '[',
        }),
      );
      await writeFile(
        join(root, 'openspec/specs/example/spec.md'),
        `### Requirement: TEST flow

#### Scenario: BAD-ID Invalid

| FLOW ID | Related | Stages | Cases | Environments | Notes |
| --- | --- | --- | --- | --- | --- |
| FLOW-OK | SCN-OK | create → observe | normal | sdk-unit | invalid |

#### Scenario: SCN-OK Missing checkpoint

\`\`\`json verification
{"formatVersion":2,"checkpoints":{"one":"declared"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["other"]}],"blockedBy":[]}
\`\`\`
`,
      );
      const successfulCommand = () => ({ status: 0 });
      const result = await runScenarioPrechecks(root, successfulCommand);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ownerIdPattern is invalid'),
          expect.stringContaining('Scenario ID BAD-ID does not match'),
          expect.stringContaining('invalid FLOW row FLOW-OK'),
          expect.stringContaining('verification metadata missing'),
          expect.stringContaining('unknown checkpoint other'),
        ]),
      );
      expect(
        (await runScenariosCli(['node', 'script', '--inventory'], root, {}, successfulCommand))
          .output,
      ).toMatchObject({
        mode: 'inventory',
        issues: expect.arrayContaining([
          expect.stringContaining('invalid FLOW row FLOW-OK'),
          expect.stringContaining('unknown checkpoint other'),
        ]),
      });
      expect((await runScenariosCli([], root, {}, successfulCommand)).output).toMatchObject({
        mode: 'complete',
        issues: expect.arrayContaining([
          expect.stringContaining('Scenario ID BAD-ID does not match'),
          expect.stringContaining('verification metadata missing'),
        ]),
      });
      const thrown = await runScenarioPrechecks(root, () => {
        throw new Error('CLI unavailable');
      });
      expect(thrown.issues[0]).toContain('openspec CLI cannot be invoked');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns malformed inventory facts with the denominator when prechecks fail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-precheck-denominator-'));
    try {
      await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
      await writeProjectManifest(root);
      await writeFile(
        join(root, 'openspec/specs/example/spec.md'),
        '### Requirement: TEST\n#### Scenario: SCN-TEST-001 Missing\n',
      );
      const result = await runScenariosCli([], root, {}, () => ({ status: 0 }));
      expect(result.exitCode).toBe(1);
      expect(result.output).toMatchObject({ scenarios: [{ id: 'SCN-TEST-001' }] });
      const inventory = await runScenariosCli(['--inventory'], root, {}, () => ({ status: 0 }));
      expect(inventory.output).toMatchObject({
        mode: 'inventory',
        scenarios: [{ id: 'SCN-TEST-001' }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports a missing project manifest as a precheck issue', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-precheck-manifest-'));
    try {
      await mkdir(join(root, 'openspec/specs'), { recursive: true });
      const result = await runScenarioPrechecks(root, () => ({ status: 0 }));
      expect(result.issues.join('\n')).toContain('precheck: project.manifest.json cannot be read');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps scenarios with missing verification in the denominator with empty executable cases', () => {
    expect(scenarioCoverageDefinition({ id: 'SCN-SAMPLE-CORE-999' })).toEqual({
      id: 'SCN-SAMPLE-CORE-999',
      cases: [],
      blockedBy: [],
    });
    expect(
      scenarioCoverageDefinition({
        id: 'SCN-SAMPLE-CORE-001',
        verification: { cases: base().scenarios[0]!.cases, blockedBy: ['dependency'] },
      }),
    ).toMatchObject({
      id: 'SCN-SAMPLE-CORE-001',
      cases: base().scenarios[0]!.cases,
      blockedBy: ['dependency'],
    });
  });

  it('prints help, rejects illegal change scope, and scopes the inventory', async () => {
    const controlled = createControlledRoot({
      // 覆盖清单取自仓库清单 + 受控 Spec 输入：--inventory 需要真实协议包的 generated 来源，
      // 具体来源由 enableInventory 以符号链接注入。
      manifest: JSON.parse(
        await readFile(new URL('../project.manifest.json', import.meta.url), 'utf8'),
      ),
      files: {
        'scenario-gate.config.json': JSON.stringify({
          scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
          flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
          ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
        }),
        'openspec/specs/sample/spec.md': [
          '### Requirement: BASE-01 交易示例',
          '',
          '系统 SHALL 提供交易示例。',
          '',
          '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
          '',
          '```json verification',
          '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
          '```',
          '',
        ].join('\n'),
        'openspec/changes/alpha/specs/sample/spec.md': [
          '## ADDED Requirements',
          '',
          '### Requirement: BASE-05 A 新增',
          '',
          '系统 SHALL 提供 A 场景。',
          '',
          '#### Scenario: SCN-SAMPLE-CONTRACT-005 A 场景',
          '',
          '```json verification',
          '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
          '```',
          '',
        ].join('\n'),
      },
      prefix: 'scenario-scope-',
    });
    try {
      enableInventory(controlled.root);
      const stub = () => ({ status: 0 });
      const help = await runScenariosCli(['node', 'script', '--help'], controlled.root, {}, stub);
      expect(help.exitCode).toBe(0);
      expect((help.output as { help?: string }).help).toContain('不带 --change');
      for (const [args, expected] of [
        [['--change'], '--change 需要 Change 名'],
        [['--change', 'nope'], '--change nope'],
      ] as const) {
        const result = await runScenariosCli(args, controlled.root, {}, stub);
        expect(result.exitCode).toBe(1);
        expect((result.output as { issues: string[] }).issues.join('\n')).toContain(expected);
        expect(result.output).not.toHaveProperty('scenarios');
      }
      const empty = await runScenariosCli([], controlled.root, { SCENARIO_GATE_CHANGES: '' }, stub);
      expect(empty.exitCode).toBe(1);
      expect((empty.output as { issues: string[] }).issues.join('\n')).toContain(
        'SCENARIO_GATE_CHANGES 已设置但为空值',
      );
      // --inventory 与非法作用域同时出现时同样不输出覆盖结论。
      const inventoryScoped = await runScenariosCli(
        ['--inventory', '--change', 'nope'],
        controlled.root,
        {},
        stub,
      );
      expect(inventoryScoped.exitCode).toBe(1);
      expect(inventoryScoped.output).toMatchObject({ mode: 'inventory' });
      expect(inventoryScoped.output).not.toHaveProperty('scenarios');
      const scoped = await runScenariosCli(
        ['--inventory', '--change', 'alpha'],
        controlled.root,
        {},
        stub,
      );
      expect(scoped.output).toMatchObject({
        mode: 'inventory',
        scenarios: [{ id: 'SCN-SAMPLE-CONTRACT-001' }, { id: 'SCN-SAMPLE-CONTRACT-005' }],
      });
      // 不带作用域：合并主 Spec 与全部 active Change（这里是 alpha）。
      const unscoped = await runScenariosCli([], controlled.root, {}, stub);
      expect(unscoped.output).toMatchObject({ mode: 'complete' });
      expect((unscoped.output as { scenarios: Array<{ id: string }> }).scenarios).toHaveLength(2);
    } finally {
      controlled.cleanup();
    }
    // 作用域成功路径要构建协议义务清单（磁盘密集）；与 cliEvidence 一致给 30s。
  }, 30_000);
});

type CoverageOutput = Readonly<{ issues: ReadonlyArray<string>; executed: number }>;

/** 与 check-fixtures.test.ts 相同的 module 证据登记方式：每个 case 一段可核对断言。 */
async function evidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `${id} ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: id,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id, caseKey: caseId, checks }],
        },
      },
    },
    async (context: TestContext) => {
      const before = context.expect.getState().assertionCalls;
      const executed: string[] = [];
      await body(context, async (name, assertion) => {
        await assertion();
        executed.push(name);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

const mutable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function runCoverage(input: CoverageInput): CoverageOutput {
  // module 类证据直接调用纯函数：CLI 路径由 SCN-SCENARIO-GATE-016.spec.ts 的 cli case 覆盖。
  return evaluateCoverage(input);
}

/** 多 cover 绑定：两个 Scenario 与一条协议义务共享一次执行。 */
function multiCoverInput() {
  const input = mutable(base()) as MutableCoverageInput;
  input.scenarios.push({
    id: 'SCN-SAMPLE-CORE-002',
    cases: [{ key: 'normal', kind: 'behavior', requiredIn: ['integration'], checks: ['second'] }],
  });
  input.contracts.push({
    id: 'method#request#second',
    cases: ['normal'],
    requiredIn: ['integration'],
  });
  input.bindings[0]!.covers = [
    { id: 'SCN-SAMPLE-CORE-001', caseKey: 'normal', checks: ['phase', 'result'] },
    { id: 'SCN-SAMPLE-CORE-002', caseKey: 'normal', checks: ['second'] },
    {
      id: 'method#request#second',
      caseKey: 'normal',
      checks: ['method#request#second/normal'],
    },
  ];
  input.reports[0]!.checkpoints = ['phase', 'result', 'second', 'method#request#second/normal'];
  return input;
}

const undeclared = (output: CoverageOutput) =>
  output.issues.filter((issue) => issue.includes('未登记的 checkpoint'));

evidence(
  'SCN-SCENARIO-GATE-016',
  'reverse-checkpoint-rules',
  [
    'undeclared-checkpoint-rejected',
    'binding-union-ledger',
    'multi-cover-no-false-positive',
    'unknown-obligation-checkpoint-rejected',
    'full-pass-not-exempt',
    'module-annotation-covered',
    'registered-passes',
  ],
  async (context, check) => {
    await check('undeclared-checkpoint-rejected', () => {
      const input = mutable(base()) as MutableCoverageInput;
      input.reports[0]!.checkpoints = [...input.reports[0]!.checkpoints, 'ghost'];
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('未登记的 checkpoint');
      context.expect(issues).toContain('ghost');
      context.expect(issues).toContain('flow.spec.ts');
      context.expect(issues).toContain('integration/flow-normal');
    });

    await check('binding-union-ledger', () => {
      const input = multiCoverInput();
      const output = runCoverage(input);
      context.expect(output.executed).toBeGreaterThan(0);
      context.expect(undeclared(output)).toEqual([]);
    });

    await check('multi-cover-no-false-positive', () => {
      const output = runCoverage(multiCoverInput());
      context.expect(output.issues.join('\n')).not.toContain('未登记的 checkpoint');
    });

    await check('unknown-obligation-checkpoint-rejected', () => {
      const input = multiCoverInput();
      input.reports[0]!.checkpoints = [
        ...input.reports[0]!.checkpoints,
        'infra.trade.v1.unknown#request#field/normal',
      ];
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('未登记的 checkpoint');
      context.expect(issues).toContain('infra.trade.v1.unknown#request#field/normal');
    });

    await check('full-pass-not-exempt', () => {
      const input = mutable(base()) as MutableCoverageInput;
      input.reports[0]!.checkpoints = [...input.reports[0]!.checkpoints, 'ghost'];
      const output = runCoverage(input);
      context.expect(output.issues.join('\n')).toContain('未登记的 checkpoint');
      context.expect(undeclared(output).length).toBeGreaterThan(0);
    });

    await check('module-annotation-covered', () => {
      const input = mutable(base()) as MutableCoverageInput;
      input.scenarios = [
        {
          id: 'SCN-SAMPLE-CORE-003',
          cases: [
            {
              key: 'internal',
              kind: 'module',
              requiredIn: ['test-tools-unit'],
              checks: ['internal'],
            },
          ],
        },
      ];
      input.contracts = [];
      input.flows = [];
      input.bindings = [
        {
          ownerId: 'SCN-SAMPLE-CORE-003',
          caseId: 'module-internal',
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id: 'SCN-SAMPLE-CORE-003', caseKey: 'internal', checks: ['internal'] }],
        },
      ];
      input.reports = [
        {
          ...input.current,
          project: 'test-tools-unit',
          file: 'module.test.ts',
          fullName: 'SCN-SAMPLE-CORE-003 module-internal',
          caseId: 'module-internal',
          status: 'passed',
          assertions: 2,
          checkpoints: ['internal', 'ghost-module'],
        },
      ];
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('未登记的 checkpoint');
      context.expect(issues).toContain('module.test.ts');
      context.expect(issues).toContain('ghost-module');
    });

    await check('registered-passes', () => {
      context.expect(undeclared(runCoverage(mutable(base())))).toEqual([]);
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-019',
  'unscoped-format-rules',
  ['format-checks-unscoped', 'coverage-scoped-after-fix'],
  async (context, check) => {
    const controlled = createControlledRoot({
      manifest: minimalManifest(),
      files: {
        'scenario-gate.config.json': JSON.stringify({
          scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
          flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
          ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
        }),
        'openspec/specs/sample/spec.md': [
          '### Requirement: BASE-01 交易示例',
          '',
          '系统 SHALL 提供交易示例。',
          '',
          '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
          '',
          '```json verification',
          '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
          '```',
          '',
        ].join('\n'),
        'openspec/changes/alpha/specs/sample/spec.md': [
          '## ADDED Requirements',
          '',
          '### Requirement: BASE-05 A 新增',
          '',
          '系统 SHALL 提供 A 场景。',
          '',
          '#### Scenario: SCN-SAMPLE-CONTRACT-005 A 场景',
          '',
          '```json verification',
          '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
          '```',
          '',
        ].join('\n'),
        'openspec/changes/beta/specs/sample/spec.md': [
          '## ADDED Requirements',
          '',
          '### Requirement: BASE-06 B 新增',
          '',
          '系统 SHALL 提供 B 场景。',
          '',
          '#### Scenario: SCN-SAMPLE-CONTRACT-006 B 场景（缺 verification）',
          '',
          '- **WHEN** B',
          '- **THEN** B',
          '',
        ].join('\n'),
      },
      prefix: 'scenario-unscoped-',
    });
    const scope = { changes: ['alpha'] };
    try {
      const stub = () => ({ status: 0 });
      await check('format-checks-unscoped', async () => {
        const broken = await runScenarioPrechecks(controlled.root, stub, scope);
        context.expect(broken.issues.join('\n')).toContain('verification');
        context.expect(broken.issues.join('\n')).toContain('SCN-SAMPLE-CONTRACT-006');
        const ids = (broken.inventory?.scenarios ?? []).map((item) => item.id);
        context.expect(ids).toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-005']);
      });

      await check('coverage-scoped-after-fix', async () => {
        await writeFile(
          join(controlled.root, 'openspec/changes/beta/specs/sample/spec.md'),
          [
            '## ADDED Requirements',
            '',
            '### Requirement: BASE-06 B 新增',
            '',
            '系统 SHALL 提供 B 场景。',
            '',
            '#### Scenario: SCN-SAMPLE-CONTRACT-006 B 场景',
            '',
            '```json verification',
            '{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}',
            '```',
            '',
          ].join('\n'),
        );
        const fixed = await runScenarioPrechecks(controlled.root, stub, scope);
        context.expect(fixed.issues).toEqual([]);
        context
          .expect((fixed.inventory?.scenarios ?? []).map((item) => item.id))
          .toEqual(['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-CONTRACT-005']);
      });
    } finally {
      controlled.cleanup();
    }
  },
);

evidence(
  'SCN-SCENARIO-GATE-025',
  'stale-explanation-rules',
  ['run-id-mismatch-detail', 'digest-category-detail', 'changed-files-detail'],
  async (context, check) => {
    /** 过期报告：run id 与 source 摘要都与当前不同，其余摘要保持一致。 */
    const stale = (): MutableCoverageInput => {
      const input = mutable(base()) as MutableCoverageInput;
      input.reports[0] = { ...input.reports[0]!, runId: 'actual-run', sourceDigest: 'old-source' };
      return input;
    };

    await check('run-id-mismatch-detail', () => {
      const issues = runCoverage(stale()).issues.join('\n');
      context.expect(issues).toContain('is stale');
      context.expect(issues).toContain('run id 期望 run-1，实际 actual-run');
    });

    await check('digest-category-detail', () => {
      const input = stale();
      input.reports[0]!.specDigest = input.current.specDigest;
      input.reports[0]!.protocolDigest = input.current.protocolDigest;
      input.current.fixtureDigest = 'new-fixture';
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('摘要类别不同：source、fixture');
    });

    await check('changed-files-detail', () => {
      const input = stale();
      input.reports[0]!.files = { 'a.ts': '1', 'b.ts': '2' };
      input.current.files = { 'b.ts': '2', 'c.ts': '3' };
      const issues = runCoverage(input).issues.join('\n');
      context.expect(issues).toContain('变化文件（共 2 个）：a.ts、c.ts');

      const many = stale();
      many.reports[0]!.files = {};
      many.current.files = Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => [
          `file-${String(index).padStart(2, '0')}.ts`,
          'x',
        ]),
      );
      const manyIssues = runCoverage(many).issues.join('\n');
      context.expect(manyIssues).toContain('变化文件（共 25 个）：');
      context.expect(manyIssues).toContain(' 等');
      const listed = manyIssues.split('变化文件（共 25 个）：')[1]!.split(' 等')[0]!.split('、');
      context.expect(listed).toHaveLength(20);
      context.expect(listed[0]).toBe('file-00.ts');

      const noDetail = mutable(base()) as MutableCoverageInput;
      noDetail.reports[0] = { ...noDetail.reports[0]!, runId: 'actual-run' };
      context
        .expect(runCoverage(noDetail).issues.join('\n'))
        .toContain('变化文件：报告未记录摘要明细');
    });
  },
);
