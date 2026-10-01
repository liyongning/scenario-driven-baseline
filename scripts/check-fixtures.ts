import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadScenarioConfig } from './lib/scenario-config.ts';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
type Manifest = Readonly<{
  formatVersion: number;
  ownerId: string;
  sources: Readonly<{ spec?: Readonly<{ path?: string; sha256?: string }> }> & Readonly<Record<string, unknown>>;
  cases: Readonly<Record<string, string>>;
  supportingFiles?: Readonly<Record<string, string>>;
  sha256: Readonly<Record<string, string>>;
}>;

export async function checkFixtures(options: Readonly<{ fixtureRoot: string; repositoryRoot: string }>) {
  const schema = JSON.parse(await readFile(new URL('../packages/e2e/tests/fixtures/fixture.schema.json', import.meta.url), 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const issues: string[] = [];
  const config = await loadScenarioConfig(options.repositoryRoot);
  const ownerPattern = new RegExp(config.ownerIdPattern);
  const entries = await readdir(options.fixtureRoot, { withFileTypes: true });
  let manifests = 0;
  for (const entry of entries.filter(item => item.isDirectory())) {
    const directory = join(options.fixtureRoot, entry.name);
    let manifestText: string;
    try { manifestText = await readFile(join(directory, 'manifest.json'), 'utf8'); }
    catch { issues.push(`${entry.name}: manifest.json missing`); continue; }
    manifests += 1;
    if (!ownerPattern.test(entry.name)) issues.push(`${entry.name}: ownerId does not match configured format`);
    let manifest: Manifest;
    try { manifest = JSON.parse(manifestText) as Manifest; }
    catch { issues.push(`${entry.name}: manifest JSON invalid`); continue; }
    if (!validate(manifest)) { issues.push(`${entry.name}: manifest schema ${ajv.errorsText(validate.errors)}`); continue; }
    if (manifest.ownerId !== entry.name) issues.push(`${entry.name}: ownerId ${manifest.ownerId} does not match directory`);
    const spec = manifest.sources.spec;
    if (spec?.path && spec.sha256) {
      try {
        const actual = sha(await readFile(resolve(options.repositoryRoot, spec.path), 'utf8'));
        if (actual !== spec.sha256) issues.push(`${entry.name}: spec source digest is stale`);
      } catch { issues.push(`${entry.name}: spec source ${spec.path} is missing`); }
    }
    const declared = new Set(['manifest.json', ...Object.values(manifest.cases), ...Object.values(manifest.supportingFiles ?? {})]);
    for (const file of declared) {
      if (file === 'manifest.json') continue;
      try {
        const contents = await readFile(join(directory, file), 'utf8');
        if (manifest.sha256[file] !== sha(contents)) issues.push(`${entry.name}: sha256 mismatch for ${file}`);
      } catch { issues.push(`${entry.name}: declared fixture file ${file} is missing`); }
    }
    const files = await readdir(directory, { withFileTypes: true });
    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.json') && !declared.has(file.name)) issues.push(`${entry.name}: undeclared fixture file ${file.name}`);
    }
  }
  return { manifests, issues };
}

export async function runFixturesCli(argv: ReadonlyArray<string>, repositoryRoot = process.cwd()) {
  const rootIndex = argv.indexOf('--root');
  const fixtureRoot = rootIndex >= 0 && argv[rootIndex + 1]
    ? resolve(argv[rootIndex + 1]!)
    : resolve(repositoryRoot, 'packages/e2e/tests/fixtures');
  const result = await checkFixtures({ fixtureRoot, repositoryRoot });
  return { ...result, exitCode: Math.min(1, result.issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by TC-PAYSDK-CORE-015. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) void runFixturesCli(process.argv).then(result => {
  const { exitCode, ...output } = result;
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = exitCode;
});
/* v8 ignore stop */
