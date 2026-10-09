import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { createControlledRoot } from '../../packages/e2e/tests/tooling/controlled-root.ts';
import {
  activeChangeNames,
  discoverSpecSources,
  parseChangeArguments,
  projectEffectiveSpecs,
  readEffectiveSpecs,
  resolveChangeScope,
} from './spec-sources.ts';
import { runFixturesCli } from '../check-fixtures.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'effective-specs-'));
  await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
  await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
  await mkdir(join(root, 'openspec/changes/archive/old/specs/example'), { recursive: true });
  await writeFile(
    join(root, 'openspec/specs/example/spec.md'),
    `# Example\n\n### Requirement: BASE base\n\n#### Scenario: SCN-SAMPLE-BASE-001 Base\n\nbase\n\n### Requirement: REMOVE remove\n\n#### Scenario: SCN-SAMPLE-REMOVE-001 Remove\n\nremove\n`,
  );
  await writeFile(
    join(root, 'openspec/changes/active/specs/example/spec.md'),
    `## ADDED Requirements\n\n### Requirement: ADD added\n\n#### Scenario: SCN-TEMPLATE-EXAMPLE-001 Added\n\nadded\n\n## MODIFIED Requirements\n\n### Requirement: BASE base changed\n\n#### Scenario: SCN-SAMPLE-BASE-002 Changed\n\nchanged\n\n## REMOVED Requirements\n\n### Requirement: REMOVE remove\n\n## RENAMED Requirements\n\n- FROM: ADD TO: RENAMED\n`,
  );
  await writeFile(
    join(root, 'openspec/changes/archive/old/specs/example/spec.md'),
    `### Requirement: ARCHIVE ignored\n\n#### Scenario: SCN-SAMPLE-ARCHIVE-001 Ignored\n`,
  );
  return root;
}

describe('readEffectiveSpecs', () => {
  it('reports FLOW tables outside Requirements before archive projection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'effective-specs-flow-placement-'));
    await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
    await writeFile(
      join(root, 'openspec/specs/example/spec.md'),
      '| FLOW ID | Related | Stages | Cases | Environments | Notes |\n| --- | --- | --- | --- | --- | --- |\n| FLOW-TEST-001 | SCN-TEST-001 | create | normal | integration | outside |',
    );
    expect((await readEffectiveSpecs(root)).issues.join('\n')).toContain(
      'would be lost during archive',
    );
    await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
    await writeFile(
      join(root, 'openspec/changes/active/specs/example/spec.md'),
      '| FLOW ID | Related | Stages | Cases | Environments | Notes |\n| --- | --- | --- | --- | --- | --- |\n| FLOW-TEST-002 | SCN-TEST-001 | create | normal | integration | outside |',
    );
    expect((await readEffectiveSpecs(root)).issues.join('\n')).toContain(
      'openspec/changes/active/specs/example/spec.md: FLOW table',
    );
    await writeFile(
      join(root, 'openspec/specs/example/spec.md'),
      '```md\n| FLOW ID | Related | Stages | Cases | Environments | Notes |\n| --- | --- | --- | --- | --- | --- |\n```\n### Requirement: BASE inside\n',
    );
    await writeFile(
      join(root, 'openspec/changes/active/specs/example/spec.md'),
      '## MODIFIED Requirements\n### Requirement: BASE inside\n',
    );
    expect((await readEffectiveSpecs(root)).issues).toEqual([]);
  });
  it('merges active added, modified, removed, and renamed requirements while ignoring archive', async () => {
    const result = await readEffectiveSpecs(await fixture());
    const text = result.documents.map((document) => document.content).join('\n');
    expect(text).toContain('SCN-SAMPLE-BASE-002');
    expect(text).not.toContain('SCN-SAMPLE-BASE-001');
    expect(text).not.toContain('SCN-SAMPLE-REMOVE-001');
    expect(text).toContain('SCN-TEMPLATE-EXAMPLE-001');
    expect(text).not.toContain('ARCHIVE');
    expect((await discoverSpecSources(await fixture())).length).toBeGreaterThan(0);
  });

  it('handles missing spec trees and empty change roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'effective-specs-empty-'));
    expect(await readEffectiveSpecs(root)).toEqual({ documents: [], issues: [] });
    await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
    await writeFile(join(root, 'openspec/specs/example/spec.md'), '### Requirement: ONLY single\n');
    await writeFile(join(root, 'openspec/specs/example/notes.txt'), 'ignored');
    await mkdir(join(root, 'openspec/specs/archive'), { recursive: true });
    await writeFile(
      join(root, 'openspec/specs/archive/spec.md'),
      '### Requirement: ARCHIVED ignored\n',
    );
    expect((await readEffectiveSpecs(root)).documents.map((item) => item.content)).toEqual([
      '### Requirement: ONLY single',
    ]);
    await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
    await mkdir(join(root, 'openspec/changes/zeta/specs'), { recursive: true });
    await writeFile(
      join(root, 'openspec/changes/active/specs/example/spec.md'),
      '## RENAMED Requirements\n\n- FROM: MISSING TO: STILL-MISSING\n',
    );
    expect((await readEffectiveSpecs(root)).documents.map((item) => item.content)).toEqual([
      '### Requirement: ONLY single',
    ]);
  });

  it('reports invalid delta targets and conflicting active changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'effective-specs-conflicts-'));
    await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
    await mkdir(join(root, 'openspec/changes/one/specs/example'), { recursive: true });
    await mkdir(join(root, 'openspec/changes/two/specs/example'), { recursive: true });
    await writeFile(join(root, 'openspec/specs/example/spec.md'), '### Requirement: BASE base\n');
    await writeFile(
      join(root, 'openspec/changes/one/specs/example/spec.md'),
      '## MODIFIED Requirements\n\n### Requirement: MISSING missing\n\n### Requirement: BASE one\n',
    );
    await writeFile(
      join(root, 'openspec/changes/two/specs/example/spec.md'),
      '## MODIFIED Requirements\n\n### Requirement: BASE two\n\n## REMOVED Requirements\n\n### Requirement: MISSING missing\n',
    );
    const result = await readEffectiveSpecs(root);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('MODIFIED Requirement MISSING does not exist'),
        expect.stringContaining('REMOVED Requirement MISSING does not exist'),
        expect.stringContaining('both touch Requirement BASE'),
      ]),
    );
  });

  it('reports duplicate main requirements, added collisions, and rename collisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'effective-specs-collisions-'));
    await mkdir(join(root, 'openspec/specs/example'), { recursive: true });
    await mkdir(join(root, 'openspec/changes/active/specs/example'), { recursive: true });
    await writeFile(
      join(root, 'openspec/specs/example/spec.md'),
      '### Requirement: BASE one\n\n### Requirement: BASE two\n\n### Requirement: TARGET target\n',
    );
    await writeFile(
      join(root, 'openspec/changes/active/specs/example/spec.md'),
      '## ADDED Requirements\n\n### Requirement: BASE replacement\n\n## RENAMED Requirements\n\n- FROM: BASE TO: TARGET\n',
    );
    const result = await readEffectiveSpecs(root);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate main Requirement BASE'),
        expect.stringContaining('ADDED Requirement BASE already exists'),
        expect.stringContaining('RENAMED target Requirement TARGET already exists'),
      ]),
    );
  });
});

/** 与 check-fixtures.test.ts 相同的 module 证据登记方式：每个 case 一段可核对断言。 */
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

function scopedRoot(changes: ReadonlyArray<string>) {
  const root = createControlledRoot({
    files: { 'scenario-gate.config.json': JSON.stringify({ ownerIdPattern: '^[A-Z][A-Z0-9-]+$' }) },
    prefix: 'spec-sources-scope-',
  });
  for (const change of changes) {
    const path = `${root.root}/openspec/changes/${change}/specs/sample/spec.md`;
    mkdirSync(`${root.root}/openspec/changes/${change}/specs/sample`, { recursive: true });
    writeFileSync(
      path,
      `## ADDED Requirements\n\n### Requirement: ${change} 需求\n\n#### Scenario: SCN-SAMPLE-${change}-001 场景\n\n- **WHEN** ${change}\n- **THEN** ok\n`,
    );
  }
  return root;
}

const idsOf = async (root: string, changes?: ReadonlyArray<string>) =>
  (await projectEffectiveSpecs(root, changes === undefined ? {} : { changes })).requirements.map(
    (item) => item.id,
  );

test('stops a Requirement block at the next higher-level heading', async () => {
  const root = createControlledRoot({ prefix: 'spec-sources-heading-' });
  try {
    mkdirSync(`${root.root}/openspec/specs/sample`, { recursive: true });
    writeFileSync(
      `${root.root}/openspec/specs/sample/spec.md`,
      '### Requirement: BASE one\n\nbody\n\n## Notes\n\n### Requirement: TRICK not-a-requirement\n',
    );
    const projection = await projectEffectiveSpecs(root.root);
    const base = projection.requirements.find((item) => item.id === 'BASE')!;
    expect(base.block).toBe('### Requirement: BASE one\n\nbody');
    expect(base.block).not.toContain('## Notes');
  } finally {
    root.cleanup();
  }
});

test('activeChangeNames ignores archive and tolerates a missing tree', async () => {
  const root = createControlledRoot({ prefix: 'spec-sources-active-' });
  const bare = createControlledRoot({ prefix: 'spec-sources-bare-' });
  try {
    for (const name of ['beta', 'alpha']) mkdirSync(`${root.root}/openspec/changes/${name}`);
    mkdirSync(`${root.root}/openspec/changes/archive/old`, { recursive: true });
    expect(await activeChangeNames(root.root)).toEqual(['alpha', 'beta']);
    mkdirSync(`${bare.root}/openspec/other`, { recursive: true });
    expect(await activeChangeNames(bare.root)).toEqual([]);
  } finally {
    root.cleanup();
    bare.cleanup();
  }
});

evidence(
  'SCN-SCENARIO-GATE-017',
  'change-scope-rules',
  ['default-all-active', 'scoped-merge', 'multi-value-forms', 'env-scope-fallback'],
  async (context, check) => {
    await check('default-all-active', async () => {
      const root = scopedRoot(['alpha', 'beta']);
      try {
        const ids = await idsOf(root.root);
        context.expect(ids).toEqual(['alpha', 'beta']);
      } finally {
        root.cleanup();
      }
    });

    await check('scoped-merge', async () => {
      const root = scopedRoot(['alpha', 'beta']);
      try {
        context.expect(await idsOf(root.root, ['alpha'])).toEqual(['alpha']);
        context.expect(await idsOf(root.root, ['alpha'])).not.toContain('beta');
        const resolution = resolveChangeScope({
          argv: ['node', 'script'],
          environment: {},
          activeChanges: ['alpha', 'beta'],
        });
        context.expect(resolution.scope).toEqual({});
        context.expect(resolution.issues).toEqual([]);
      } finally {
        root.cleanup();
      }
    });

    await check('multi-value-forms', () => {
      const repeated = parseChangeArguments([
        'node',
        'script',
        '--change',
        'alpha',
        '--change',
        'beta',
      ]);
      const comma = parseChangeArguments(['node', 'script', '--change', 'alpha,beta']);
      context.expect(repeated.names).toEqual(['alpha', 'beta']);
      context.expect(comma.names).toEqual(repeated.names);
      context.expect(comma.issues).toEqual([]);
      context.expect(repeated.specified).toBe(true);
    });

    await check('env-scope-fallback', () => {
      const fromEnv = resolveChangeScope({
        argv: ['node', 'script'],
        environment: { SCENARIO_GATE_CHANGES: 'alpha' },
        activeChanges: ['alpha', 'beta'],
      });
      context.expect(fromEnv.scope).toEqual({ changes: ['alpha'] });
      context.expect(fromEnv.issues).toEqual([]);
      const overridden = resolveChangeScope({
        argv: ['node', 'script', '--change', 'beta'],
        environment: { SCENARIO_GATE_CHANGES: 'alpha' },
        activeChanges: ['alpha', 'beta'],
      });
      context.expect(overridden.scope).toEqual({ changes: ['beta'] });
      const none = resolveChangeScope({
        argv: ['node', 'script'],
        environment: {},
        activeChanges: ['alpha'],
      });
      context.expect(none.scope).toEqual({});
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-018',
  'change-arg-rules',
  ['empty-value-rejected', 'unknown-change-rejected', 'no-fallback'],
  async (context, check) => {
    await check('empty-value-rejected', async () => {
      context.expect(parseChangeArguments(['node', 'script', '--change']).issues).not.toEqual([]);
      context
        .expect(parseChangeArguments(['node', 'script', '--change', '']).issues)
        .not.toEqual([]);
      context
        .expect(parseChangeArguments(['node', 'script', '--change', '--root']).issues)
        .not.toEqual([]);
      context
        .expect(parseChangeArguments(['node', 'script', '--change', ',']).issues)
        .not.toEqual([]);
      const emptyEnv = resolveChangeScope({
        argv: ['node', 'script'],
        environment: { SCENARIO_GATE_CHANGES: '  ' },
        activeChanges: ['alpha'],
      });
      context.expect(emptyEnv.issues.join('\n')).toContain('SCENARIO_GATE_CHANGES');
      context.expect(emptyEnv.issues.join('\n')).toContain('空值');
    });

    await check('unknown-change-rejected', async () => {
      const fromFlag = resolveChangeScope({
        argv: ['node', 'script', '--change', 'missing'],
        environment: {},
        activeChanges: ['alpha'],
      });
      context.expect(fromFlag.issues.join('\n')).toContain('--change missing');
      const fromEnv = resolveChangeScope({
        argv: ['node', 'script'],
        environment: { SCENARIO_GATE_CHANGES: 'missing' },
        activeChanges: ['alpha'],
      });
      context.expect(fromEnv.issues.join('\n')).toContain('SCENARIO_GATE_CHANGES missing');
      const root = scopedRoot(['alpha']);
      try {
        const cli = await runFixturesCli(['node', 'script', '--change', 'missing'], root.root, {});
        context.expect(cli.exitCode).toBe(1);
      } finally {
        root.cleanup();
      }
    });

    await check('no-fallback', async () => {
      const root = scopedRoot(['alpha']);
      try {
        const badFlag = await runFixturesCli(['node', 'script', '--change'], root.root, {});
        context.expect(badFlag.exitCode).toBe(1);
        context.expect(badFlag).not.toHaveProperty('manifests');
        context.expect(badFlag.issues).not.toEqual([]);
        const badEnv = await runFixturesCli(['node', 'script'], root.root, {
          SCENARIO_GATE_CHANGES: 'missing',
        });
        context.expect(badEnv.exitCode).toBe(1);
        context.expect(badEnv.issues.join('\n')).toContain('SCENARIO_GATE_CHANGES');
      } finally {
        root.cleanup();
      }
    });
  },
);
