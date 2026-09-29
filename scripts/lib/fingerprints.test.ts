import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateCoverage } from '../check-scenarios.ts';
import { buildVerificationFingerprints, collectFiles, digestFiles } from './fingerprints.ts';

describe('verification fingerprints', () => {
  it('is stable across input order and changes when a relative path or content changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'payment-fingerprint-'));
    writeFileSync(join(root, 'a'), 'one');
    writeFileSync(join(root, 'b'), 'two');
    expect(digestFiles(root, [join(root, 'a'), join(root, 'b')]))
      .toBe(digestFiles(root, [join(root, 'b'), join(root, 'a')]));
    const before = digestFiles(root, [join(root, 'a')]);
    writeFileSync(join(root, 'a'), 'changed');
    expect(digestFiles(root, [join(root, 'a')])).not.toBe(before);
    writeFileSync(join(root, 'c'), 'changed');
    expect(digestFiles(root, [join(root, 'c')])).not.toBe(digestFiles(root, [join(root, 'a')]));
  });

  it('builds source, Spec, IDL, and Fixture digests from the reviewed repository inputs', () => {
    const root = mkdtempSync(join(tmpdir(), 'payment-fingerprint-tree-'));
    for (const directory of [
      'packages/payment-sdk/src', 'packages/payment-protocol/src', 'packages/payment-protocol/testing',
      'packages/e2e/src', 'packages/e2e/host/weapp', 'packages/e2e/tests/fixtures', 'scripts',
      'openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk',
      'openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk-contract',
    ]) mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, 'packages/payment-sdk/src/index.ts'), 'sdk');
    writeFileSync(join(root, 'packages/payment-protocol/src/index.ts'), 'protocol');
    writeFileSync(join(root, 'packages/payment-protocol/testing/index.ts'), 'shadow');
    writeFileSync(join(root, 'packages/e2e/src/index.ts'), 'e2e');
    writeFileSync(join(root, 'packages/e2e/host/weapp/app.js'), 'App({});');
    writeFileSync(join(root, 'packages/e2e/host/weapp/app.json'), '{"pages":["pages/index/index"]}');
    writeFileSync(join(root, 'packages/e2e/host/weapp/project.config.json'), '{"libVersion":"3.10.3"}');
    mkdirSync(join(root, 'packages/e2e/host/weapp/pages/index'), { recursive: true });
    writeFileSync(join(root, 'packages/e2e/host/weapp/pages/index/index.json'), '{}');
    writeFileSync(join(root, 'packages/e2e/host/weapp/pages/index/index.wxml'), '<view />');
    writeFileSync(join(root, 'packages/e2e/host/weapp/pages/index/index.wxss'), 'view {}');
    writeFileSync(join(root, 'scripts/check.ts'), 'tool');
    writeFileSync(join(root, 'packages/e2e/tests/fixtures/base.json'), '{}');
    writeFileSync(join(root, 'openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk/spec.md'), 'sdk spec');
    writeFileSync(join(root, 'openspec/changes/archive/2026-09-22-headless-payment-sdk/specs/payment-sdk-contract/spec.md'), 'contract spec');
    mkdirSync(join(root, 'openspec/specs/payment-sdk'), { recursive: true });
    writeFileSync(join(root, 'openspec/specs/payment-sdk/spec.md'), 'active spec');
    writeFileSync(join(root, 'proto-gen.lock'), 'idl');

    const fingerprints = buildVerificationFingerprints(root);
    expect(Object.values(fingerprints)).toHaveLength(4);
    expect(Object.values(fingerprints).every(value => /^[a-f0-9]{64}$/.test(value))).toBe(true);

    const oldSourceDigest = fingerprints.sourceDigest;
    writeFileSync(join(root, 'packages/e2e/host/weapp/app.js'), 'App({ changed: true });');
    const current = buildVerificationFingerprints(root);
    expect(current.sourceDigest).not.toBe(oldSourceDigest);
    const binding = {
      ownerId: 'TC-HOST', caseId: 'host-case', fixtureCase: 'host-case', environment: 'weapp' as const,
      covers: [{ id: 'TC-HOST', caseKey: 'host-case', checks: ['host-loaded'] }],
    };
    const result = evaluateCoverage({
      current: { runId: 'run-1', ...current },
      scenarios: [{ id: 'TC-HOST', cases: [{ key: 'host-case', kind: 'behavior' as const, requiredIn: ['weapp' as const], checks: ['host-loaded'] }] }],
      contracts: [], flows: [], bindings: [binding], sourceIssues: [], reductionReasons: {},
      reports: [{ runId: 'run-1', project: 'weapp', file: 'host.spec.ts', fullName: 'TC-HOST host-case', caseId: 'host-case', status: 'passed', assertions: 1, checkpoints: ['host-loaded'], sourceDigest: oldSourceDigest, specDigest: current.specDigest, idlDigest: current.idlDigest, fixtureDigest: current.fixtureDigest }],
    });
    expect(result.issues).toContain('weapp/host-case is stale');

    for (const [relativePath, changed] of [
      ['packages/e2e/host/weapp/project.config.json', '{"libVersion":"3.10.4"}'],
      ['packages/e2e/host/weapp/app.json', '{"pages":[]}'],
      ['packages/e2e/host/weapp/pages/index/index.json', '{"navigationBarTitleText":"Pay"}'],
      ['packages/e2e/host/weapp/pages/index/index.wxml', '<view>changed</view>'],
      ['packages/e2e/host/weapp/pages/index/index.wxss', 'view { display: none; }'],
    ] as const) {
      const before = buildVerificationFingerprints(root).sourceDigest;
      writeFileSync(join(root, relativePath), changed);
      expect(buildVerificationFingerprints(root).sourceDigest, relativePath).not.toBe(before);
    }

    const beforeGenerated = buildVerificationFingerprints(root).sourceDigest;
    mkdirSync(join(root, 'packages/e2e/host/weapp/.generated'), { recursive: true });
    writeFileSync(join(root, 'packages/e2e/host/weapp/.generated/protocol-runner.js'), 'generated');
    expect(buildVerificationFingerprints(root).sourceDigest).toBe(beforeGenerated);
  });

  it('returns no files for missing roots and skips generated/output directories and rejected files', () => {
    const root = mkdtempSync(join(tmpdir(), 'payment-collect-'));
    expect(collectFiles(join(root, 'missing'), () => true)).toEqual([]);
    for (const name of ['dist', 'generated', '.generated', 'node_modules']) {
      mkdirSync(join(root, name)); writeFileSync(join(root, name, 'hidden.ts'), 'hidden');
    }
    writeFileSync(join(root, 'accepted.ts'), 'accepted');
    writeFileSync(join(root, 'rejected.txt'), 'rejected');
    expect(collectFiles(root, path => path.endsWith('.ts'))).toEqual([join(root, 'accepted.ts')]);
  });
});
