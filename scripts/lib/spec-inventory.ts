import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { unified } from 'unified';

export type VerificationMetadata = Readonly<{
  formatVersion: 2;
  checkpoints: Readonly<Record<string, string>>;
  cases: ReadonlyArray<Readonly<{
    key: string;
    kind: 'behavior' | 'module' | 'engineering';
    requiredIn: ReadonlyArray<'sdk-unit' | 'protocol-unit' | 'test-tools-unit' | 'integration' | 'weapp'>;
    checks: ReadonlyArray<string>;
  }>>;
  blockedBy: ReadonlyArray<string>;
}>;
export type ScenarioInventoryItem = Readonly<{ id: string; title: string; source: string; verification?: VerificationMetadata }>;
export type FlowInventoryItem = Readonly<{
  id: string;
  relatedScenarios: string[];
  stages: string;
  cases: string[];
  requiredIn: string[];
  notes: string;
}>;

export function nodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const typed = node as { value?: string; children?: unknown[] };
  return typed.value ?? typed.children?.map(nodeText).join('') ?? '';
}

export async function readSpecInventory(specPaths: ReadonlyArray<string>) {
  const schema = JSON.parse(await readFile(new URL('../verification.schema.json', import.meta.url), 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const scenarios: ScenarioInventoryItem[] = [];
  const flows: FlowInventoryItem[] = [];
  const issues: string[] = [];

  for (const source of specPaths) {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(await readFile(source, 'utf8'));
    const children = tree.children;
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index] as { type: string; depth?: number; lang?: string; meta?: string; value?: string; children?: unknown[] };
      const heading = nodeText(node);
      const scenarioMatch = node.type === 'heading' && node.depth === 4
        ? /^Scenario:\s+(TC-PAYSDK-[A-Z]+-\d{3})\s+(.+)$/.exec(heading)
        : null;
      if (scenarioMatch) {
        let verification: VerificationMetadata | undefined;
        for (let cursor = index + 1; cursor < children.length; cursor += 1) {
          const candidate = children[cursor] as typeof node;
          if (candidate.type === 'heading' && candidate.depth! <= 4) break;
          if (candidate.type === 'code' && candidate.lang === 'json' && candidate.meta === 'verification') {
            try {
              const parsed: unknown = JSON.parse(candidate.value!);
              if (!validate(parsed)) issues.push(`${scenarioMatch[1]}: invalid verification metadata: ${ajv.errorsText(validate.errors)}`);
              else {
                verification = parsed as VerificationMetadata;
                const keys = verification.cases.map(item => item.key);
                if (new Set(keys).size !== keys.length) issues.push(`${scenarioMatch[1]}: duplicate verification case key`);
                for (const item of verification.cases) {
                  for (const check of item.checks) {
                    if (!Object.prototype.hasOwnProperty.call(verification.checkpoints, check)) issues.push(`${scenarioMatch[1]}/${item.key}: unknown checkpoint ${check}`);
                  }
                }
              }
            } catch (error) {
              issues.push(`${scenarioMatch[1]}: verification JSON cannot be parsed: ${String(error)}`);
            }
          }
        }
        if (!verification) issues.push(`${scenarioMatch[1]}: verification metadata missing`);
        scenarios.push({ id: scenarioMatch[1]!, title: scenarioMatch[2]!, source, ...(verification ? { verification } : {}) });
      }
      if (node.type === 'table') {
        const rows = (node as unknown as { children: Array<{ children: unknown[] }> }).children;
        const header = rows[0]?.children.map(nodeText);
        if (header?.[0] !== 'FLOW ID') continue;
        for (const row of rows.slice(1)) {
          const cells = row.children.map(nodeText);
          if (!/^FLOW-PAYSDK-\d{3}$/.test(cells[0]!)) {
            issues.push(`${source}: invalid FLOW ID ${cells[0]}`);
            continue;
          }
          flows.push({
            id: cells[0]!,
            relatedScenarios: cells[1]!.split('、').filter(Boolean),
            stages: cells[2]!,
            cases: cells[3]!.split('、').filter(Boolean),
            requiredIn: cells[4]!.split('、').filter(Boolean),
            notes: cells[5]!,
          });
        }
      }
    }
  }
  for (const id of new Set(scenarios.map(item => item.id))) {
    if (scenarios.filter(item => item.id === id).length > 1) issues.push(`duplicate Scenario ID ${id}`);
  }
  for (const id of new Set(flows.map(item => item.id))) {
    if (flows.filter(item => item.id === id).length > 1) issues.push(`duplicate FLOW ID ${id}`);
  }
  return { scenarios, flows, issues };
}
