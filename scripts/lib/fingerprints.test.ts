import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createControlledRoot,
  minimalManifest,
} from '../../packages/e2e/tests/tooling/controlled-root.ts';
import { evaluateCoverage } from '../check-scenarios.ts';
import { buildVerificationFingerprints, collectFiles, digestFiles } from './fingerprints.ts';

describe('verification fingerprints', () => {
  it('is stable across input order and changes when a relative path or content changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'template-fingerprint-'));
    writeFileSync(join(root, 'a'), 'one');
    writeFileSync(join(root, 'b'), 'two');
    expect(digestFiles(root, [join(root, 'a'), join(root, 'b')])).toBe(
      digestFiles(root, [join(root, 'b'), join(root, 'a')]),
    );
    const before = digestFiles(root, [join(root, 'a')]);
    writeFileSync(join(root, 'a'), 'changed');
    expect(digestFiles(root, [join(root, 'a')])).not.toBe(before);
    writeFileSync(join(root, 'c'), 'changed');
    expect(digestFiles(root, [join(root, 'c')])).not.toBe(digestFiles(root, [join(root, 'a')]));
  });

  it('derives source, Spec, protocol, and Fixture digests from git-visible inputs', () => {
    const fixture = createControlledRoot({
      manifest: {
        ...minimalManifest(),
        fingerprints: {
          sourceRoots: ['sample-src'],
          buildInputs: ['build.config.ts', 'sample-src/*'],
          protocolInputs: ['proto-gen.lock'],
        },
      },
      files: {
        'sample-src/index.ts': 'code',
        'sample-src/index.test.ts': 'test',
        'sample-src/data.json': 'asset',
        'sample-src/generated/api.ts': 'generated',
        'sample-src/AGENTS.md': 'docs',
        'build.config.ts': 'build',
        'proto-gen.lock': 'idl',
        'openspec/specs/sample/spec.md': 'active spec',
        'openspec/changes/current/specs/sample/spec.md': 'delta spec',
        'packages/e2e/tests/fixtures/base.json': '{}',
      },
    });
    try {
      const fingerprints = buildVerificationFingerprints(fixture.root);
      expect(Object.values(fingerprints).filter((value) => typeof value === 'string')).toHaveLength(
        4,
      );
      expect(
        [
          fingerprints.sourceDigest,
          fingerprints.specDigest,
          fingerprints.protocolDigest,
          fingerprints.fixtureDigest,
        ].every((value) => /^[a-f0-9]{64}$/.test(value)),
      ).toBe(true);
      expect(Object.keys(fingerprints.files)).toContain('sample-src/index.ts');
      expect(Object.keys(fingerprints.files)).not.toContain('sample-src/generated/api.ts');

      const sourceBefore = fingerprints.sourceDigest;
      const specBefore = fingerprints.specDigest;
      const protocolBefore = fingerprints.protocolDigest;
      const fixtureBefore = fingerprints.fixtureDigest;

      // 任一类源码文件变化都会改变 sourceDigest。
      for (const [path, content] of [
        ['sample-src/data.json', '{"changed":true}'],
        ['sample-src/index.test.ts', 'changed test'],
      ] as const) {
        writeFileSync(join(fixture.root, path), content);
        expect(buildVerificationFingerprints(fixture.root).sourceDigest, path).not.toBe(
          sourceBefore,
        );
      }
      // 尚未 git add 的新文件也计入。
      writeFileSync(join(fixture.root, 'sample-src/new.ts'), 'new');
      expect(buildVerificationFingerprints(fixture.root).sourceDigest).not.toBe(sourceBefore);

      // 只改 AGENTS.md 或被忽略的文件不改变摘要。
      const afterNew = buildVerificationFingerprints(fixture.root).sourceDigest;
      writeFileSync(join(fixture.root, 'sample-src/AGENTS.md'), 'changed docs');
      writeFileSync(join(fixture.root, '.gitignore'), 'sample-src/ignored.ts\n');
      writeFileSync(join(fixture.root, 'sample-src/ignored.ts'), 'ignored');
      expect(buildVerificationFingerprints(fixture.root).sourceDigest).toBe(afterNew);

      // buildInputs 与 protocolInputs 分别驱动两类摘要。
      writeFileSync(join(fixture.root, 'build.config.ts'), 'changed build');
      const changedBuild = buildVerificationFingerprints(fixture.root);
      expect(changedBuild.sourceDigest).not.toBe(afterNew);
      expect(changedBuild.protocolDigest).toBe(protocolBefore);
      writeFileSync(join(fixture.root, 'proto-gen.lock'), 'changed idl');
      expect(buildVerificationFingerprints(fixture.root).protocolDigest).not.toBe(protocolBefore);
      expect(buildVerificationFingerprints(fixture.root).sourceDigest).toBe(
        changedBuild.sourceDigest,
      );

      // Spec 摘要只看有效 Spec 的 spec.md，Fixture 摘要只看 Fixture JSON。
      writeFileSync(join(fixture.root, 'openspec/changes/current/verify.md'), 'verification');
      expect(buildVerificationFingerprints(fixture.root).specDigest).toBe(specBefore);
      writeFileSync(
        join(fixture.root, 'openspec/changes/current/specs/sample/spec.md'),
        'changed delta spec',
      );
      expect(buildVerificationFingerprints(fixture.root).specDigest).not.toBe(specBefore);
      expect(buildVerificationFingerprints(fixture.root).fixtureDigest).toBe(fixtureBefore);
      writeFileSync(join(fixture.root, 'packages/e2e/tests/fixtures/base.json'), '{"changed":1}');
      expect(buildVerificationFingerprints(fixture.root).fixtureDigest).not.toBe(fixtureBefore);

      // 报告里的 protocolDigest 与当前不一致时用例被判过期。
      const binding = {
        ownerId: 'TC-HOST',
        caseId: 'host-case',
        fixtureCase: 'host-case',
        environment: 'weapp' as const,
        covers: [{ id: 'TC-HOST', caseKey: 'host-case', checks: ['host-loaded'] }],
      };
      const current = buildVerificationFingerprints(fixture.root);
      const result = evaluateCoverage({
        current: { runId: 'run-1', ...current },
        scenarios: [
          {
            id: 'TC-HOST',
            cases: [
              {
                key: 'host-case',
                kind: 'behavior' as const,
                requiredIn: ['weapp' as const],
                checks: ['host-loaded'],
              },
            ],
          },
        ],
        contracts: [],
        flows: [],
        bindings: [binding],
        sourceIssues: [],
        reductionReasons: {},
        reports: [
          {
            runId: 'run-1',
            project: 'weapp',
            file: 'host.spec.ts',
            fullName: 'TC-HOST host-case',
            caseId: 'host-case',
            status: 'passed',
            assertions: 1,
            checkpoints: ['host-loaded'],
            sourceDigest: sourceBefore,
            specDigest: current.specDigest,
            protocolDigest: current.protocolDigest,
            fixtureDigest: current.fixtureDigest,
          },
        ],
      });
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('weapp/host-case is stale')]),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it('returns no files for missing roots and skips generated/output directories and rejected files', () => {
    const root = mkdtempSync(join(tmpdir(), 'template-collect-'));
    expect(collectFiles(join(root, 'missing'), () => true)).toEqual([]);
    for (const name of ['dist', 'generated', '.generated', 'node_modules']) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'hidden.ts'), 'hidden');
    }
    writeFileSync(join(root, 'accepted.ts'), 'accepted');
    writeFileSync(join(root, 'rejected.txt'), 'rejected');
    expect(collectFiles(root, (path) => path.endsWith('.ts'))).toEqual([join(root, 'accepted.ts')]);
  });
});
