import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cliEvidence,
  fixtureRoot,
  runArchitecture,
  writeProjectManifest,
  writeRepositoryPackages,
} from './scenario-gate-helpers.ts';
import { repositoryRoot, writeProjectMapFixture, writeTemplateGuideFixture } from './helpers.ts';

cliEvidence(
  'SCN-SCENARIO-GATE-008',
  'schema-documentation-cli',
  ['schema-descriptions', 'agents-references-schemas', 'restored-passes'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      mkdirSync(join(fixture.root, 'packages'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'package.json'),
        readFileSync(join(repositoryRoot, 'package.json')),
      );
      writeProjectManifest(fixture.root);
      writeFileSync(join(fixture.root, 'AGENTS.md'), 'scenario-gate.config.schema.json');
      writeTemplateGuideFixture(fixture.root);
      writeRepositoryPackages(fixture.root);
      mkdirSync(join(fixture.root, 'scripts'), { recursive: true });
      for (const path of [
        'scenario-gate.config.schema.json',
        'scripts/verification.schema.json',
        'scripts/flow.schema.json',
      ]) {
        writeFileSync(
          join(fixture.root, path),
          JSON.stringify({ properties: { missing: { type: 'string' } } }),
        );
      }
      const bad = runArchitecture(fixture.root);
      await check('schema-descriptions', () =>
        context
          .expect(bad.output?.issues.join('\n'))
          .toContain('missing a non-empty Chinese description'),
      );
      await check('agents-references-schemas', () =>
        context
          .expect(bad.output?.issues.join('\n'))
          .toContain('AGENTS.md does not reference scripts/flow.schema.json'),
      );
      writeFileSync(
        join(fixture.root, 'scenario-gate.config.schema.json'),
        JSON.stringify({ properties: { missing: { type: 'string', description: '字段说明' } } }),
      );
      writeFileSync(
        join(fixture.root, 'scripts/verification.schema.json'),
        JSON.stringify({ properties: { missing: { type: 'string', description: '字段说明' } } }),
      );
      writeFileSync(
        join(fixture.root, 'scripts/flow.schema.json'),
        JSON.stringify({ properties: { missing: { type: 'string', description: '字段说明' } } }),
      );
      writeFileSync(
        join(fixture.root, 'AGENTS.md'),
        'scenario-gate.config.schema.json scripts/verification.schema.json scripts/flow.schema.json',
      );
      writeTemplateGuideFixture(fixture.root);
      writeProjectMapFixture(fixture.root);
      const restored = runArchitecture(fixture.root);
      await check('restored-passes', () => {
        context.expect(restored.status).toBe(0);
        context.expect(restored.output?.issues).toEqual([]);
      });
    } finally {
      fixture.cleanup();
    }
  },
);
