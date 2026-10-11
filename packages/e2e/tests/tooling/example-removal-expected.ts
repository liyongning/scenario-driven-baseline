import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadProjectManifest,
  testProjectsByClass,
} from '../../../../scripts/lib/project-manifest.ts';
import { copyCreatingSpecs } from '../../vitest.config.integration.ts';
import type { RepositoryCopy } from './repository-copy.ts';

export type InventoryCase = Readonly<{ key: string; requiredIn: ReadonlyArray<string> }>;
export type InventoryScenario = Readonly<{
  id: string;
  verification: Readonly<{ cases: ReadonlyArray<InventoryCase> }>;
}>;
export type InventoryItem = Readonly<{
  id: string;
  cases: ReadonlyArray<string>;
  requiredIn: ReadonlyArray<string>;
}>;
export type InventoryOutput = Readonly<{
  mode: string;
  issues: ReadonlyArray<string>;
  contracts?: ReadonlyArray<InventoryItem>;
  scenarios: ReadonlyArray<InventoryScenario>;
  flows: ReadonlyArray<InventoryItem>;
}>;

/**
 * 副本中“不可能产生绑定”的用例所对应的缺失项（A2 用户裁决：多一条、少一条都算失败）：
 * 1. 被 `TEMPLATE_COPY` 排除的会创建副本的用例：绑定由排除列表里的 spec 文件提供，用例名从
 *    有效 Spec 清单取、环境取该文件里声明的环境，不另写名单；
 * 2. `requiredIn` 含清单 `class` 为 `platform` 的测试项目：副本不运行小程序（清单模式不要求
 *    平台报告），绑定同样来自运行报告，必然缺失。
 * 问题文本与 scripts/lib/scenario-coverage.ts 的 `check()` 同款。
 */
export function expectedMissingBindings(
  copy: RepositoryCopy,
  inventory: InventoryOutput,
): string[] {
  const manifest = loadProjectManifest(copy.root);
  const platformProjects = testProjectsByClass(manifest, ['platform']);
  const registeredProjects = new Set(manifest.testProjects.map((project) => project.name));
  // Apply 尚未登记的项目按 tasks.md 的交付顺序允许出现；登记后同一问题由精确集合继续拦截。
  const pendingProjects = new Set(['openapi-unit', 'app-unit', 'browser']);
  const byId = new Map(inventory.scenarios.map((scenario) => [scenario.id, scenario]));
  const precheckExpected = new Set<string>();
  for (const scenario of inventory.scenarios)
    for (const item of scenario.verification.cases)
      for (const environment of item.requiredIn)
        if (!registeredProjects.has(environment) && pendingProjects.has(environment))
          precheckExpected.add(
            `${scenario.id}: invalid verification metadata: requiredIn project ${environment} is not registered in project.manifest.json`,
          );
  for (const item of inventory.flows)
    for (const environment of item.requiredIn)
      if (!registeredProjects.has(environment) && pendingProjects.has(environment)) {
        const suffix = `invalid FLOW row ${item.id}: requiredIn project ${environment} is not an integration or platform project`;
        const issue = inventory.issues.find((candidate) => candidate.endsWith(suffix));
        if (!issue)
          throw new Error(
            `scenario gate did not report the expected unregistered project: ${suffix}`,
          );
        precheckExpected.add(issue);
      }
  // 预检一旦发现尚未登记的项目就提前返回，此时不会进入绑定覆盖评估。
  if (precheckExpected.size > 0) return [...precheckExpected].sort();

  const expected = new Set<string>();
  for (const scenario of inventory.scenarios)
    for (const item of scenario.verification.cases)
      for (const environment of item.requiredIn)
        if (platformProjects.includes(environment))
          expected.add(`${scenario.id}/${item.key}: missing binding for ${environment}`);
  for (const [items, word] of [
    [inventory.contracts ?? [], ''],
    [inventory.flows, 'FLOW '],
  ] as const)
    for (const item of items)
      for (const caseKey of item.cases)
        for (const environment of item.requiredIn)
          if (platformProjects.includes(environment))
            expected.add(`${item.id}/${caseKey}: missing ${word}binding for ${environment}`);
  for (const spec of copyCreatingSpecs) {
    // 示例自身的 spec 随白名单删除、对应 Scenario 也已删除：没有可推导的缺失项。
    if (!existsSync(join(copy.root, spec))) continue;
    const source = readFileSync(join(copy.root, spec), 'utf8');
    const environments = [
      ...new Set([...source.matchAll(/environment: '([^']+)'/g)].map((match) => match[1]!)),
    ];
    const owners = [
      ...new Set([...source.matchAll(/ownerId: '([^']+)'/g)].map((match) => match[1]!)),
    ];
    for (const ownerId of owners) {
      const scenario = byId.get(ownerId);
      if (!scenario) continue;
      for (const item of scenario.verification.cases)
        for (const environment of item.requiredIn)
          if (environments.includes(environment))
            expected.add(`${ownerId}/${item.key}: missing binding for ${environment}`);
    }
  }
  return [...expected].sort();
}
