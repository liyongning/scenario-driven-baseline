import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 4 条硬规则依赖的格式 schema，由 SCN-SCENARIO-GATE-008 守护。 */
const hardRuleSchemas = [
  'scenario-gate.config.schema.json',
  'scripts/verification.schema.json',
  'scripts/flow.schema.json',
] as const;

/** 项目清单 schema，由 ENG-05 守护。 */
const projectSchemas = ['project.manifest.schema.json'] as const;

const schemaPaths = [...hardRuleSchemas, ...projectSchemas] as const;

type SchemaNode = Readonly<Record<string, unknown>>;

function walkSchema(node: unknown, path: string, issues: string[]): void {
  if (!node || typeof node !== 'object') return;
  const object = node as SchemaNode;
  const properties = object.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [name, child] of Object.entries(properties as Record<string, unknown>)) {
      const childPath = `${path}.properties.${name}`;
      const description =
        child && typeof child === 'object' ? (child as SchemaNode).description : undefined;
      if (
        typeof description !== 'string' ||
        !description.trim() ||
        !/[\u3400-\u9fff]/u.test(description)
      ) {
        issues.push(`${path}: property ${name} is missing a non-empty Chinese description`);
      }
      walkSchema(child, childPath, issues);
    }
  }
  if (Array.isArray(object.allOf))
    object.allOf.forEach((child, index) => walkSchema(child, `${path}.allOf[${index}]`, issues));
  if (object.if) walkSchema(object.if, `${path}.if`, issues);
  if (object.then) walkSchema(object.then, `${path}.then`, issues);
  if (object.else) walkSchema(object.else, `${path}.else`, issues);
  if (object.items) walkSchema(object.items, `${path}.items`, issues);
  if (object.additionalProperties && typeof object.additionalProperties === 'object') {
    walkSchema(object.additionalProperties, `${path}.additionalProperties`, issues);
  }
  if (object.propertyNames && typeof object.propertyNames === 'object') {
    walkSchema(object.propertyNames, `${path}.propertyNames`, issues);
  }
}

/** Check schema field documentation and the root AGENTS references. */
export function checkSchemaDocumentation(root: string): string[] {
  const issues: string[] = [];
  // 两组 schema 各自独立：某一组在该 root 中完全缺失时（例如仅覆盖硬规则的旧 fixture），跳过该组。
  for (const group of [hardRuleSchemas, projectSchemas] as const) {
    const present = group.filter((path) => existsSync(join(root, path)));
    if (present.length === 0) continue;
    for (const relative of present) {
      const path = join(root, relative);
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      } catch (error) {
        issues.push(`${relative}: schema cannot be parsed: ${String(error)}`);
        continue;
      }
      walkSchema(parsed, relative, issues);
    }
    const agentsPath = join(root, 'AGENTS.md');
    const agents = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
    for (const relative of present) {
      if (!agents.includes(relative)) issues.push(`AGENTS.md does not reference ${relative}`);
    }
  }
  return issues;
}

export { hardRuleSchemas, projectSchemas, schemaPaths };
