import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, type TestContext } from 'vitest';
import { createOpenSpecStub } from './openspec-stub.ts';
import { createControlledRoot } from './controlled-root.ts';
import { writeTemplateGuideFixture } from './helpers.ts';

const repositoryRoot = process.cwd();
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

export function enableInventory(root: string) {
  const generated = join(root, 'packages/protocol/src/generated');
  mkdirSync(dirname(generated), { recursive: true });
  symlinkSync(resolve(repositoryRoot, 'packages/protocol/src/generated'), generated, 'dir');
  writeFileSync(join(root, 'proto-gen.lock'), 'fixture');
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

export function runGate(root: string, args: string[] = [], available = true) {
  const stub = createOpenSpecStub({ available });
  try {
    const result = spawnSync(tsx, [gateScript, ...args], {
      cwd: root,
      env: stub.env,
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

export function cliEvidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => void | Promise<void>,
) {
  test(
    `${id} ${caseId}`,
    {
      timeout: 30_000,
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
