import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  controlledFixtureRoot,
  manifestText,
  ownerDigest,
  runFixtureCli,
  runOpenspec,
  writeOwnerFixture,
} from './fixture-gate-helpers.ts';

const delta = [
  '## MODIFIED Requirements',
  '',
  '### Requirement: BASE-01 交易示例',
  '',
  '系统 SHALL 提供交易示例，并支持归档。',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易',
  '',
  '- **WHEN** 调用创建交易',
  '- **THEN** 返回订单号',
  '',
  '## ADDED Requirements',
  '',
  '### Requirement: BASE-03 归档示例',
  '',
  '系统 SHALL 提供归档示例。',
  '',
  '#### Scenario: SCN-SAMPLE-CONTRACT-003 归档',
  '',
  '- **WHEN** 归档',
  '- **THEN** 完成',
  '',
].join('\n');

cliEvidence(
  'SCN-SCENARIO-GATE-015',
  'archive-digest-stability',
  ['modified-digest-stable', 'added-digest-stable', 'archive-no-fixture-edit'],
  async (context, check) => {
    const gate = controlledFixtureRoot({ openspec: 'real', changes: { 'zz-archive': delta } });
    try {
      const modifiedDigest = await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001', [
        'zz-archive',
      ]);
      const addedDigest = await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-003', ['zz-archive']);
      const modifiedDirectory = writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
        requirementDigest: modifiedDigest,
      });
      const addedDirectory = writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-003', {
        requirementDigest: addedDigest,
      });
      const before = runFixtureCli(gate, ['--change', 'zz-archive']);
      context.expect(before.status).toBe(0);
      context.expect(before.output.issues).toEqual([]);
      const manifestsBefore = manifestText(modifiedDirectory) + manifestText(addedDirectory);

      const archived = runOpenspec(gate, ['archive', 'zz-archive', '-y']);
      context.expect(archived.status).toBe(0);

      await check('modified-digest-stable', async () => {
        context
          .expect(await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001'))
          .toBe(modifiedDigest);
      });
      await check('added-digest-stable', async () => {
        context.expect(await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-003')).toBe(addedDigest);
      });
      await check('archive-no-fixture-edit', () => {
        context
          .expect(manifestText(modifiedDirectory) + manifestText(addedDirectory))
          .toBe(manifestsBefore);
        const after = runFixtureCli(gate);
        context.expect(after.status).toBe(0);
        context.expect(after.output.issues).toEqual([]);
      });
    } finally {
      gate.cleanup();
    }
  },
);
