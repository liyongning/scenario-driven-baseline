import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'vitest';
import { createOpenSpecStub } from './openspec-stub.ts';
import { createControlledRoot } from './controlled-root.ts';
import { writeProjectMapFixture, writeTemplateGuideFixture } from './helpers.ts';

/** 仓库根由模块位置推导，门禁自测不依赖调用方的工作目录。 */
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const gateScript = resolve(repositoryRoot, 'scripts/check-scenarios.ts');
const tsx = resolve(repositoryRoot, 'node_modules/.bin/tsx');
const config = {
  scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$', '^LEGACY-[A-Z0-9]+-[0-9]{3}$'],
  flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$', '^LEGACY-FLOW-[A-Z0-9]+-[0-9]{3}$'],
  ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
};

export const verification = (
  cases: unknown[] = [
    { key: 'normal', kind: 'behavior', requiredIn: ['integration'], checks: ['done'] },
  ],
  checkpoints: Record<string, string> = { done: '完成' },
) =>
  `\n\`\`\`json verification\n${JSON.stringify({ formatVersion: 2, checkpoints, cases, blockedBy: [] })}\n\`\`\``;
export const flowHeader =
  '| FLOW ID | Related | Stages | Cases | Environments | Notes |\n| --- | --- | --- | --- | --- | --- |\n';

/** 把仓库清单原样复制到临时根，保证门禁读取到的目录与包名一致；反例可在复制后改写。 */
export function writeProjectManifest(
  root: string,
  mutate?: (manifest: Record<string, unknown>) => void,
) {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'project.manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  mutate?.(manifest);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
}

export function fixtureRoot() {
  const controlled = createControlledRoot({
    manifest: JSON.parse(
      readFileSync(resolve(repositoryRoot, 'project.manifest.json'), 'utf8'),
    ) as unknown,
    files: { 'scenario-gate.config.json': JSON.stringify(config) },
    prefix: 'scenario-gate-cli-',
  });
  writeTemplateGuideFixture(controlled.root);
  return { root: controlled.root, cleanup: controlled.cleanup };
}

export function writeSpec(
  root: string,
  content: string,
  relative = 'openspec/specs/sample/spec.md',
) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** 按仓库清单复制每个包的最小目录（AGENTS.md 与 package.json），用例不写死包目录名。 */
export function writeRepositoryPackages(root: string) {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'project.manifest.json'), 'utf8'),
  ) as { packages: Array<{ directory: string }> };
  for (const pkg of manifest.packages) {
    const directory = join(root, 'packages', pkg.directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'AGENTS.md'), '[root](../../AGENTS.md)\n');
    writeFileSync(
      join(directory, 'package.json'),
      readFileSync(join(repositoryRoot, 'packages', pkg.directory, 'package.json')),
    );
  }
  writeProjectMapFixture(root);
}

export type InventoryOptions = Readonly<{
  /**
   * 把真实仓库的包源码根链进受控根：协议义务派生要读取产品包的消费接口声明
   * 与协议包的 `businessErrors`，只链 generated 不足以派生。
   */
  realSources?: boolean;
}>;

/** 生成产物目录整体链接，其余目录建真实目录、文件逐个链接：git 与覆盖率脚本只按文件读取。 */
const linkedDirectories = new Set(['generated', '.generated', 'dist', 'node_modules']);

function mirrorSources(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (existsSync(to)) continue;
    if (entry.isDirectory() && !linkedDirectories.has(entry.name)) mirrorSources(from, to);
    else symlinkSync(from, to, entry.isDirectory() ? 'dir' : 'file');
  }
}

export function enableInventory(root: string, options: InventoryOptions = {}) {
  const manifest = JSON.parse(readFileSync(join(root, 'project.manifest.json'), 'utf8')) as {
    packages: ReadonlyArray<{ directory: string; role: string }>;
  };
  const protocol = manifest.packages.find((pkg) => pkg.role === 'protocol');
  if (!protocol) throw new Error('fixture has no protocol package');
  writeFileSync(join(root, 'proto-gen.lock'), 'fixture');
  if (options.realSources) {
    for (const pkg of manifest.packages) {
      const source = resolve(repositoryRoot, 'packages', pkg.directory, 'src');
      const target = join(root, 'packages', pkg.directory, 'src');
      if (!existsSync(source) || existsSync(target)) continue;
      mirrorSources(source, target);
    }
  } else {
    const generated = join(root, 'packages', protocol.directory, 'src/generated');
    mkdirSync(dirname(generated), { recursive: true });
    symlinkSync(
      resolve(repositoryRoot, 'packages', protocol.directory, 'src/generated'),
      generated,
      'dir',
    );
  }
  for (const [relative, source] of [
    [
      'packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/idl-errors.json',
      'packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/idl-errors.json',
    ],
  ] as const) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(resolve(repositoryRoot, source), target);
  }
}

export function runGate(
  root: string,
  args: string[] = [],
  available = true,
  environment: Readonly<Record<string, string>> = {},
) {
  const stub = createOpenSpecStub({ available });
  try {
    const result = spawnSync(tsx, [gateScript, ...args], {
      cwd: root,
      env: { ...stub.env, ...environment },
      encoding: 'utf8',
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.stdout
        ? (JSON.parse(result.stdout) as {
            issues: string[];
            scenarios?: unknown[];
            flows?: unknown[];
            summaries?: unknown;
            digests?: unknown;
            help?: string;
            mode?: string;
          })
        : undefined,
    };
  } finally {
    stub.cleanup();
  }
}

export function runArchitecture(root: string) {
  const result = spawnSync(
    tsx,
    [
      resolve(repositoryRoot, 'scripts/check-architecture.ts'),
      '--root',
      root,
      '--dependency-exit-code',
      '0',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.stdout ? (JSON.parse(result.stdout) as { issues: string[] }) : undefined,
  };
}

/** 运行项目地图检查 CLI：stdout 为 { issues }，退出码非零表示存在违规。 */
export function runProjectMap(root: string) {
  const result = spawnSync(
    tsx,
    [resolve(repositoryRoot, 'scripts/check-project-map.ts'), '--root', root],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.stdout ? (JSON.parse(result.stdout) as { issues: string[] }) : undefined,
  };
}

export function cliEvidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => void | Promise<void>,
  options: Readonly<{ timeoutMs?: number }> = {},
) {
  test(
    `${id} ${caseId}`,
    {
      // 默认 30s；并发重负载下会超出预算的用例（例如 GATE-024 的多次 verify 续跑）可显式提高。
      timeout: options.timeoutMs ?? 30_000,
      meta: {
        scenarioCase: {
          ownerId: id,
          caseId,
          fixtureCase: caseId,
          environment: 'integration',
          covers: [{ id, caseKey: caseId, checks }],
        },
      },
    },
    async (context: TestContext) => {
      const before = context.expect.getState().assertionCalls;
      const executed: string[] = [];
      await body(context, async (name, assertion) => {
        await assertion();
        executed.push(name);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}
