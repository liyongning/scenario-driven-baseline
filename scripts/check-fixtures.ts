import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadScenarioConfig } from './lib/scenario-config.ts';
import {
  activeChangeNames,
  changeScopeHelp,
  findOwnerRequirement,
  projectEffectiveSpecs,
  requirementDigest,
  resolveChangeScope,
} from './lib/spec-sources.ts';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

type Manifest = Readonly<{
  formatVersion: number;
  ownerId: string;
  sources: Readonly<{ spec: Readonly<{ requirementDigest: string }> }> &
    Readonly<Record<string, unknown>>;
  cases: Readonly<Record<string, string>>;
  supportingFiles?: Readonly<Record<string, string>>;
  sha256: Readonly<Record<string, string>>;
}>;

/** `check:fixtures` 的命令帮助；作用域默认语义见 GATE-12。 */
export const fixturesHelp = [
  'check:fixtures 校验 Fixture manifest 的来源摘要与文件哈希。',
  '用法：pnpm check:fixtures [--root <dir>] [--change <name>[,<name>]] [--help]',
  changeScopeHelp,
].join('\n');

export async function checkFixtures(
  options: Readonly<{
    fixtureRoot: string;
    repositoryRoot: string;
    changes?: ReadonlyArray<string>;
  }>,
) {
  const schema = JSON.parse(
    await readFile(
      new URL('../packages/e2e/tests/fixtures/fixture.schema.json', import.meta.url),
      'utf8',
    ),
  ) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const config = await loadScenarioConfig(options.repositoryRoot);
  const ownerPattern = new RegExp(config.ownerIdPattern);
  const projection = await projectEffectiveSpecs(options.repositoryRoot, {
    ...(options.changes === undefined ? {} : { changes: options.changes }),
  });
  const scoped = options.changes !== undefined;
  const issues: string[] = [...projection.issues];
  const entries = await readdir(options.fixtureRoot, { withFileTypes: true });
  let manifests = 0;
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const directory = join(options.fixtureRoot, entry.name);
    let manifestText: string;
    try {
      manifestText = await readFile(join(directory, 'manifest.json'), 'utf8');
    } catch {
      issues.push(`${entry.name}: manifest.json missing`);
      continue;
    }
    manifests += 1;
    if (!ownerPattern.test(entry.name))
      issues.push(`${entry.name}: ownerId does not match configured format`);
    let manifest: Manifest;
    try {
      manifest = JSON.parse(manifestText) as Manifest;
    } catch {
      issues.push(`${entry.name}: manifest JSON invalid`);
      continue;
    }
    if (!validate(manifest)) {
      issues.push(`${entry.name}: manifest schema ${ajv.errorsText(validate.errors)}`);
      continue;
    }
    if (manifest.ownerId !== entry.name)
      issues.push(`${entry.name}: ownerId ${manifest.ownerId} does not match directory`);
    // 每个 Fixture 都按目录名解析 owner：sources.spec 由 schema 保证存在，
    // 不存在"不写来源即跳过 owner 与摘要检查"的路径。
    const spec = manifest.sources.spec;
    const owner = findOwnerRequirement(projection.requirements, entry.name);
    if (!owner)
      issues.push(
        `${entry.name}: 在有效 Spec 中不存在（归档目录中残留的同名 Scenario 不能放行）`,
      );
    else if (!scoped && owner.changes.length > 1)
      issues.push(
        `${entry.name}: 多个 active Change 修改同一 Requirement（${owner.changes.join(', ')}），请用 --change 指定作用域`,
      );
    else if (requirementDigest(owner.block) !== spec.requirementDigest)
      issues.push(`${entry.name}: 来源摘要过期（运行 pnpm fixtures:refresh ${entry.name}）`);
    const declared = new Set([
      'manifest.json',
      ...Object.values(manifest.cases),
      ...Object.values(manifest.supportingFiles ?? {}),
    ]);
    for (const file of declared) {
      if (file === 'manifest.json') continue;
      try {
        const contents = await readFile(join(directory, file), 'utf8');
        if (manifest.sha256[file] !== sha256(contents))
          issues.push(`${entry.name}: sha256 mismatch for ${file}`);
      } catch {
        issues.push(`${entry.name}: declared fixture file ${file} is missing`);
      }
    }
    const files = await readdir(directory, { withFileTypes: true });
    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.json') && !declared.has(file.name))
        issues.push(`${entry.name}: undeclared fixture file ${file.name}`);
    }
  }
  return { manifests, issues };
}

export async function runFixturesCli(
  argv: ReadonlyArray<string>,
  repositoryRoot = process.cwd(),
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (argv.includes('--help') || argv.includes('-h'))
    return { help: fixturesHelp, manifests: 0, issues: [], exitCode: 0 };
  const rootIndex = argv.indexOf('--root');
  const fixtureRoot =
    rootIndex >= 0 && argv[rootIndex + 1]
      ? resolve(argv[rootIndex + 1]!)
      : resolve(repositoryRoot, 'packages/e2e/tests/fixtures');
  const resolution = resolveChangeScope({
    argv,
    environment,
    activeChanges: await activeChangeNames(repositoryRoot),
  });
  // 作用域非法时不输出覆盖结论，也不退化为不带作用域运行。
  if (resolution.issues.length > 0) return { issues: [...resolution.issues], exitCode: 1 };
  const result = await checkFixtures({
    fixtureRoot,
    repositoryRoot,
    ...(resolution.scope.changes === undefined ? {} : { changes: resolution.scope.changes }),
  });
  return { ...result, exitCode: Math.min(1, result.issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by the tooling cases. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  void runFixturesCli(process.argv).then((result) => {
    const { exitCode, ...output } = result;
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = exitCode;
  });
/* v8 ignore stop */
