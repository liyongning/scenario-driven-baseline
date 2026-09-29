import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

export type ScenarioConfig = Readonly<{ scenarioIdPatterns: ReadonlyArray<string>; flowIdPatterns: ReadonlyArray<string>; ownerIdPattern: string }>;
const fallback: ScenarioConfig = { scenarioIdPatterns: ['^TC-PAYSDK-[A-Z0-9-]+$', '^SCN-[A-Z0-9-]+$'], flowIdPatterns: ['^FLOW-PAYSDK-[A-Z0-9-]+$', '^FLOW-[A-Z0-9-]+$'], ownerIdPattern: '^(?:TC|FLOW)-[A-Z0-9-]+$' };

export async function loadScenarioConfig(repositoryRoot: string): Promise<ScenarioConfig> {
  const path = resolve(repositoryRoot, 'scenario-gate.config.json');
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    const schema = JSON.parse(await readFile(new URL('../../scenario-gate.config.schema.json', import.meta.url), 'utf8')) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    if (!validate(parsed)) throw new Error(`scenario-gate.config.json does not match schema: ${new Ajv2020({ allErrors: true, strict: true }).errorsText(validate.errors)}`);
    return parsed as ScenarioConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

export function validateScenarioConfig(config: ScenarioConfig): string[] {
  const issues: string[] = [];
  for (const [name, patterns] of [['scenarioIdPatterns', config.scenarioIdPatterns], ['flowIdPatterns', config.flowIdPatterns]] as const) {
    if (!Array.isArray(patterns) || patterns.length === 0) issues.push(`${name} must contain at least one pattern`);
    for (const pattern of patterns ?? []) try { new RegExp(pattern); } catch { issues.push(`${name} contains invalid pattern ${pattern}`); }
  }
  try { new RegExp(config.ownerIdPattern); } catch { issues.push('ownerIdPattern is invalid'); }
  return issues;
}

export function matchesAny(value: string, patterns: ReadonlyArray<string>): boolean {
  return patterns.some(pattern => new RegExp(pattern).test(value));
}
