import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { checkCoverage, runCoverageCli, type CoverageCheckResult } from './check-coverage.ts';
import { coverageExclude, coverageInclude, coverageScope } from './lib/coverage-scope.ts';
import { loadProjectManifest } from './lib/project-manifest.ts';
import {
  createControlledRoot,
  minimalManifest,
  type ControlledRoot,
} from '../packages/e2e/tests/tooling/controlled-root.ts';
import { codeFiles, readSourceInventory } from './lib/source-inventory.ts';

function manifestWithQuality(
  quality: Record<string, unknown>,
  sourceRoots: ReadonlyArray<string> = ['scripts'],
) {
  return {
    ...minimalManifest(),
    fingerprints: { sourceRoots, buildInputs: [], protocolInputs: ['proto-gen.lock'] },
    quality: { coverageExclusions: [], maxLinesExemptions: [], ...quality },
  };
}

function writeReport(root: string, paths: ReadonlyArray<string>): string {
  const directory = join(root, 'coverage');
  mkdirSync(directory, { recursive: true });
  const report = join(directory, 'coverage-final.json');
  writeFileSync(
    report,
    JSON.stringify(Object.fromEntries(paths.map((path) => [join(root, path), {}]))),
  );
  return report;
}

function fixtureWith(
  files: Readonly<Record<string, string>>,
  quality: Record<string, unknown> = {},
): ControlledRoot {
  return createControlledRoot({
    manifest: manifestWithQuality(quality),
    files: { 'scripts/a.ts': 'a', 'scripts/b.ts': 'b', 'scripts/flow.schema.json': '{}', ...files },
  });
}

function expectIssues(result: CoverageCheckResult, needle: string) {
  expect(result.issues.join('\n')).toContain(needle);
}

test(
  'SCN-TEMPLATE-ENGINEERING-009 coverage-completeness-rules',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-ENGINEERING-009',
        caseId: 'coverage-completeness-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-TEMPLATE-ENGINEERING-009',
            caseKey: 'coverage-completeness-rules',
            checks: [
              'inventory-classification',
              'coverage-config-derived',
              'missing-file-reported',
              'stale-exclusion-reported',
              'exclusion-reason-required',
            ],
          },
        ],
      },
    },
  },
  async (context: TestContext) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };

    const fixture = fixtureWith({});
    try {
      await check('inventory-classification', () => {
        const inventory = readSourceInventory(fixture.root);
        expect(codeFiles(inventory)).toEqual(['scripts/a.ts', 'scripts/b.ts']);
        expect(
          inventory.files.find((file) => file.path === 'scripts/flow.schema.json')?.class,
        ).toBe('asset');
      });

      await check('coverage-config-derived', () => {
        const manifest = loadProjectManifest(fixture.root);
        expect(coverageScope(fixture.root, manifest).include).toEqual([
          'scripts/a.ts',
          'scripts/b.ts',
        ]);
        expect(coverageInclude(fixture.root, manifest)).toEqual(['scripts/a.ts', 'scripts/b.ts']);
        expect(coverageExclude(fixture.root, manifest)).toEqual([
          '**/*.test.*',
          '**/*.spec.*',
          '**/generated/**',
          '**/.generated/**',
        ]);
      });

      await check('missing-file-reported', () => {
        const report = writeReport(fixture.root, ['scripts/a.ts']);
        const result = checkCoverage(fixture.root, report);
        expect(result.missing).toEqual(['scripts/b.ts']);
        expectIssues(result, 'missing from coverage report: scripts/b.ts');

        // 覆盖率报告整体缺席时同样逐个报出应统计的文件。
        const absent = checkCoverage(fixture.root, join(fixture.root, 'coverage/missing.json'));
        expectIssues(absent, 'coverage report');
        expect(absent.missing).toEqual(['scripts/a.ts', 'scripts/b.ts']);

        // 报告键是仓库相对路径时也能对账。
        const relativeReport = join(fixture.root, 'coverage/relative.json');
        writeFileSync(relativeReport, JSON.stringify({ 'scripts/a.ts': {}, 'scripts/b.ts': {} }));
        expect(checkCoverage(fixture.root, relativeReport).issues).toEqual([]);
      });

      await check('stale-exclusion-reported', () => {
        const stale = createControlledRoot({
          manifest: manifestWithQuality({
            coverageExclusions: [{ path: 'scripts/missing.ts', reason: '宿主专用' }],
          }),
          files: { 'scripts/a.ts': 'a' },
        });
        const valid = createControlledRoot({
          manifest: manifestWithQuality({
            coverageExclusions: [{ path: 'scripts/a.ts', reason: '宿主专用' }],
          }),
          files: { 'scripts/a.ts': 'a' },
        });
        try {
          const result = checkCoverage(stale.root, writeReport(stale.root, ['scripts/a.ts']));
          expectIssues(
            result,
            'coverage exclusion scripts/missing.ts does not match any hand-written code file',
          );
          // 登记的排除项命中真实代码文件时不再报错，并从应统计集合中减去。
          const validResult = checkCoverage(valid.root, writeReport(valid.root, []));
          expect(validResult.issues).toEqual([]);
          expect(validResult.expected).toEqual([]);
          expect(validResult.excluded).toEqual(['scripts/a.ts']);
          expect(coverageExclude(stale.root, loadProjectManifest(stale.root))).toContain(
            'scripts/missing.ts',
          );
        } finally {
          stale.cleanup();
          valid.cleanup();
        }
      });

      await check('exclusion-reason-required', () => {
        const invalid = fixtureWith({}, { coverageExclusions: [{ path: 'scripts/a.ts' }] });
        try {
          expect(() => loadProjectManifest(invalid.root)).toThrow(/does not match/);
        } finally {
          invalid.cleanup();
        }
      });
    } finally {
      fixture.cleanup();
    }

    context
      .expect(executed.sort())
      .toEqual(
        [
          'inventory-classification',
          'coverage-config-derived',
          'missing-file-reported',
          'stale-exclusion-reported',
          'exclusion-reason-required',
        ].sort(),
      );
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);

test('runCoverageCli reports issues on a partial report and passes when complete', () => {
  const fixture = fixtureWith({});
  try {
    const partial = writeReport(fixture.root, ['scripts/a.ts']);
    const failing = runCoverageCli(['--root', fixture.root, '--coverage', partial]);
    expect(failing.exitCode).toBe(1);
    expect(failing.issues.join('\n')).toContain('scripts/b.ts');

    const complete = writeReport(fixture.root, ['scripts/a.ts', 'scripts/b.ts']);
    const passing = runCoverageCli(['--root', fixture.root, '--coverage', complete]);
    expect(passing.issues).toEqual([]);
    expect(passing.exitCode).toBe(0);

    // 不带 --root 时以传入的 cwd 为根，缺省报告路径读取 VERIFY_RUN_ID；
    // 显式覆盖两种取值，避免结论依赖外层环境（pnpm verify 会设置该变量）。
    const previousRunId = process.env.VERIFY_RUN_ID;
    try {
      delete process.env.VERIFY_RUN_ID;
      const defaulted = runCoverageCli([], fixture.root);
      expect(defaulted.exitCode).toBe(1);
      expect(defaulted.issues.join('\n')).toContain(join(fixture.root, 'artifacts', 'local'));
      process.env.VERIFY_RUN_ID = 'run-9';
      const scoped = runCoverageCli([], fixture.root);
      expect(scoped.exitCode).toBe(1);
      expect(scoped.issues.join('\n')).toContain(join(fixture.root, 'artifacts', 'run-9'));
    } finally {
      if (previousRunId === undefined) delete process.env.VERIFY_RUN_ID;
      else process.env.VERIFY_RUN_ID = previousRunId;
    }
  } finally {
    fixture.cleanup();
  }

  const missingRoot = mkdtempSync(join(tmpdir(), 'coverage-cli-missing-'));
  try {
    const result = runCoverageCli(['--root', missingRoot]);
    expect(result.exitCode).toBe(1);
    expect(result.issues.length).toBeGreaterThan(0);
  } finally {
    rmSync(missingRoot, { recursive: true, force: true });
  }
});
