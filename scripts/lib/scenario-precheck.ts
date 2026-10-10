import { statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { errorMessage, loadProjectManifest, type TestProject } from './project-manifest.ts';
import { readSpecInventory } from './spec-inventory.ts';
import { readEffectiveSpecs } from './spec-sources.ts';
import { loadScenarioConfig, validateScenarioConfig } from './scenario-config.ts';
import type { ScenarioCommand, ScenarioPrecheckResult } from '../check-scenarios.ts';

export const defaultScenarioCommand: ScenarioCommand = (command, args, options) => {
  const result = spawnSync(command, [...args], { cwd: options.cwd, encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
};

/** 读取门禁根目录的测试项目；清单缺失或非法时记录 precheck 问题并降级为空集合。 */
async function loadPrecheckProjects(
  root: string,
  issues: string[],
): Promise<ReadonlyArray<TestProject>> {
  try {
    return loadProjectManifest(root).testProjects;
  } catch (error) {
    issues.push(`precheck: ${errorMessage(error)}`);
    return [];
  }
}

/**
 * Run the repository and effective-Spec checks in their contractual order.
 * Report loading is deliberately outside this function so a failed precheck
 * cannot accidentally produce a coverage conclusion from stale reports.
 */
export async function runScenarioPrechecks(
  root: string,
  command: ScenarioCommand = defaultScenarioCommand,
  options: Readonly<{ changes?: ReadonlyArray<string> }> = {},
): Promise<ScenarioPrecheckResult> {
  const issues: string[] = [];
  const specsDirectory = resolve(root, 'openspec/specs');
  const specsPresent = (() => {
    try {
      return statSync(specsDirectory).isDirectory();
    } catch {
      return false;
    }
  })();
  if (!specsPresent) issues.push('precheck: openspec/specs directory is missing');

  let cliAvailable = false;
  try {
    const result = command('openspec', ['--version'], { cwd: root });
    cliAvailable = result.status === 0;
  } catch (error) {
    issues.push(`precheck: openspec CLI cannot be invoked: ${String(error)}`);
  }
  if (
    !cliAvailable &&
    !issues.some((issue) => issue.startsWith('precheck: openspec CLI cannot be invoked'))
  ) {
    issues.push('precheck: openspec CLI cannot be invoked');
  }
  if (issues.length > 0) return { issues };

  const effective = await readEffectiveSpecs(root);
  let config;
  try {
    config = await loadScenarioConfig(root);
  } catch (error) {
    issues.push(`precheck: ${String(error)}`);
    return { issues };
  }
  const configIssues = validateScenarioConfig(config);
  if (configIssues.length > 0) issues.push(...configIssues.map((issue) => `precheck: ${issue}`));
  const projects = await loadPrecheckProjects(root, issues);
  // 格式前置检查（GATE-01/02/05/06）始终覆盖全部 active Change；作用域只收窄覆盖清单。
  const fullInventory = await readSpecInventory(effective.documents, config, projects);
  const scopedEffective =
    options.changes === undefined
      ? effective
      : await readEffectiveSpecs(root, { changes: options.changes });
  const scopedInventory =
    options.changes === undefined
      ? fullInventory
      : await readSpecInventory(scopedEffective.documents, config, projects);

  // Keep diagnostics deterministic and aligned with the gate contract:
  // identity checks, FLOW placement/rows, then verification metadata.
  const classify = (list: ReadonlyArray<string>) => {
    const buckets = {
      id: [] as string[],
      flow: [] as string[],
      verification: [] as string[],
      other: [] as string[],
    };
    for (const issue of list) {
      if (
        /Scenario ID|Scenario heading|duplicate Scenario ID|duplicate FLOW ID|invalid FLOW ID/.test(
          issue,
        )
      )
        buckets.id.push(issue);
      else if (/FLOW (?:table|row)|invalid FLOW row/.test(issue)) buckets.flow.push(issue);
      else if (/verification/.test(issue)) buckets.verification.push(issue);
      else buckets.other.push(issue);
    }
    return buckets;
  };
  // 格式类问题取自全量来源（覆盖全部 active Change）；非格式问题取自作用域来源，避免重复。
  const full = classify([...effective.issues, ...fullInventory.issues]);
  const scoped = classify([...scopedEffective.issues, ...scopedInventory.issues]);
  issues.push(...full.id, ...full.flow, ...full.verification, ...scoped.other);
  return { issues, effective: scopedEffective, inventory: scopedInventory };
}
