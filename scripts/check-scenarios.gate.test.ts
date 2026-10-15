import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createControlledRoot } from '../packages/e2e/tests/tooling/controlled-root.ts';
import { enableInventory } from '../packages/e2e/tests/tooling/scenario-gate-helpers.ts';
import { describe, expect, it } from 'vitest';
import { base, writeProjectManifest } from '../packages/e2e/tests/tooling/helpers.ts';
import { baseManifest } from '../packages/e2e/tests/tooling/project-manifest-fixture.ts';
import {
  runScenarioPrechecks,
  runScenariosCli,
  scenarioCoverageDefinition,
} from './check-scenarios.ts';

describe('evaluateCoverage', () => {
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
      manifest: baseManifest(),
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
