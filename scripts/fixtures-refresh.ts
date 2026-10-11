import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  activeChangeNames,
  changeScopeHelp,
  findOwnerRequirement,
  projectEffectiveSpecs,
  requirementDigest,
  resolveChangeScope,
} from './lib/spec-sources.ts';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

type Manifest = {
  sources: Record<string, unknown>;
  cases: Record<string, string>;
  supportingFiles?: Record<string, string>;
  sha256: Record<string, string>;
} & Record<string, unknown>;

/** `pnpm fixtures:refresh` 的命令帮助。 */
export const refreshHelp = [
  'pnpm fixtures:refresh <owner...> 重算指定 Fixture 的 requirementDigest 与 case 文件 sha256。',
  '用法：pnpm fixtures:refresh <SCN-...|FLOW-...>... [--change <name>[,<name>]] [--help]',
  changeScopeHelp,
].join('\n');

export async function refreshFixtures(
  options: Readonly<{
    repositoryRoot: string;
    fixtureRoot: string;
    owners: ReadonlyArray<string>;
    changes?: ReadonlyArray<string>;
  }>,
) {
  const projection = await projectEffectiveSpecs(options.repositoryRoot, {
    ...(options.changes === undefined ? {} : { changes: options.changes }),
  });
  const scoped = options.changes !== undefined;
  const issues: string[] = [...projection.issues];
  const pending: Array<{ path: string; text: string }> = [];
  const updated: string[] = [];
  for (const owner of options.owners) {
    const directory = join(options.fixtureRoot, owner);
    const path = join(directory, 'manifest.json');
    if (!existsSync(path)) {
      issues.push(`${owner}: 没有对应的 Fixture 目录`);
      continue;
    }
    const requirement = findOwnerRequirement(projection.requirements, owner);
    if (!requirement) {
      issues.push(`${owner}: 在有效 Spec 中不存在（归档目录中残留的同名 Scenario 不能放行）`);
      continue;
    }
    if (!scoped && requirement.changes.length > 1) {
      issues.push(
        `${owner}: 多个 active Change 修改同一 Requirement（${requirement.changes.join(', ')}），请用 --change 指定作用域`,
      );
      continue;
    }
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
    manifest.sources = {
      ...manifest.sources,
      spec: { requirementDigest: requirementDigest(requirement.block) },
    };
    const declared = [
      ...Object.values(manifest.cases),
      ...Object.values(manifest.supportingFiles ?? {}),
    ];
    const digests = { ...manifest.sha256 };
    for (const file of declared)
      digests[file] = sha256(readFileSync(join(directory, file), 'utf8'));
    manifest.sha256 = digests;
    pending.push({ path, text: `${JSON.stringify(manifest, null, 2)}\n` });
    updated.push(owner);
  }
  if (issues.length === 0) for (const file of pending) writeFileSync(file.path, file.text);
  return { updated: issues.length === 0 ? updated : [], issues };
}

/** 位置参数：跳过 node/脚本名、`--change`/`--root` 的取值与其他旗标。 */
export function refreshOwners(argv: ReadonlyArray<string>): string[] {
  const owners: string[] = [];
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === '--change' || value === '--root') {
      index += 1;
      continue;
    }
    if (value.startsWith('-')) continue;
    owners.push(value);
  }
  return owners;
}

export async function runRefreshCli(
  argv: ReadonlyArray<string>,
  repositoryRoot = process.cwd(),
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (argv.includes('--help') || argv.includes('-h'))
    return { help: refreshHelp, updated: [], issues: [], exitCode: 0 };
  const owners = refreshOwners(argv);
  if (owners.length === 0) return { updated: [], issues: ['需要至少一个 owner'], exitCode: 1 };
  const resolution = resolveChangeScope({
    argv,
    environment,
    activeChanges: await activeChangeNames(repositoryRoot),
  });
  if (resolution.issues.length > 0)
    return { updated: [], issues: [...resolution.issues], exitCode: 1 };
  const result = await refreshFixtures({
    repositoryRoot,
    fixtureRoot: resolve(repositoryRoot, 'packages/e2e/tests/fixtures'),
    owners,
    ...(resolution.scope.changes === undefined ? {} : { changes: resolution.scope.changes }),
  });
  return { ...result, exitCode: Math.min(1, result.issues.length) };
}

/* v8 ignore start -- the real CLI branch is exercised by the tooling cases. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  void runRefreshCli(process.argv).then((result) => {
    const { exitCode, ...output } = result;
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = exitCode;
  });
/* v8 ignore stop */
