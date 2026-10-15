import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'vitest';
import { repositoryRoot } from './helpers.ts';

function dependencyRoot() {
  const root = mkdtempSync(join(tmpdir(), 'shadow-preview-boundary-'));
  for (const file of [
    'package.json',
    'project.manifest.json',
    'tsconfig.base.json',
    '.dependency-cruiser.cjs',
  ])
    cpSync(resolve(repositoryRoot, file), join(root, file));
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  cpSync(
    resolve(repositoryRoot, 'scripts/lib/dependency-rules.cjs'),
    join(root, 'scripts/lib/dependency-rules.cjs'),
  );
  mkdirSync(join(root, 'packages/e2e/src/shadow'), { recursive: true });
  for (const file of [
    'index.ts',
    'preview-server.ts',
    'routes.ts',
    'server.ts',
    'faults.ts',
    'requests.ts',
  ])
    cpSync(
      resolve(repositoryRoot, 'packages/e2e/src/shadow', file),
      join(root, 'packages/e2e/src/shadow', file),
    );
  symlinkSync(resolve(repositoryRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function depcruise(root: string, target: string) {
  return spawnSync(
    resolve(repositoryRoot, 'node_modules/.bin/depcruise'),
    ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', target],
    { cwd: root, encoding: 'utf8' },
  );
}

test(
  'SCN-PROTOCOL-CONTRACT-019 preview-entry-boundary',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-019',
        caseId: 'preview-entry-boundary',
        environment: 'integration',
        fixtureCase: 'preview-entry-boundary',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-019',
            caseKey: 'preview-entry-boundary',
            checks: ['preview-construction-restricted'],
          },
        ],
      },
    },
    timeout: 60_000,
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const root = dependencyRoot();
    try {
      const previewLauncher = join(root, 'packages/e2e/src/preview/launcher.ts');
      mkdirSync(join(root, 'packages/e2e/src/preview'), { recursive: true });
      writeFileSync(
        previewLauncher,
        "import { createPreviewShadowServer } from '../shadow/preview-server.ts';\nvoid createPreviewShadowServer;\n",
      );
      const allowed = depcruise(root, 'packages/e2e/src/preview/launcher.ts');
      context.expect(allowed.status, allowed.stdout + allowed.stderr).toBe(0);

      const caseFile = join(root, 'packages/e2e/tests/tooling/case.spec.ts');
      mkdirSync(join(root, 'packages/e2e/tests/tooling'), { recursive: true });
      writeFileSync(
        caseFile,
        "import { createPreviewShadowServer } from '../../src/shadow/preview-server.ts';\nvoid createPreviewShadowServer;\n",
      );
      const caseViolation = depcruise(root, 'packages/e2e/tests/tooling/case.spec.ts');
      context.expect(caseViolation.status).not.toBe(0);
      context
        .expect(caseViolation.stdout + caseViolation.stderr)
        .toContain('shadow-preview-constructor-restricted');
      context
        .expect(caseViolation.stdout + caseViolation.stderr)
        .toContain('packages/e2e/tests/tooling/case.spec.ts');

      const harness = join(root, 'packages/e2e/src/harness.ts');
      writeFileSync(
        harness,
        "import { createPreviewShadowServer } from './shadow/preview-server.ts';\nvoid createPreviewShadowServer;\n",
      );
      const harnessViolation = depcruise(root, 'packages/e2e/src/harness.ts');
      context.expect(harnessViolation.status).not.toBe(0);
      context
        .expect(harnessViolation.stdout + harnessViolation.stderr)
        .toContain('shadow-preview-constructor-restricted');
      context
        .expect(harnessViolation.stdout + harnessViolation.stderr)
        .toContain('packages/e2e/src/harness.ts');

      const entry = join(root, 'packages/e2e/src/shadow/index.ts');
      writeFileSync(
        entry,
        `${readFileSync(entry, 'utf8')}\nexport { createPreviewShadowServer } from './preview-server.ts';\n`,
      );
      const bypass = join(root, 'packages/e2e/tests/tooling/bypass.spec.ts');
      writeFileSync(
        bypass,
        "import { createPreviewShadowServer } from '../../src/shadow/index.ts';\nvoid createPreviewShadowServer;\n",
      );
      const bypassViolation = depcruise(root, 'packages/e2e/tests/tooling/bypass.spec.ts');
      context.expect(bypassViolation.status).not.toBe(0);
      context
        .expect(bypassViolation.stdout + bypassViolation.stderr)
        .toContain('shadow-preview-constructor-restricted');
      context
        .expect(bypassViolation.stdout + bypassViolation.stderr)
        .toContain('packages/e2e/src/shadow/index.ts');

      const restored = depcruise(repositoryRoot, 'packages/e2e/src/shadow');
      context.expect(restored.status, restored.stdout + restored.stderr).toBe(0);
      const previewTests = depcruise(repositoryRoot, 'packages/e2e/src/preview');
      context.expect(previewTests.status, previewTests.stdout + previewTests.stderr).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['preview-construction-restricted'],
      }),
      'scenario-evidence',
    );
  },
);
