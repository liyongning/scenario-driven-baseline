import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  createControlledRoot,
  type ControlledRoot,
} from '../packages/e2e/tests/tooling/controlled-root.ts';
import { checkFixtures } from './check-fixtures.ts';
import { requirementDigest } from './lib/spec-sources.ts';

const roots: ControlledRoot[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) root.cleanup();
});

const spec = [
  '### Requirement: BASE-01 协议来源',
  '',
  'Fixture SHALL 绑定已登记协议。',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-001 来源',
  '',
  '- **WHEN** 读取 Fixture',
  '- **THEN** 校验来源',
].join('\n');

function root() {
  const fixture = createControlledRoot({
    files: {
      'scenario-gate.config.json': JSON.stringify({
        scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
        flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
        ownerIdPattern: '^SCN-[A-Z0-9-]+$',
      }),
      'openspec/specs/sample/spec.md': spec,
    },
    prefix: 'fixture-protocol-',
  });
  roots.push(fixture);
  return fixture;
}

function fixtureRoot(fixture: ControlledRoot) {
  return join(fixture.root, 'packages/e2e/tests/fixtures');
}

test('ignores preview datasets and reports unregistered Fixture protocols', async () => {
  const fixture = root();
  const datasets = join(fixtureRoot(fixture), '_datasets');
  mkdirSync(datasets, { recursive: true });
  writeFileSync(join(datasets, 'preview.json'), '{"kind":"dataset"}');
  const ignored = await checkFixtures({
    fixtureRoot: fixtureRoot(fixture),
    repositoryRoot: fixture.root,
  });
  expect(ignored.issues).toEqual([]);

  const owner = 'SCN-SAMPLE-CONTRACT-001';
  const directory = join(fixtureRoot(fixture), owner);
  mkdirSync(directory, { recursive: true });
  const content = '{"request":"fixture"}';
  writeFileSync(join(directory, 'case.json'), content);
  writeFileSync(
    join(directory, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      ownerId: owner,
      protocol: 'missing-protocol',
      sources: { spec: { requirementDigest: requirementDigest(spec) } },
      cases: { case: 'case.json' },
      sha256: { 'case.json': createHash('sha256').update(content).digest('hex') },
    }),
  );
  const checked = await checkFixtures({
    fixtureRoot: fixtureRoot(fixture),
    repositoryRoot: fixture.root,
  });
  expect(checked.issues.join('\n')).toContain(
    'protocol missing-protocol is not a registered protocol package',
  );
});
