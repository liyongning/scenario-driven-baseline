import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import {
  createRepositoryCopy,
  scopedChangeNames,
  workspaceRealpath,
  type RepositoryCopy,
} from './repository-copy.ts';

// 该 case 在副本中执行安装、构建与多次测试运行，需要比默认更长的超时。
vi.setConfig({ testTimeout: 300_000 });

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const fixturesRelative = 'packages/e2e/tests/fixtures';

type ProbeFixture = Readonly<{
  gateSelfTestSpecs: ReadonlyArray<string>;
  factCheckSpecs: ReadonlyArray<string>;
  defectChange: Readonly<{
    name: string;
    capability: string;
    requirement: string;
    scenario: string;
  }>;
  forbiddenAssertions: ReadonlyArray<string>;
}>;

function git(root: string, args: ReadonlyArray<string>) {
  const result = spawnSync('git', [...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** 在副本中运行命令：副本自带 node_modules 与固定版本工具链，不读调用方环境。 */
function run(
  copy: RepositoryCopy,
  command: string,
  args: ReadonlyArray<string>,
  extraEnv: Readonly<Record<string, string>> = {},
) {
  const result = spawnSync(command, [...args], {
    cwd: copy.root,
    env: { ...copy.env, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function specFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'archive') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === 'spec.md') found.push(path);
    }
  };
  visit(join(root, 'openspec'));
  return found;
}

/** 删除全部 FLOW 登记：主 Spec、active Change delta 与 Fixture 一并移除。 */
function removeFlowRegistrations(copy: RepositoryCopy): void {
  const removedFixtures: string[] = [];
  for (const path of specFiles(copy.root)) {
    const lines = readFileSync(path, 'utf8').split('\n');
    if (!lines.some((line) => /^\| FLOW-/.test(line))) continue;
    writeFileSync(path, lines.filter((line) => !/^\| FLOW-/.test(line)).join('\n'));
  }
  const fixtureDirectory = join(copy.root, fixturesRelative);
  for (const entry of readdirSync(fixtureDirectory)) {
    if (!entry.startsWith('FLOW-')) continue;
    removedFixtures.push(`${fixturesRelative}/${entry}`);
  }
  if (removedFixtures.length > 0) git(copy.root, ['rm', '-r', '-q', '--', ...removedFixtures]);
  // Requirement 块含 FLOW 表；删表后必须同步摘要，否则 Fixture 会按旧输入被判过期。
  const owners = readdirSync(fixtureDirectory).filter((entry) => entry.startsWith('SCN-'));
  const refresh = run(copy, 'pnpm', ['fixtures:refresh', ...owners]);
  if (refresh.status !== 0) throw new Error(`fixtures refresh failed: ${refresh.output}`);
}

/** 新增一个与任何事实核验无关、含缺陷 Scenario 的 active Change。 */
function addDefectChange(copy: RepositoryCopy, defect: ProbeFixture['defectChange']): void {
  const directory = join(copy.root, 'openspec/changes', defect.name, 'specs', defect.capability);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'spec.md'),
    [
      `# ${defect.capability}`,
      '',
      '## ADDED Requirements',
      '',
      `### Requirement: ${defect.requirement} 与事实核验无关的缺陷`,
      '',
      `#### Scenario: ${defect.scenario} 缺 verification 的缺陷场景`,
      '- **WHEN** 新增一个没有 verification 元数据块的 active Change',
      '- **THEN** 门禁报错，但门禁逻辑自测与模板自身事实核验的结论不受影响',
      '',
    ].join('\n'),
  );
  git(copy.root, ['add', '-A']);
  git(copy.root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'probe: defect change']);
}

/** 事实核验用例清单：示例自身的事实核验在标记内，删除示例时一并移除。 */
function factCheckSpecs(root: string, declared: ReadonlyArray<string>): string[] {
  const specs = [...declared];
  // template-example:begin
  specs.push('packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-012.spec.ts');
  // template-example:end
  return specs.filter((path) => existsSync(join(root, path)));
}

defineCase(
  {
    ownerId: 'SCN-SCENARIO-GATE-026',
    caseId: 'self-test-isolation-cli',
    fixtureCase: 'self-test-isolation-cli',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-SCENARIO-GATE-026',
        caseKey: 'self-test-isolation-cli',
        checks: [
          'controlled-temp-root',
          'concrete-assertions',
          'flow-branch-self-provided',
          'repo-state-independent',
          'fact-checks-scoped',
        ],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const probe = fixture as ProbeFixture;
    const copy = createRepositoryCopy({ prefix: 'scenario-gate-026-' });
    try {
      const scope = scopedChangeNames();
      removeFlowRegistrations(copy);
      addDefectChange(copy, probe.defectChange);
      const build = run(copy, 'pnpm', ['build']);
      const unit = run(copy, 'pnpm', ['test:unit'], { TEMPLATE_UNIT_MAX_WORKERS: '1' });
      const gate = run(copy, 'pnpm', [
        'exec',
        'vitest',
        'run',
        '--project',
        'integration',
        'SCN-SCENARIO-GATE-0',
      ]);
      const facts = run(copy, 'pnpm', [
        'exec',
        'vitest',
        'run',
        '--project',
        'integration',
        ...factCheckSpecs(copy.root, probe.factCheckSpecs),
      ]);

      await checkpoint('controlled-temp-root', () => {
        expect(copy.env.TEMPLATE_COPY).toBe('1');
        expect(copy.env.SCENARIO_GATE_CHANGES).toBeUndefined();
        expect(git(copy.root, ['rev-parse', '--is-inside-work-tree'])).toBe('true');
        expect(git(copy.root, ['log', '-1', '--format=%s'])).toBe('probe: defect change');
        expect(existsSync(join(copy.root, 'openspec/specs'))).toBe(true);
        expect(existsSync(join(copy.root, 'openspec/changes'))).toBe(true);
        expect(workspaceRealpath(copy.root).startsWith(realpathSync(copy.root))).toBe(true);
        for (const name of scope)
          expect(existsSync(join(copy.root, 'openspec/changes', name))).toBe(false);
      });

      await checkpoint('concrete-assertions', () => {
        // 扫描范围覆盖 GATE-001~025 的用例（Fixture 逐项登记）与门禁自身的 checkpoint/gate 单测：
        // 「只用具体断言证明结论」的退化写法在这些文件里同样不得出现。
        const sources = [
          'scripts/check-scenarios.test.ts',
          'scripts/check-scenarios.checkpoint.test.ts',
          'scripts/check-scenarios.gate.test.ts',
          'scripts/lib/scenario-gate.evidence.test.ts',
          'scripts/test-affected.evidence.test.ts',
          ...probe.gateSelfTestSpecs,
        ];
        for (const relative of sources) {
          const source = readFileSync(join(copy.root, relative), 'utf8');
          for (const forbidden of probe.forbiddenAssertions)
            expect(source, `${relative} must not contain ${forbidden}`).not.toContain(forbidden);
        }
      });

      await checkpoint('flow-branch-self-provided', () => {
        const rows = specFiles(copy.root).flatMap((path) =>
          readFileSync(path, 'utf8')
            .split('\n')
            .filter((line) => /^\| FLOW-/.test(line)),
        );
        expect(rows).toEqual([]);
        expect(
          readdirSync(join(copy.root, fixturesRelative)).filter((entry) =>
            entry.startsWith('FLOW-'),
          ),
        ).toEqual([]);
        // 覆盖率阈值 100% 由 test:unit 自带输入满足，与仓库里有无 FLOW 无关。
        expect(unit.status, unit.output).toBe(0);
        expect(unit.output).toMatch(/Branches\s*:\s*100%/);
      });

      await checkpoint('repo-state-independent', () => {
        expect(build.status, build.output).toBe(0);
        expect(
          existsSync(join(copy.root, 'openspec/changes', probe.defectChange.name, 'specs')),
        ).toBe(true);
        expect(git(copy.root, ['status', '--porcelain'])).toBe('');
        expect(gate.status, gate.output).toBe(0);
        expect(gate.output).toMatch(/Test Files\s+\d+ passed/);
        // 副本中会创建副本的用例被排除，门禁自测不会递归建副本。
        expect(gate.output).not.toContain('SCN-SCENARIO-GATE-026');
      });

      await checkpoint('fact-checks-scoped', () => {
        expect(facts.status, facts.output).toBe(0);
        expect(facts.output).toMatch(/Test Files\s+\d+ passed/);
      });
    } finally {
      rmSync(copy.root, { recursive: true, force: true });
    }
  },
  { fixtureRoot, timeoutMs: 300_000 },
);
