import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect as globalExpect, test } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { baseCoverage, current, runScenarioCli, type MutableCoverageInput } from './helpers.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const roots: string[] = [];
const tempRoot = (prefix: string) => { const path = mkdtempSync(join(tmpdir(), prefix)); roots.push(path); return path; };
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }); });

function run(command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: 'utf8', ...(input === undefined ? {} : { input }) });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function architectureFixture() {
  const root = tempRoot('payment-architecture-cli-');
  mkdirSync(join(root, 'packages'));
  writeFileSync(join(root, 'README.md'), '# facts\n');
  writeFileSync(join(root, 'AGENTS.md'), '[facts](README.md)\n');
  writeFileSync(join(root, 'package.json'), readFileSync('package.json'));
  writeFileSync(join(root, 'project.manifest.json'), readFileSync('project.manifest.json'));
  for (const name of ['sdk', 'protocol', 'e2e']) {
    const directory = join(root, 'packages', name);
    mkdirSync(directory);
    writeFileSync(join(directory, 'AGENTS.md'), '[root](../../AGENTS.md)\n');
    writeFileSync(join(directory, 'package.json'), readFileSync(`packages/${name}/package.json`));
  }
  return root;
}

function runArchitecture(root: string) {
  return run(resolve('node_modules/.bin/tsx'), ['scripts/check-architecture.ts', '--root', root, '--dependency-exit-code', '0']);
}

function packageInput() {
  return {
    sdkManifest: { name: '@daqian/template-sdk', version: '0.1.0', files: ['dist'], dependencies: { '@daqian/template-protocol': '0.1.0' } },
    protocolManifest: { name: '@daqian/template-protocol', version: '0.1.0', files: ['dist'] },
    sdkFiles: ['package/package.json', 'package/dist/index.js'],
    protocolFiles: ['package/package.json', 'package/dist/index.js'],
    record: { sdkVersion: '0.1.0', protocolVersion: '0.1.0' },
    e2eManifest: { private: true },
  };
}

function runPackageCli(input: ReturnType<typeof packageInput>) {
  const root = tempRoot('payment-package-cli-');
  const path = join(root, 'input.json');
  writeFileSync(path, JSON.stringify(input));
  return run(resolve('node_modules/.bin/tsx'), ['scripts/check-package.ts', '--input', path]);
}

const checks = {
  'missing-agent-entry': ['machine-gates'],
  'reverse-dependency': ['machine-gates', 'boundary-enforcement'],
  'shadow-in-production': ['machine-gates', 'boundary-enforcement'],
  'scenario-directory-escape': ['machine-gates', 'boundary-enforcement'],
  'lint-violation': ['machine-gates'],
  'type-violation': ['machine-gates'],
  'untested-handwritten-file': ['machine-gates', 'boundary-enforcement'],
  'restored-valid-input': ['rules-restorable'],
  'gate-reduction-review-evidence': ['review-record'],
} as const;

for (const [caseKey, requiredChecks] of Object.entries(checks) as Array<[keyof typeof checks, readonly string[]]>) {
  defineCase({
    ownerId: 'SCN-TEMPLATE-ENGINEERING-002', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-002', caseKey, checks: [...requiredChecks] }],
  }, async ({ checkpoint, expect }) => {
    let result: ReturnType<typeof run>;
    switch (caseKey) {
      case 'missing-agent-entry': {
        const root = architectureFixture(); rmSync(join(root, 'packages/e2e/AGENTS.md'));
        result = runArchitecture(root); break;
      }
      case 'reverse-dependency': {
        const root = architectureFixture(); const path = join(root, 'packages/protocol/package.json');
        const manifest = JSON.parse(readFileSync(path, 'utf8')); manifest.dependencies = { '@daqian/template-sdk': '0.1.0' };
        writeFileSync(path, JSON.stringify(manifest)); result = runArchitecture(root); break;
      }
      case 'shadow-in-production': {
        const input = packageInput(); input.protocolFiles.push('package/testing/shadow/server.js');
        result = runPackageCli(input); break;
      }
      case 'scenario-directory-escape': {
        const root = architectureFixture(); mkdirSync(join(root, 'packages/e2e/outside-scenarios'));
        result = runArchitecture(root); break;
      }
      case 'lint-violation':
        result = run(resolve('node_modules/.bin/eslint'), ['--stdin', '--stdin-filename', 'packages/e2e/src/lint-probe.ts'], 'const value: any = 1;\n'); break;
      case 'type-violation': {
        const root = tempRoot('payment-type-cli-');
        writeFileSync(join(root, 'bad.ts'), 'const value: string = 1;\n');
        writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, files: ['bad.ts'] }));
        result = run(resolve('node_modules/.bin/tsc'), ['-p', join(root, 'tsconfig.json')]); break;
      }
      case 'untested-handwritten-file': {
        const root = tempRoot('payment-coverage-cli-');
        symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
        writeFileSync(join(root, 'source.ts'), 'export function uncovered(value: boolean) { return value ? 1 : 0; }\n');
        writeFileSync(join(root, 'probe.test.ts'), "import { expect, test } from 'vitest'; test('probe', () => expect(1).toBe(1));\n");
        writeFileSync(join(root, 'vitest.config.mts'), "export default { test: { include: ['probe.test.ts'], coverage: { provider: 'v8', include: ['source.ts'], thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }, reporter: ['text'] } } };\n");
        result = run(resolve('node_modules/.bin/vitest'), ['run', '--root', root, '--config', join(root, 'vitest.config.mts'), '--coverage']); break;
      }
      case 'restored-valid-input': result = runPackageCli(packageInput()); break;
      case 'gate-reduction-review-evidence': {
        const bad = structuredClone(baseCoverage()) as MutableCoverageInput;
        bad.baselineIds = ['SCN-SAMPLE-REMOVED-001'];
        bad.reductionReasons = { 'SCN-SAMPLE-REMOVED-001': { reason: '', reviewId: '', sourceDigest: 'old', evidence: [] } };
        const rejected = runScenarioCli(bad);
        const good = structuredClone(bad);
        good.reductionReasons!['SCN-SAMPLE-REMOVED-001'] = { reason: 'reviewed removal', reviewId: 'review-1', sourceDigest: current.sourceDigest, evidence: ['review.json'] };
        const accepted = runScenarioCli(good);
        result = { status: rejected.status, stdout: JSON.stringify({ rejected: JSON.parse(rejected.stdout), accepted: JSON.parse(accepted.stdout), acceptedStatus: accepted.status }), stderr: rejected.stderr + accepted.stderr };
        break;
      }
    }
    const output = result.stdout.trimStart().startsWith('{') ? JSON.parse(result.stdout) : {};
    for (const checkpointName of requiredChecks) {
      await checkpoint(checkpointName, () => {
        if (caseKey === 'restored-valid-input') {
          expect(result.status).toBe(0); expect(output.issues).toEqual([]); return;
        }
        if (caseKey === 'gate-reduction-review-evidence') {
          expect(result.status).toBe(1);
          expect(output.rejected.issues.join('\n')).toMatch(/incomplete review record|review record is stale/);
          expect(output.acceptedStatus).toBe(0);
          expect(output.accepted.issues).toEqual([]);
          return;
        }
        expect(result.status).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch({
          'missing-agent-entry': /missing packages\/e2e\/AGENTS.md/,
          'reverse-dependency': /protocol cannot depend on SDK\/E2E/,
          'shadow-in-production': /test-only path/,
          'scenario-directory-escape': /unexpected directory packages\/e2e\/outside-scenarios/,
          'lint-violation': /no-explicit-any|Unexpected any/,
          'type-violation': /Type 'number' is not assignable to type 'string'/,
          'untested-handwritten-file': /Coverage for (?:statements|branches|functions|lines)/,
        }[caseKey]!);
      });
    }
  }, { fixtureRoot });
}

// Task 6 只验证缺失证据会阻断；正式目标仓库记录由 Task 8 提供，因此此测试不绑定正式 case。
test('controlled repository enforcement evidence remains absent from formal coverage', () => {
  const input = structuredClone(baseCoverage()) as MutableCoverageInput;
  input.sourceIssues = ['SCN-TEMPLATE-ENGINEERING-002/repository-enforcement-evidence: target repository evidence missing'];
  const result = runScenarioCli(input);
  globalExpect(result.status).toBe(1);
  globalExpect(result.stdout).toContain('target repository evidence missing');
});
