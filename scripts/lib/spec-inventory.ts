import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { unified } from 'unified';
import { matchesAny, type ScenarioConfig } from './scenario-config.ts';
import {
  loadProjectManifest,
  type TestProject,
  type TestProjectClass,
} from './project-manifest.ts';
import type { SpecSource } from './spec-sources.ts';

export type VerificationMetadata = Readonly<{
  formatVersion: 2;
  checkpoints: Readonly<Record<string, string>>;
  cases: ReadonlyArray<
    Readonly<{
      key: string;
      kind: 'behavior' | 'module' | 'engineering';
      requiredIn: ReadonlyArray<string>;
      checks: ReadonlyArray<string>;
    }>
  >;
  blockedBy: ReadonlyArray<string>;
}>;
export type ScenarioInventoryItem = Readonly<{
  id: string;
  title: string;
  source: string;
  verification?: VerificationMetadata;
}>;
export type FlowInventoryItem = Readonly<{
  id: string;
  relatedScenarios: string[];
  stages: string;
  cases: string[];
  requiredIn: string[];
  notes: string;
}>;

type InventoryInput = string | SpecSource;

export function nodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const typed = node as { value?: string; children?: unknown[] };
  return typed.value ?? typed.children?.map(nodeText).join('') ?? '';
}

export async function readSpecInventory(
  specPaths: ReadonlyArray<InventoryInput>,
  config?: ScenarioConfig,
  projects?: ReadonlyArray<TestProject>,
) {
  const schema = JSON.parse(
    await readFile(new URL('../verification.schema.json', import.meta.url), 'utf8'),
  ) as object;
  const flowSchema = JSON.parse(
    await readFile(new URL('../flow.schema.json', import.meta.url), 'utf8'),
  ) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const validateFlow = ajv.compile(flowSchema);
  const scenarios: ScenarioInventoryItem[] = [];
  const flows: FlowInventoryItem[] = [];
  const issues: string[] = [];
  const effectiveProjects = projects ?? loadProjectManifest(process.cwd()).testProjects;
  const projectByName = new Map(effectiveProjects.map((item) => [item.name, item]));
  const allowedClasses = (
    kind: 'behavior' | 'module' | 'engineering',
  ): ReadonlyArray<TestProjectClass> =>
    kind === 'behavior'
      ? ['integration', 'platform']
      : kind === 'module'
        ? ['unit']
        : ['integration'];

  const effectiveConfig = config ?? {
    scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
    flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
    ownerIdPattern: '^(?:FLOW|SCN)-[A-Z0-9-]+$',
  };
  for (const sourceInput of specPaths) {
    const source = typeof sourceInput === 'string' ? sourceInput : sourceInput.path;
    const content =
      typeof sourceInput === 'string' ? await readFile(source, 'utf8') : sourceInput.content;
    const tree = unified().use(remarkParse).use(remarkGfm).parse(content);
    const children = tree.children;
    let inRequirement = false;
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index] as {
        type: string;
        depth?: number;
        lang?: string;
        meta?: string;
        value?: string;
        children?: unknown[];
      };
      const heading = nodeText(node);
      if (node.type === 'heading' && node.depth! <= 3) inRequirement = false;
      if (node.type === 'heading' && node.depth === 3 && /^Requirement:\s+/.test(heading))
        inRequirement = true;
      const scenarioHeading =
        node.type === 'heading' && node.depth === 4 && /^Scenario:/.test(heading) ? heading : null;
      const scenarioMatch = scenarioHeading ? /^Scenario:\s+(\S+)\s+(.+)$/.exec(heading) : null;
      if (scenarioHeading) {
        const scenarioId = scenarioMatch?.[1] ?? scenarioHeading;
        const scenarioTitle =
          scenarioMatch?.[2] ??
          (scenarioHeading.replace(/^Scenario:\s*/, '').trim() || scenarioHeading);
        if (!scenarioMatch)
          issues.push(
            `${source}: Scenario heading ${scenarioHeading} is malformed; expected an ID and title`,
          );
        else if (!matchesAny(scenarioId, effectiveConfig.scenarioIdPatterns))
          issues.push(`${source}: Scenario ID ${scenarioId} does not match configured formats`);
        let verification: VerificationMetadata | undefined;
        let verificationBlocks = 0;
        for (let cursor = index + 1; cursor < children.length; cursor += 1) {
          const candidate = children[cursor] as typeof node;
          if (candidate.type === 'heading' && candidate.depth! <= 4) break;
          if (
            candidate.type === 'code' &&
            candidate.lang === 'json' &&
            candidate.meta === 'verification'
          ) {
            verificationBlocks += 1;
            try {
              const parsed: unknown = JSON.parse(candidate.value!);
              if (!validate(parsed))
                issues.push(
                  `${scenarioId}: invalid verification metadata: ${ajv.errorsText(validate.errors)}`,
                );
              else {
                verification = parsed as VerificationMetadata;
                const keys = verification.cases.map((item) => item.key);
                if (new Set(keys).size !== keys.length)
                  issues.push(`${scenarioId}: duplicate verification case key`);
                for (const item of verification.cases) {
                  for (const check of item.checks) {
                    if (!Object.prototype.hasOwnProperty.call(verification.checkpoints, check))
                      issues.push(`${scenarioId}/${item.key}: unknown checkpoint ${check}`);
                  }
                  for (const required of item.requiredIn) {
                    const project = projectByName.get(required);
                    if (!project) {
                      issues.push(
                        `${scenarioId}: invalid verification metadata: requiredIn project ${required} is not registered in project.manifest.json`,
                      );
                      continue;
                    }
                    if (!allowedClasses(item.kind).includes(project.class)) {
                      issues.push(
                        `${scenarioId}: invalid verification metadata: kind ${item.kind} cannot run in ${project.class} project ${required}`,
                      );
                    }
                  }
                }
              }
            } catch (error) {
              issues.push(`${scenarioId}: verification JSON cannot be parsed: ${String(error)}`);
            }
          }
        }
        if (verificationBlocks > 1) {
          issues.push(
            `${scenarioId}: multiple verification metadata blocks (expected exactly one)`,
          );
          verification = undefined;
        }
        if (!verification && verificationBlocks <= 1)
          issues.push(`${scenarioId}: verification metadata missing`);
        scenarios.push({
          id: scenarioId,
          title: scenarioTitle,
          source,
          ...(verification ? { verification } : {}),
        });
      }
      if (node.type === 'table') {
        const rows = (node as unknown as { children: Array<{ children: unknown[] }> }).children;
        const header = rows[0]?.children.map(nodeText);
        if (header?.[0] !== 'FLOW ID') continue;
        if (config && !inRequirement) {
          issues.push(
            `${source}: FLOW table is outside a Requirement and would be lost during archive`,
          );
          continue;
        }
        for (const row of rows.slice(1)) {
          const cells = row.children.map(nodeText);
          if (cells.length !== 6) {
            issues.push(`${source}: FLOW row has ${cells.length} columns, expected 6`);
            continue;
          }
          if (!matchesAny(cells[0]!, effectiveConfig.flowIdPatterns)) {
            issues.push(`${source}: invalid FLOW ID ${cells[0]}`);
            continue;
          }
          if (!cells[0] || !cells[2] || !cells[3] || !cells[4]) {
            issues.push(`${source}: FLOW row has an empty required column`);
            continue;
          }
          const flow = {
            id: cells[0]!,
            relatedScenarios: cells[1]!.split('、').filter(Boolean),
            stages: cells[2]!,
            cases: cells[3]!.split('、').filter(Boolean),
            requiredIn: cells[4]!.split('、').filter(Boolean),
            notes: cells[5]!,
          };
          if (!validateFlow(flow)) {
            issues.push(
              `${source}: invalid FLOW row ${cells[0]}: ${ajv.errorsText(validateFlow.errors)}`,
            );
            continue;
          }
          for (const required of flow.requiredIn) {
            const project = projectByName.get(required);
            if (!project || (project.class !== 'integration' && project.class !== 'platform')) {
              issues.push(
                `${source}: invalid FLOW row ${flow.id}: requiredIn project ${required} is not an integration or platform project`,
              );
            }
          }
          flows.push(flow);
        }
      }
    }
  }
  for (const id of new Set(scenarios.map((item) => item.id))) {
    if (scenarios.filter((item) => item.id === id).length > 1)
      issues.push(`duplicate Scenario ID ${id}`);
  }
  for (const id of new Set(flows.map((item) => item.id))) {
    if (flows.filter((item) => item.id === id).length > 1) issues.push(`duplicate FLOW ID ${id}`);
  }
  const registeredScenarioIds = new Set(scenarios.map((item) => item.id));
  for (const flow of flows) {
    for (const related of flow.relatedScenarios) {
      if (!registeredScenarioIds.has(related))
        issues.push(`FLOW ${flow.id} references unregistered Scenario ${related}`);
    }
  }
  return { scenarios, flows, issues };
}
