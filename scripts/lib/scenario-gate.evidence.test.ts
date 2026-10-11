import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { createControlledRoot } from '../../packages/e2e/tests/tooling/controlled-root.ts';
import { baseCoverage } from '../../packages/e2e/tests/tooling/helpers.ts';
import { evaluateCoverage, runScenarioPrechecks, runScenariosCli } from '../check-scenarios.ts';
import { loadProjectManifest } from './project-manifest.ts';
import { readEffectiveSpecs } from './spec-sources.ts';
import { readSpecInventory } from './spec-inventory.ts';
import { loadScenarioConfig, matchesAny } from './scenario-config.ts';
import { checkSchemaDocumentation } from './schema-docs.ts';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const genericScenarioPattern = '^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$';
const legacyScenarioPattern = '^LEGACY-[A-Z0-9]+-[0-9]{3}$';
const genericFlowPattern = '^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$';
const legacyFlowPattern = '^LEGACY-FLOW-[A-Z0-9]+-[0-9]{3}$';
const config = {
  scenarioIdPatterns: [genericScenarioPattern, legacyScenarioPattern],
  flowIdPatterns: [genericFlowPattern, legacyFlowPattern],
  ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
};
const metadata =
  '{"formatVersion":2,"checkpoints":{"done":"完成"},"cases":[{"key":"ok","kind":"behavior","requiredIn":["integration"],"checks":["done"]}],"blockedBy":[]}';
const block = `\n\`\`\`json verification\n${metadata}\n\`\`\``;
const flowHeader =
  '| FLOW ID | Related | Stages | Cases | Environments | Notes |\n| --- | --- | --- | --- | --- | --- |\n';

/** 仓库清单是模板自身的契约输入（不是 Spec/Change/Fixture 实时状态），受控根沿用同一清单。 */
const repositoryManifest = JSON.parse(
  readFileSync(new URL('../../project.manifest.json', import.meta.url), 'utf8'),
) as unknown;

async function temporaryRoot(name: string, body: (root: string) => Promise<void>) {
  const controlled = createControlledRoot({
    manifest: repositoryManifest,
    prefix: `scenario-gate-${name}-`,
  });
  const root = controlled.root;
  try {
    await body(root);
  } finally {
    controlled.cleanup();
  }
}

function evidence(
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

evidence(
  'SCN-SCENARIO-GATE-001',
  'precheck-rules',
  [
    'precheck-before-coverage',
    'missing-specs-dir',
    'missing-cli',
    'restored-passes',
    'input-mode-pure',
  ],
  async (context, check) => {
    await temporaryRoot('precheck', async (root) => {
      // 受控根本身带最小 OpenSpec 结构；这里先移除 specs 目录以构造"缺失"反例。
      await rm(join(root, 'openspec/specs'), { recursive: true, force: true });
      const unavailable = () => ({ status: 1 });
      const missing = await runScenarioPrechecks(root, unavailable);
      await check('missing-specs-dir', () =>
        context.expect(missing.issues.join('\n')).toContain('openspec/specs directory is missing'),
      );
      await check('missing-cli', () =>
        context.expect(missing.issues.join('\n')).toContain('openspec CLI cannot be invoked'),
      );
      await check('precheck-before-coverage', () =>
        context.expect(missing.inventory).toBeUndefined(),
      );
      await mkdir(join(root, 'openspec/specs'), { recursive: true });
      const restored = await runScenarioPrechecks(root, () => ({ status: 0 }));
      await check('restored-passes', () => context.expect(restored.issues).toEqual([]));
      const input = join(root, 'input.json');
      await writeFile(
        input,
        JSON.stringify({
          current: {
            runId: 'r',
            sourceDigest: 's',
            specDigest: 's',
            protocolDigest: 'i',
            fixtureDigest: 'f',
          },
          scenarios: [],
          contracts: [],
          flows: [],
          bindings: [],
          reports: [],
        }),
      );
      const pure = await runScenariosCli(['--input', input], root, {}, () => {
        throw new Error('CLI must not run');
      });
      await check('input-mode-pure', () =>
        context.expect(pure).toMatchObject({ exitCode: 0, output: { issues: [] } }),
      );
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-002',
  'id-rules',
  [
    'missing-id-rejected',
    'pattern-mismatch-rejected',
    'duplicate-rejected',
    'stays-in-denominator',
  ],
  async (context, check) => {
    const sources = [
      {
        path: 'first',
        kind: 'main' as const,
        content: `### Requirement: ONE\n#### Scenario: Missing\n${block}\n#### Scenario: OTHER-001 Invalid\n${block}\n#### Scenario: SCN-OK-001 First\n${block}`,
      },
      {
        path: 'second',
        kind: 'main' as const,
        content: `### Requirement: TWO\n#### Scenario: SCN-OK-001 Duplicate\n${block}`,
      },
    ];
    const result = await readSpecInventory(sources, {
      ...config,
      scenarioIdPatterns: ['^SCN-OK-\\d+$'],
    });
    await check('missing-id-rejected', () =>
      context
        .expect(result.issues.join('\n'))
        .toContain('Scenario heading Scenario: Missing is malformed'),
    );
    await check('pattern-mismatch-rejected', () =>
      context.expect(result.issues.join('\n')).toContain('Scenario ID OTHER-001 does not match'),
    );
    await check('duplicate-rejected', () =>
      context.expect(result.issues).toContain('duplicate Scenario ID SCN-OK-001'),
    );
    await check('stays-in-denominator', () => context.expect(result.scenarios).toHaveLength(4));
  },
);

evidence(
  'SCN-SCENARIO-GATE-003',
  'lifecycle-merge',
  ['main-specs-baseline', 'delta-merge', 'archive-ignored', 'no-hardcoded-path'],
  async (context, check) => {
    await temporaryRoot('merge', async (root) => {
      await mkdir(join(root, 'openspec/specs/sample'), { recursive: true });
      await mkdir(join(root, 'openspec/changes/active/specs/sample'), { recursive: true });
      await mkdir(join(root, 'openspec/changes/archive/old/specs/sample'), { recursive: true });
      await writeFile(
        join(root, 'openspec/specs/sample/spec.md'),
        '### Requirement: BASE baseline\n#### Scenario: SCN-SAMPLE-001 Old\n\n### Requirement: REMOVE gone\n#### Scenario: SCN-SAMPLE-002 Gone\n',
      );
      const baseline = await readEffectiveSpecs(root);
      await check('main-specs-baseline', () =>
        context
          .expect(baseline.documents.map((item) => item.path))
          .toEqual(
            context.expect.arrayContaining([
              context.expect.stringContaining('openspec/specs/sample/spec.md'),
            ]),
          ),
      );
      await writeFile(
        join(root, 'openspec/changes/active/specs/sample/spec.md'),
        '## ADDED Requirements\n### Requirement: ADD new\n#### Scenario: SCN-SAMPLE-003 New\n\n## MODIFIED Requirements\n### Requirement: BASE changed\n#### Scenario: SCN-SAMPLE-004 Changed\n\n## REMOVED Requirements\n### Requirement: REMOVE gone\n',
      );
      await writeFile(
        join(root, 'openspec/changes/archive/old/specs/sample/spec.md'),
        '### Requirement: ARCHIVE ignored\n#### Scenario: SCN-SAMPLE-999 Ignored\n',
      );
      const result = await readEffectiveSpecs(root);
      const joined = result.documents.map((item) => item.content).join('\n');
      await check('delta-merge', () => {
        context.expect(joined).toContain('SCN-SAMPLE-003');
        context.expect(joined).toContain('SCN-SAMPLE-004');
        context.expect(joined).not.toContain('SCN-SAMPLE-002');
      });
      await check('archive-ignored', () => context.expect(joined).not.toContain('SCN-SAMPLE-999'));
      await check('no-hardcoded-path', () =>
        context.expect(result.documents.some((item) => item.path.includes('/active/'))).toBe(true),
      );
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-007',
  'flow-placement-rules',
  [
    'outside-table-rejected',
    'inside-table-accepted',
    'flow-row-schema',
    'related-scenarios-registered',
  ],
  async (context, check) => {
    const outside = await readSpecInventory(
      [
        {
          path: 'outside',
          kind: 'main',
          content: `${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | integration | outside |`,
        },
      ],
      config,
    );
    await check('outside-table-rejected', () =>
      context.expect(outside.issues.join('\n')).toContain('would be lost during archive'),
    );
    const inside = await readSpecInventory(
      [
        {
          path: 'inside',
          kind: 'main',
          content: `### Requirement: TEST flow\n#### Scenario: SCN-TEST-001 Example\n${block}\n${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | integration | inside |`,
        },
      ],
      config,
    );
    await check('inside-table-accepted', () =>
      context.expect(inside.flows.map((item) => item.id)).toEqual(['FLOW-TEST-001']),
    );
    const invalid = await readSpecInventory(
      [
        {
          path: 'invalid',
          kind: 'main',
          content: `### Requirement: TEST flow\n${flowHeader}| FLOW-TEST-001 | SCN-TEST-001 | create → observe | normal | sdk-unit | invalid |`,
        },
      ],
      config,
    );
    await check('flow-row-schema', () =>
      context.expect(invalid.issues.join('\n')).toContain('invalid FLOW row'),
    );
    const unregistered = await readSpecInventory(
      [
        {
          path: 'unregistered',
          kind: 'main',
          content: `### Requirement: TEST flow\n#### Scenario: SCN-TEST-001 Example\n${block}\n${flowHeader}| FLOW-TEST-001 | SCN-TEST-001、SCN-TEST-999 | create → observe | normal | integration | unregistered |`,
        },
      ],
      config,
    );
    await check('related-scenarios-registered', () =>
      context.expect(unregistered.issues.join('\n')).toContain('SCN-TEST-999'),
    );
  },
);

evidence(
  'SCN-SCENARIO-GATE-004',
  'unknown-reference-rules',
  ['unknown-flow-reference', 'unknown-scenario-reference'],
  async (context, check) => {
    const input = {
      current: {
        runId: 'r',
        sourceDigest: 's',
        specDigest: 's',
        protocolDigest: 'i',
        fixtureDigest: 'f',
      },
      scenarios: [],
      contracts: [],
      flows: [],
      bindings: [
        {
          ownerId: 'SCN-TEST-001',
          caseId: 'unknown',
          fixtureCase: 'unknown',
          environment: 'integration' as const,
          covers: [{ id: 'SCN-TEST-999', caseKey: 'unknown', checks: ['done'] }],
          flowId: 'FLOW-TEST-999',
          flowCase: 'unknown',
        },
      ],
      reports: [],
    };
    const result = evaluateCoverage(input);
    await check('unknown-flow-reference', () =>
      context.expect(result.issues.join('\n')).toContain('unknown FLOW reference FLOW-TEST-999'),
    );
    await check('unknown-scenario-reference', () =>
      context.expect(result.issues.join('\n')).toContain('unknown cover SCN-TEST-999/unknown'),
    );
  },
);

evidence(
  'SCN-SCENARIO-GATE-011',
  'pattern-config',
  ['single-config', 'multi-pattern', 'removed-pattern-reported'],
  async (context, check) => {
    await temporaryRoot('pattern-config', async (root) => {
      await writeFile(
        join(root, 'scenario-gate.config.json'),
        JSON.stringify({
          scenarioIdPatterns: [genericScenarioPattern, legacyScenarioPattern],
          flowIdPatterns: [genericFlowPattern, legacyFlowPattern],
          ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
        }),
      );
      const loaded = await loadScenarioConfig(root);
      await check('single-config', () =>
        context
          .expect(loaded.scenarioIdPatterns)
          .toEqual([genericScenarioPattern, legacyScenarioPattern]),
      );
      await check('multi-pattern', () => {
        context.expect(matchesAny('LEGACY-SAMPLE-001', loaded.scenarioIdPatterns)).toBe(true);
        context.expect(matchesAny('SCN-SCENARIO-GATE-001', loaded.scenarioIdPatterns)).toBe(true);
      });
      const removed = await readSpecInventory(
        [
          {
            path: 'removed',
            kind: 'main',
            content: `### Requirement: TEST rule\n#### Scenario: SCN-TEST-001 Example\n${block}`,
          },
        ],
        { ...loaded, scenarioIdPatterns: [legacyScenarioPattern] },
      );
      await check('removed-pattern-reported', () =>
        context
          .expect(removed.issues.join('\n'))
          .toContain('Scenario ID SCN-TEST-001 does not match'),
      );
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-006',
  'metadata-rules',
  ['missing-block-rejected', 'multiple-blocks-rejected', 'schema-enforced', 'stays-in-denominator'],
  async (context, check) => {
    const invalidProject = JSON.stringify({
      formatVersion: 2,
      checkpoints: { done: '完成' },
      cases: [
        { key: 'ok', kind: 'behavior', requiredIn: ['unregistered-project'], checks: ['done'] },
      ],
      blockedBy: [],
    });
    const wrongKind = JSON.stringify({
      formatVersion: 2,
      checkpoints: { done: '完成' },
      cases: [{ key: 'ok', kind: 'module', requiredIn: ['integration'], checks: ['done'] }],
      blockedBy: [],
    });
    const content = `### Requirement: TEST metadata\n#### Scenario: SCN-TEST-001 Missing\n\n#### Scenario: SCN-TEST-002 Multiple\n${block}\n${block}\n#### Scenario: SCN-TEST-003 Invalid\n\`\`\`json verification\n{}\n\`\`\`\n#### Scenario: SCN-TEST-004 Unregistered\n\`\`\`json verification\n${invalidProject}\n\`\`\`\n#### Scenario: SCN-TEST-005 WrongKind\n\`\`\`json verification\n${wrongKind}\n\`\`\``;
    const result = await readSpecInventory([{ path: 'metadata', kind: 'main', content }], config);
    await check('missing-block-rejected', () =>
      context
        .expect(result.issues.join('\n'))
        .toContain('SCN-TEST-001: verification metadata missing'),
    );
    await check('multiple-blocks-rejected', () =>
      context
        .expect(result.issues.join('\n'))
        .toContain('SCN-TEST-002: multiple verification metadata blocks'),
    );
    await check('schema-enforced', () => {
      context
        .expect(result.issues.join('\n'))
        .toContain('SCN-TEST-003: invalid verification metadata');
      context
        .expect(result.issues.join('\n'))
        .toContain(
          'SCN-TEST-004: invalid verification metadata: requiredIn project unregistered-project is not registered in project.manifest.json',
        );
      context
        .expect(result.issues.join('\n'))
        .toContain(
          'SCN-TEST-005: invalid verification metadata: kind module cannot run in integration project integration',
        );
    });
    await check('stays-in-denominator', () => context.expect(result.scenarios).toHaveLength(5));
  },
);

evidence(
  'SCN-SCENARIO-GATE-008',
  'schema-description-rules',
  ['schema-descriptions', 'agents-references-schemas'],
  async (context, check) => {
    await temporaryRoot('docs', async (root) => {
      await mkdir(join(root, 'scripts'), { recursive: true });
      for (const path of [
        'scenario-gate.config.schema.json',
        'scripts/verification.schema.json',
        'scripts/flow.schema.json',
      ]) {
        await writeFile(
          join(root, path),
          JSON.stringify({ properties: { missing: { type: 'string' } } }),
        );
      }
      await writeFile(join(root, 'AGENTS.md'), 'scenario-gate.config.schema.json');
      const invalid = checkSchemaDocumentation(root);
      await check('schema-descriptions', () =>
        context.expect(invalid.join('\n')).toContain('property missing is missing'),
      );
      await check('agents-references-schemas', () =>
        context
          .expect(invalid.join('\n'))
          .toContain('AGENTS.md does not reference scripts/flow.schema.json'),
      );
    });
  },
);

evidence(
  'SCN-SCENARIO-GATE-026',
  'self-test-isolation-rules',
  ['controlled-temp-root', 'flow-branch-self-provided', 'pinned-openspec-cli'],
  async (context, check) => {
    await check('controlled-temp-root', () => {
      const root = createControlledRoot({ prefix: 'gate-026-rules-' });
      try {
        const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
          cwd: root.root,
          encoding: 'utf8',
        });
        context.expect(inside.stdout.trim()).toBe('true');
        const head = spawnSync('git', ['log', '-1', '--format=%s'], {
          cwd: root.root,
          encoding: 'utf8',
        });
        context.expect(head.stdout.trim()).toBe('fixture: initial state');
        context.expect(existsSync(join(root.root, 'openspec/specs'))).toBe(true);
        context.expect(existsSync(join(root.root, 'openspec/changes'))).toBe(true);
        context.expect(loadProjectManifest(root.root).packages.length).toBeGreaterThan(0);
      } finally {
        root.cleanup();
      }
    });

    await check('flow-branch-self-provided', () => {
      context.expect(evaluateCoverage(baseCoverage()).issues).toEqual([]);
      const withoutFlow = {
        ...baseCoverage(),
        bindings: baseCoverage().bindings.map((binding) => {
          const clone = { ...binding };
          delete (clone as { flowId?: unknown }).flowId;
          delete (clone as { flowCase?: unknown }).flowCase;
          return clone;
        }),
      };
      context
        .expect(evaluateCoverage(withoutFlow).issues)
        .toEqual(
          context.expect.arrayContaining([context.expect.stringContaining('missing FLOW binding')]),
        );
    });

    await check('pinned-openspec-cli', () => {
      const stub = createControlledRoot({ prefix: 'gate-026-stub-' });
      try {
        const version = spawnSync('openspec', ['--version'], {
          env: stub.env,
          encoding: 'utf8',
        });
        context.expect(version.stdout.trim()).toBe('0.0.0-test');
      } finally {
        stub.cleanup();
      }
      const real = createControlledRoot({ openspec: 'real', prefix: 'gate-026-real-' });
      try {
        const declared = (
          JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
            devDependencies?: Record<string, string>;
          }
        ).devDependencies?.['@fission-ai/openspec'];
        context
          .expect(real.env.PATH?.split(':')[0])
          .toBe(resolve(repositoryRoot, 'node_modules/.bin'));
        const version = spawnSync('openspec', ['--version'], {
          env: real.env,
          encoding: 'utf8',
        });
        context.expect(version.stdout.trim()).toBe(declared);
      } finally {
        real.cleanup();
      }
    });
  },
);
