import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type ScenarioConfig = Readonly<{ scenarioIdPatterns: ReadonlyArray<string>; flowIdPatterns: ReadonlyArray<string>; ownerIdPattern: string }>;
const fallback: ScenarioConfig = { scenarioIdPatterns: ['^TC-PAYSDK-[A-Z0-9-]+$', '^SCN-[A-Z0-9-]+$'], flowIdPatterns: ['^FLOW-PAYSDK-[A-Z0-9-]+$', '^FLOW-[A-Z0-9-]+$'], ownerIdPattern: '^(?:TC|FLOW)-[A-Z0-9-]+$' };

export async function loadScenarioConfig(repositoryRoot: string): Promise<ScenarioConfig> {
  try {
    const parsed = JSON.parse(await readFile(resolve(repositoryRoot, 'scenario-gate.config.json'), 'utf8')) as Partial<ScenarioConfig>;
    return {
      scenarioIdPatterns: parsed.scenarioIdPatterns ?? fallback.scenarioIdPatterns,
      flowIdPatterns: parsed.flowIdPatterns ?? fallback.flowIdPatterns,
      ownerIdPattern: parsed.ownerIdPattern ?? fallback.ownerIdPattern,
    };
  } catch { return fallback; }
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
