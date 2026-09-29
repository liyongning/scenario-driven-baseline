import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type SpecSource = Readonly<{ path: string; content: string; kind: 'main' | 'change'; change?: string }>;
export type EffectiveSpecs = Readonly<{ documents: ReadonlyArray<SpecSource>; issues: ReadonlyArray<string> }>;

async function filesUnder(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.flatMap(entry => {
      if (entry.name === 'archive') return [];
      const path = join(root, entry.name);
      return entry.isDirectory() ? [filesUnder(path)] : entry.name === 'spec.md' ? [Promise.resolve([path])] : [];
    }));
    return nested.flat().sort();
  } catch {
    return [];
  }
}

type Requirement = Readonly<{ id: string; title: string; body: string; source: SpecSource }>;

function requirements(content: string, source: SpecSource): Requirement[] {
  const lines = content.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((line, index) => { if (/^### Requirement:\s+/.test(line)) starts.push(index); });
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    const heading = lines[start]!.replace(/^### Requirement:\s+/, '').trim();
    const id = heading.split(/\s+/, 1)[0]!;
    return { id, title: heading, body: lines.slice(start, end).join('\n').trimEnd(), source };
  });
}

function deltaSection(content: string, name: string): string {
  const start = content.indexOf(`## ${name} Requirements`);
  if (start < 0) return '';
  const rest = content.slice(start + (`## ${name} Requirements`).length);
  const next = rest.search(/^##\s+/m);
  return next < 0 ? rest : rest.slice(0, next);
}

export async function readEffectiveSpecs(repositoryRoot: string): Promise<EffectiveSpecs> {
  const mainPaths = await filesUnder(resolve(repositoryRoot, 'openspec/specs'));
  const changeRoots = await readdir(resolve(repositoryRoot, 'openspec/changes'), { withFileTypes: true }).catch(() => []);
  const main = await Promise.all(mainPaths.map(async path => ({ path, content: await readFile(path, 'utf8'), kind: 'main' as const })));
  const issues: string[] = [];
  const byId = new Map<string, Requirement>();
  for (const source of main) for (const requirement of requirements(source.content, source)) {
    if (byId.has(requirement.id)) issues.push(`${source.path}: duplicate main Requirement ${requirement.id}`);
    else byId.set(requirement.id, requirement);
  }
  const activeTouches = new Map<string, string>();
  for (const change of changeRoots.filter(entry => entry.isDirectory() && entry.name !== 'archive').sort((a, b) => a.name.localeCompare(b.name))) {
    const specPaths = await filesUnder(resolve(repositoryRoot, 'openspec/changes', change.name, 'specs'));
    for (const path of specPaths) {
      const source: SpecSource = { path, content: await readFile(path, 'utf8'), kind: 'change', change: change.name };
      const touch = (id: string) => {
        const previous = activeTouches.get(id);
        if (previous && previous !== change.name) issues.push(`active changes ${previous} and ${change.name} both touch Requirement ${id}`);
        else activeTouches.set(id, change.name);
      };
      for (const requirement of requirements(deltaSection(source.content, 'ADDED'), source)) {
        touch(requirement.id);
        if (byId.has(requirement.id)) issues.push(`${source.path}: ADDED Requirement ${requirement.id} already exists`);
        else byId.set(requirement.id, requirement);
      }
      for (const requirement of requirements(deltaSection(source.content, 'MODIFIED'), source)) {
        touch(requirement.id);
        if (!byId.has(requirement.id)) issues.push(`${source.path}: MODIFIED Requirement ${requirement.id} does not exist`);
        else byId.set(requirement.id, requirement);
      }
      for (const requirement of requirements(deltaSection(source.content, 'REMOVED'), source)) {
        touch(requirement.id);
        if (!byId.has(requirement.id)) issues.push(`${source.path}: REMOVED Requirement ${requirement.id} does not exist`);
        else byId.delete(requirement.id);
      }
      const renamed = deltaSection(source.content, 'RENAMED');
      for (const line of renamed.split(/\r?\n/)) {
        const match = /(?:FROM|from)\s*[:：]\s*([^\s]+).*?(?:TO|to)\s*[:：]\s*([^\s]+)/.exec(line);
        if (!match) continue;
        touch(match[1]!);
        touch(match[2]!);
        const previous = byId.get(match[1]!);
        if (!previous) issues.push(`${source.path}: RENAMED Requirement ${match[1]} does not exist`);
        else if (byId.has(match[2]!)) issues.push(`${source.path}: RENAMED target Requirement ${match[2]} already exists`);
        else {
          byId.delete(match[1]!);
          byId.set(match[2]!, { ...previous, id: match[2]!, title: previous.title.replace(match[1]!, match[2]!) });
        }
      }
    }
  }
  // 每个 Requirement 作为一个虚拟文档交给 AST 解析，保留原始来源路径用于错误定位。
  const documents = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({
    ...item.source,
    path: `${item.source.path}#${item.id}`,
    content: item.body,
  }));
  return { documents, issues };
}

export async function discoverSpecSources(repositoryRoot: string): Promise<SpecSource[]> {
  return (await readEffectiveSpecs(repositoryRoot)).documents.slice();
}
