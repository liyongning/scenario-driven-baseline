import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repositoryRoot } from './helpers.ts';

export type CliRoot = Readonly<{
  root: string;
  env: Readonly<Record<string, string | undefined>>;
}>;

/** 受控反例临时写入文件，断言后恢复原内容或删除新建文件。 */
export function writeAndRestore(path: string, value: string, assertion: () => void): void {
  let original: string | undefined;
  try {
    original = readFileSync(path, 'utf8');
  } catch {
    original = undefined;
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
    assertion();
  } finally {
    if (original === undefined) rmSync(path, { force: true });
    else writeFileSync(path, original);
  }
}

function run(
  root: CliRoot,
  command: string,
  args: ReadonlyArray<string>,
): Readonly<{ status: number | null; output: string }> {
  const result = spawnSync(command, [...args], {
    cwd: root.root,
    env: {
      ...root.env,
      PATH: `${resolve(repositoryRoot, 'node_modules/.bin')}:${root.env.PATH ?? ''}`,
    },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

export function runEslint(root: CliRoot, paths: ReadonlyArray<string>) {
  return run(root, resolve(repositoryRoot, 'node_modules/.bin/eslint'), [
    '--config',
    resolve(repositoryRoot, 'eslint.config.js'),
    ...paths,
  ]);
}

export function runTsc(root: CliRoot, project: string) {
  return run(root, resolve(repositoryRoot, 'node_modules/.bin/tsc'), ['-p', project, '--noEmit']);
}

export function runPnpm(root: CliRoot, args: ReadonlyArray<string>) {
  return run(root, 'pnpm', args);
}

/** 将真实依赖规则复制到受控根，使 depcruise CLI 按临时清单生成规则。 */
export function prepareDependencyCruiser(root: CliRoot): void {
  for (const relative of ['.dependency-cruiser.cjs', 'tsconfig.base.json']) {
    const path = join(root.root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, readFileSync(join(repositoryRoot, relative), 'utf8'));
  }
  const rules = join(root.root, 'scripts/lib/dependency-rules.cjs');
  mkdirSync(dirname(rules), { recursive: true });
  writeFileSync(
    rules,
    readFileSync(join(repositoryRoot, 'scripts/lib/dependency-rules.cjs'), 'utf8'),
  );
}

export function runDependencyCruiser(root: CliRoot, targets: ReadonlyArray<string>) {
  return run(root, resolve(repositoryRoot, 'node_modules/.bin/depcruise'), [
    '--config',
    resolve(root.root, '.dependency-cruiser.cjs'),
    '--output-type',
    'err-long',
    ...targets,
  ]);
}
