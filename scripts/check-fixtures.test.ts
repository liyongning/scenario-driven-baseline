import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import {
  createControlledRoot,
  type ControlledRoot,
} from '../packages/e2e/tests/tooling/controlled-root.ts';
import { checkFixtures, runFixturesCli } from './check-fixtures.ts';
import { refreshFixtures, refreshOwners, runRefreshCli } from './fixtures-refresh.ts';
import { normalizeRequirementBlock } from './lib/spec-sources.ts';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

const config = {
  scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
  flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
  ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
};

const baseSpec = [
  '# Sample',
  '',
  '### Requirement: BASE-01 交易示例',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
  '',
  '- **WHEN** 调用创建交易',
  '- **THEN** 返回订单号',
  '',
  '| FLOW ID | Related | Stages | Cases | Environments | Notes |',
  '| --- | --- | --- | --- | --- | --- |',
  '| FLOW-SAMPLE-FLOW-001 | SCN-SAMPLE-CONTRACT-001 | create → result | normal | integration | |',
  '',
  '### Requirement: BASE-02 查询示例',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-002 查询交易',
  '',
  '- **WHEN** 查询',
  '- **THEN** 返回状态',
  '',
].join('\n');

/** 已规范化的主 Spec Requirement 块（BASE-01）与期望摘要：手工字面量，不经过被测函数。 */
const base01Block = [
  '### Requirement: BASE-01 交易示例',
  '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
  '- **WHEN** 调用创建交易',
  '- **THEN** 返回订单号',
  '| FLOW ID | Related | Stages | Cases | Environments | Notes |',
  '| --- | --- | --- | --- | --- | --- |',
  '| FLOW-SAMPLE-FLOW-001 | SCN-SAMPLE-CONTRACT-001 | create → result | normal | integration | |',
].join('\n');

const roots: ControlledRoot[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) root.cleanup();
});

function createRoot(options: { spec?: string; changes?: Record<string, string> } = {}) {
  const root = createControlledRoot({
    files: { 'scenario-gate.config.json': JSON.stringify(config) },
    prefix: 'fixture-gate-',
  });
  roots.push(root);
  mkdirSync(join(root.root, 'openspec/specs/sample'), { recursive: true });
  writeFileSync(join(root.root, 'openspec/specs/sample/spec.md'), options.spec ?? baseSpec);
  for (const [name, content] of Object.entries(options.changes ?? {})) {
    const path = join(root.root, 'openspec/changes', name, 'specs/sample/spec.md');
    mkdirSync(join(root.root, 'openspec/changes', name, 'specs/sample'), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

const fixturesOf = (root: ControlledRoot) => join(root.root, 'packages/e2e/tests/fixtures');

function writeFixture(
  root: ControlledRoot,
  owner: string,
  spec: Readonly<{
    requirementDigest?: string;
    path?: string;
    sha256?: string;
    omitDigest?: boolean;
  }>,
) {
  const directory = join(fixturesOf(root), owner);
  mkdirSync(directory, { recursive: true });
  const caseFile = 'case.json';
  const content = '{"request":"fixture","response":{}}';
  writeFileSync(join(directory, caseFile), content);
  const manifest = {
    formatVersion: 1,
    ownerId: owner,
    sources: {
      spec: spec.path
        ? { path: spec.path, sha256: spec.sha256 ?? sha('missing') }
        : spec.omitDigest
          ? {}
          : { requirementDigest: spec.requirementDigest },
    },
    cases: { case: caseFile },
    sha256: { [caseFile]: sha(content) },
  };
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
  return directory;
}

/** 与 dependency-rules.test.ts 相同的 module 证据登记方式：每个 case 一段可核对断言。 */
async function evidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `${id} ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: id,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
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

test('normalizes requirement blocks by LF, trailing whitespace and blank lines only', () => {
  const messy = '### Requirement: X y\r\n\r\n- a   \r\n\r\n- b\t\n\n';
  expect(normalizeRequirementBlock(messy)).toBe('### Requirement: X y\n- a\n- b');
  expect(sha(normalizeRequirementBlock(messy))).toBe(sha('### Requirement: X y\n- a\n- b'));
});

evidence(
  'SCN-SCENARIO-GATE-012',
  'fixture-source-rules',
  [
    'owner-from-directory',
    'digest-normalized',
    'stale-with-refresh-hint',
    'missing-owner-rejected',
    'path-field-rejected',
  ],
  async (context, check) => {
    await check('owner-from-directory', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', { requirementDigest: sha(base01Block) });
      writeFixture(root, 'FLOW-SAMPLE-FLOW-001', { requirementDigest: sha(base01Block) });
      const result = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
      });
      context.expect(result.manifests).toBe(2);
      context.expect(result.issues).toEqual([]);
    });

    await check('digest-normalized', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', { requirementDigest: sha(base01Block) });
      // 只改换行风格、行尾空白与空行：摘要不变，检查仍通过。
      writeFileSync(
        join(root.root, 'openspec/specs/sample/spec.md'),
        baseSpec
          .replace(/\n/g, '\r\n')
          .replace('- **THEN** 返回订单号', '- **THEN** 返回订单号   \n\n'),
      );
      const result = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
      });
      context.expect(result.issues).toEqual([]);
    });

    await check('stale-with-refresh-hint', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', { requirementDigest: sha(base01Block) });
      writeFileSync(
        join(root.root, 'openspec/specs/sample/spec.md'),
        baseSpec.replace('- **THEN** 返回订单号', '- **THEN** 返回订单号与支付链接'),
      );
      const result = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
      });
      context.expect(result.issues.join('\n')).toContain('来源摘要过期');
      context
        .expect(result.issues.join('\n'))
        .toContain('pnpm fixtures:refresh SCN-SAMPLE-CONTRACT-001');
    });

    await check('missing-owner-rejected', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', { requirementDigest: sha(base01Block) });
      // 主 Spec 删除该 Scenario，但归档目录仍保留含它的旧 Spec。
      writeFileSync(
        join(root.root, 'openspec/specs/sample/spec.md'),
        baseSpec.replace(
          '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n\n- **WHEN** 调用创建交易\n- **THEN** 返回订单号\n\n',
          '',
        ),
      );
      const archived = join(root.root, 'openspec/changes/archive/old/specs/sample/spec.md');
      mkdirSync(join(archived, '..'), { recursive: true });
      writeFileSync(archived, baseSpec);
      const result = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
      });
      context.expect(result.issues.join('\n')).toContain('在有效 Spec 中不存在');
    });

    await check('path-field-rejected', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', {
        path: 'openspec/specs/sample/spec.md',
        sha256: sha(baseSpec),
      });
      const result = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
      });
      context.expect(result.issues.join('\n')).toContain('manifest schema');
      const empty = createRoot();
      writeFixture(empty, 'SCN-SAMPLE-CONTRACT-002', { omitDigest: true });
      const missing = await checkFixtures({
        fixtureRoot: fixturesOf(empty),
        repositoryRoot: empty.root,
      });
      context.expect(missing.issues.join('\n')).toContain('manifest schema');
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-013',
  'fixture-refresh-rules',
  ['refresh-recomputes', 'refresh-scoped', 'refresh-rejects-invalid'],
  async (context, check) => {
    await check('refresh-recomputes', async () => {
      const root = createRoot();
      const directory = writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', {
        requirementDigest: sha('stale'),
      });
      writeFileSync(
        join(root.root, 'openspec/specs/sample/spec.md'),
        baseSpec.replace('- **THEN** 返回订单号', '- **THEN** 返回订单号与支付链接'),
      );
      writeFileSync(join(directory, 'case.json'), '{"request":"changed","response":{}}');
      const refreshed = await refreshFixtures({
        repositoryRoot: root.root,
        fixtureRoot: fixturesOf(root),
        owners: ['SCN-SAMPLE-CONTRACT-001'],
      });
      context.expect(refreshed.issues).toEqual([]);
      context.expect(refreshed.updated).toEqual(['SCN-SAMPLE-CONTRACT-001']);
      const result = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
      });
      context.expect(result.issues).toEqual([]);
    });

    await check('refresh-scoped', async () => {
      const root = createRoot();
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', { requirementDigest: sha('stale') });
      const untouched = writeFixture(root, 'SCN-SAMPLE-CONTRACT-002', {
        requirementDigest: sha('stale'),
      });
      const before = (await import('node:fs')).readFileSync(
        join(untouched, 'manifest.json'),
        'utf8',
      );
      await refreshFixtures({
        repositoryRoot: root.root,
        fixtureRoot: fixturesOf(root),
        owners: ['SCN-SAMPLE-CONTRACT-001'],
      });
      const after = (await import('node:fs')).readFileSync(
        join(untouched, 'manifest.json'),
        'utf8',
      );
      context.expect(after).toBe(before);
    });

    await check('refresh-rejects-invalid', async () => {
      const root = createRoot();
      const directory = writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', {
        requirementDigest: sha('stale'),
      });
      const before = (await import('node:fs')).readFileSync(
        join(directory, 'manifest.json'),
        'utf8',
      );
      const missing = await refreshFixtures({
        repositoryRoot: root.root,
        fixtureRoot: fixturesOf(root),
        owners: ['SCN-SAMPLE-MISSING-999'],
      });
      context.expect(missing.updated).toEqual([]);
      context.expect(missing.issues.join('\n')).toContain('没有对应的 Fixture 目录');
      // 与合法 owner 一起传入时，任一失败都不写入任何文件。
      const mixed = await refreshFixtures({
        repositoryRoot: root.root,
        fixtureRoot: fixturesOf(root),
        owners: ['SCN-SAMPLE-CONTRACT-001', 'SCN-SAMPLE-MISSING-999'],
      });
      context.expect(mixed.updated).toEqual([]);
      context.expect(mixed.issues).not.toEqual([]);
      context
        .expect((await import('node:fs')).readFileSync(join(directory, 'manifest.json'), 'utf8'))
        .toBe(before);
      const cli = await runRefreshCli(['node', 'script'], root.root, {});
      context.expect(cli.exitCode).toBe(1);
      context.expect(cli.issues.join('\n')).toContain('需要至少一个 owner');
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-014',
  'fixture-ambiguity-rules',
  ['ambiguity-reported', 'scope-resolves'],
  async (context, check) => {
    const betaBlock = [
      '### Requirement: BASE-01 交易示例（B 改）',
      '',
      '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
      '',
      '- **WHEN** 调用创建交易 B',
      '- **THEN** 返回订单号 B',
    ].join('\n');
    const modified = (label: string) =>
      [
        '## MODIFIED Requirements',
        '',
        `### Requirement: BASE-01 交易示例（${label} 改）`,
        '',
        '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
        '',
        `- **WHEN** 调用创建交易 ${label}`,
        `- **THEN** 返回订单号 ${label}`,
        '',
      ].join('\n');

    await check('ambiguity-reported', async () => {
      const root = createRoot({ changes: { alpha: modified('A'), beta: modified('B') } });
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', { requirementDigest: sha(base01Block) });
      const result = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
      });
      const text = result.issues.join('\n');
      context.expect(text).toContain('多个 active Change 修改同一 Requirement');
      context.expect(text).toContain('alpha');
      context.expect(text).toContain('beta');
      const cli = await runFixturesCli(
        ['node', 'script', '--root', fixturesOf(root)],
        root.root,
        {},
      );
      context.expect(cli.exitCode).toBe(1);
      context.expect((cli.issues ?? []).join('\n')).toContain('多个 active Change');
    });

    await check('scope-resolves', async () => {
      const root = createRoot({ changes: { alpha: modified('A'), beta: modified('B') } });
      writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', {
        requirementDigest: sha(normalizeRequirementBlock(betaBlock)),
      });
      const scoped = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
        changes: ['beta'],
      });
      context.expect(scoped.issues).toEqual([]);
      const wrong = await checkFixtures({
        fixtureRoot: fixturesOf(root),
        repositoryRoot: root.root,
        changes: ['alpha'],
      });
      context.expect(wrong.issues.join('\n')).toContain('来源摘要过期');
    });
  },
);

test('reports missing, invalid, mismatched and undeclared fixture manifests', async () => {
  const root = createRoot();
  const fixtures = fixturesOf(root);
  mkdirSync(join(fixtures, 'SCN-SAMPLE-CONTRACT-009'), { recursive: true });
  const invalid = join(fixtures, 'SCN-SAMPLE-CONTRACT-010');
  mkdirSync(invalid, { recursive: true });
  writeFileSync(join(invalid, 'manifest.json'), '{');
  const schemaInvalid = join(fixtures, 'SCN-SAMPLE-CONTRACT-011');
  mkdirSync(schemaInvalid, { recursive: true });
  writeFileSync(join(schemaInvalid, 'manifest.json'), '{}');
  const wrongFormat = join(fixtures, 'bad-owner');
  mkdirSync(wrongFormat, { recursive: true });
  writeFileSync(join(wrongFormat, 'case.json'), '{}');
  writeFileSync(
    join(wrongFormat, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      ownerId: 'bad-owner',
      sources: { idlCommit: 'a'.repeat(40) },
      cases: { case: 'case.json' },
      sha256: { 'case.json': sha('{}') },
    }),
  );
  const mismatch = join(fixtures, 'SCN-SAMPLE-CONTRACT-012');
  mkdirSync(mismatch, { recursive: true });
  const caseText = '{"request":"fixture"}';
  writeFileSync(join(mismatch, 'case.json'), caseText);
  writeFileSync(join(mismatch, 'extra.json'), '{}');
  writeFileSync(
    join(mismatch, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      ownerId: 'SCN-SAMPLE-CONTRACT-013',
      sources: { spec: { requirementDigest: sha('missing') } },
      cases: { case: 'case.json' },
      sha256: { 'case.json': '0'.repeat(64), 'absent.json': '1'.repeat(64) },
      supportingFiles: { absent: 'absent.json' },
    }),
  );
  const noSpec = join(fixtures, 'SCN-SAMPLE-CONTRACT-004');
  mkdirSync(noSpec, { recursive: true });
  writeFileSync(join(noSpec, 'case.json'), '{}');
  writeFileSync(
    join(noSpec, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      ownerId: 'SCN-SAMPLE-CONTRACT-004',
      sources: { idlCommit: 'a'.repeat(40) },
      cases: { case: 'case.json' },
      sha256: { 'case.json': sha('{}') },
    }),
  );
  const result = await checkFixtures({ fixtureRoot: fixtures, repositoryRoot: root.root });
  const text = result.issues.join('\n');
  expect(result.issues.filter((issue) => issue.startsWith('SCN-SAMPLE-CONTRACT-004'))).toEqual([]);
  expect(text).toContain('manifest.json missing');
  expect(text).toContain('manifest JSON invalid');
  expect(text).toContain('manifest schema');
  expect(text).toContain('bad-owner: ownerId does not match configured format');
  expect(text).toContain('SCN-SAMPLE-CONTRACT-012: ownerId SCN-SAMPLE-CONTRACT-013');
  expect(text).toContain('在有效 Spec 中不存在');
  expect(text).toContain('sha256 mismatch for case.json');
  expect(text).toContain('declared fixture file absent.json is missing');
  expect(text).toContain('undeclared fixture file extra.json');
});

test('check:fixtures CLI prints help and defaults the fixture root', async () => {
  const root = createRoot();
  const help = await runFixturesCli(['node', 'script', '--help'], root.root, {});
  expect(help.exitCode).toBe(0);
  expect(help.help).toContain('不带 --change');
  mkdirSync(fixturesOf(root), { recursive: true });
  expect((await runFixturesCli(['node', 'script'], root.root, {})).manifests).toBe(0);
  const shorthand = await runFixturesCli(['node', 'script', '-h'], root.root, {});
  expect(shorthand.exitCode).toBe(0);
});

test('fixtures:refresh reports invalid owners, help and scope errors', async () => {
  const root = createRoot({
    changes: {
      alpha:
        '## MODIFIED Requirements\n\n### Requirement: BASE-01 交易示例（A 改）\n\n#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n\n- **WHEN** A\n- **THEN** A\n',
      beta: '## MODIFIED Requirements\n\n### Requirement: BASE-01 交易示例（B 改）\n\n#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n\n- **WHEN** B\n- **THEN** B\n',
    },
  });
  const fixtures = fixturesOf(root);
  writeFixture(root, 'SCN-SAMPLE-CONTRACT-001', { requirementDigest: sha('stale') });
  writeFixture(root, 'SCN-SAMPLE-CONTRACT-008', { requirementDigest: sha('stale') });
  writeFixture(root, 'SCN-SAMPLE-MISSING-777', { requirementDigest: sha('stale') });

  const missing = await refreshFixtures({
    repositoryRoot: root.root,
    fixtureRoot: fixtures,
    owners: ['SCN-SAMPLE-MISSING-777'],
  });
  expect(missing.issues.join('\n')).toContain('在有效 Spec 中不存在');
  expect(missing.updated).toEqual([]);

  const ambiguous = await refreshFixtures({
    repositoryRoot: root.root,
    fixtureRoot: fixtures,
    owners: ['SCN-SAMPLE-CONTRACT-001'],
  });
  expect(ambiguous.issues.join('\n')).toContain('多个 active Change 修改同一 Requirement');

  expect(
    refreshOwners(['node', 'script', '--change', 'alpha', '--root', 'x', '-v', 'owner']),
  ).toEqual(['owner']);

  const help = await runRefreshCli(['node', 'script', '--help'], root.root, {});
  expect(help.exitCode).toBe(0);
  expect(help.help).toContain('fixtures:refresh');

  const scoped = await runRefreshCli(
    ['node', 'script', '--change', 'missing', 'SCN-SAMPLE-CONTRACT-001'],
    root.root,
    {},
  );
  expect(scoped.exitCode).toBe(1);
  expect(scoped.issues.join('\n')).toContain('--change missing');

  const ok = await runRefreshCli(
    ['node', 'script', '--change', 'alpha', 'SCN-SAMPLE-CONTRACT-001'],
    root.root,
    {},
  );
  expect(ok.exitCode).toBe(0);
  expect(ok.updated).toEqual(['SCN-SAMPLE-CONTRACT-001']);

  const unscoped = await runRefreshCli(
    ['node', 'script', 'SCN-SAMPLE-CONTRACT-001'],
    root.root,
    {},
  );
  expect(unscoped.exitCode).toBe(1);
  expect(unscoped.issues.join('\n')).toContain('多个 active Change 修改同一 Requirement');

  const scopedCheck = await runFixturesCli(['node', 'script', '--change', 'alpha'], root.root, {});
  expect(scopedCheck.exitCode).toBe(1);
  expect(scopedCheck.issues.join('\n')).toContain('SCN-SAMPLE-CONTRACT-008: 在有效 Spec 中不存在');
});
