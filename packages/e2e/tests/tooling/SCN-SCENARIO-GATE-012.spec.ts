import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import {
  baseSpecText,
  controlledFixtureRoot,
  ownerDigest,
  runFixtureCli,
  writeOwnerFixture,
} from './fixture-gate-helpers.ts';

cliEvidence(
  'SCN-SCENARIO-GATE-012',
  'fixture-source-cli',
  ['owner-from-directory', 'digest-normalized', 'stale-with-refresh-hint'],
  async (context, check) => {
    await check('owner-from-directory', async () => {
      const gate = controlledFixtureRoot();
      try {
        writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
          requirementDigest: await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001'),
        });
        writeOwnerFixture(gate, 'FLOW-SAMPLE-FLOW-001', {
          requirementDigest: await ownerDigest(gate.root, 'FLOW-SAMPLE-FLOW-001'),
        });
        const result = runFixtureCli(gate);
        context.expect(result.status).toBe(0);
        context.expect(result.output.manifests).toBe(2);
        context.expect(result.output.issues).toEqual([]);
      } finally {
        gate.cleanup();
      }
    });

    await check('digest-normalized', async () => {
      const gate = controlledFixtureRoot();
      try {
        writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
          requirementDigest: await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001'),
        });
        // 只改换行风格、行尾空白与空行：规范化后摘要不变，检查仍通过。
        writeFileSync(
          gate.specPath,
          baseSpecText
            .replace(/\n/g, '\r\n')
            .replace('- **THEN** 返回订单号', '- **THEN** 返回订单号   \r\n\r\n'),
        );
        const result = runFixtureCli(gate);
        context.expect(result.status).toBe(0);
        context.expect(result.output.issues).toEqual([]);
      } finally {
        gate.cleanup();
      }
    });

    await check('stale-with-refresh-hint', async () => {
      const gate = controlledFixtureRoot();
      try {
        writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
          requirementDigest: await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001'),
        });
        writeFileSync(gate.specPath, baseSpecText.replace('返回订单号', '返回订单号与支付链接'));
        const result = runFixtureCli(gate);
        context.expect(result.status).toBe(1);
        context.expect(result.output.issues.join('\n')).toContain('来源摘要过期');
        context
          .expect(result.output.issues.join('\n'))
          .toContain('pnpm fixtures:refresh SCN-SAMPLE-CONTRACT-001');
      } finally {
        gate.cleanup();
      }
    });
  },
);

cliEvidence(
  'SCN-SCENARIO-GATE-012',
  'fixture-missing-owner-cli',
  ['missing-owner-rejected', 'path-field-rejected'],
  async (context, check) => {
    await check('missing-owner-rejected', async () => {
      const gate = controlledFixtureRoot();
      try {
        writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
          requirementDigest: await ownerDigest(gate.root, 'SCN-SAMPLE-CONTRACT-001'),
        });
        // 主 Spec 删除该 Scenario，但归档目录仍保留含它的旧 Spec：不得放行。
        writeFileSync(
          gate.specPath,
          baseSpecText.replace(
            '#### Scenario: SCN-SAMPLE-CONTRACT-001 创建交易\n\n- **WHEN** 调用创建交易\n- **THEN** 返回订单号\n\n',
            '',
          ),
        );
        const archived = join(
          gate.root,
          'openspec/changes/archive/2026-01-01-old/specs/sample/spec.md',
        );
        mkdirSync(join(archived, '..'), { recursive: true });
        writeFileSync(archived, baseSpecText);
        const result = runFixtureCli(gate);
        context.expect(result.status).toBe(1);
        context.expect(result.output.issues.join('\n')).toContain('在有效 Spec 中不存在');
      } finally {
        gate.cleanup();
      }
    });

    await check('path-field-rejected', async () => {
      const gate = controlledFixtureRoot();
      try {
        writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-001', {
          legacyPath: 'openspec/specs/sample/spec.md',
        });
        const withPath = runFixtureCli(gate);
        context.expect(withPath.status).toBe(1);
        context.expect(withPath.output.issues.join('\n')).toContain('manifest schema');
        writeOwnerFixture(gate, 'SCN-SAMPLE-CONTRACT-002', { omitDigest: true });
        const withoutDigest = runFixtureCli(gate);
        context.expect(withoutDigest.status).toBe(1);
        context.expect(withoutDigest.output.issues.join('\n')).toContain('manifest schema');
      } finally {
        gate.cleanup();
      }
    });
  },
);
