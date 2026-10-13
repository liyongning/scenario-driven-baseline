import { expect, test } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { createControlledRoot } from '../../packages/e2e/tests/tooling/controlled-root.ts';
import { baseManifest } from '../../packages/e2e/tests/tooling/project-manifest-fixture.ts';
import { defaultReportNames, loadProjectManifest, reportNameFor } from './project-manifest.ts';
import { testEnvironmentsByClass } from './test-environments.ts';

test('derives default report names from the registered test projects', () => {
  const root = createControlledRoot({ manifest: baseManifest() });
  try {
    const manifest = loadProjectManifest(root.root);
    expect(defaultReportNames(manifest)).toEqual(['unit', 'integration', 'platform']);
    expect(reportNameFor(manifest.testProjects.find((item) => item.name === 'platform')!)).toBe(
      'platform',
    );
    expect(reportNameFor(manifest.testProjects.find((item) => item.name === 'product-unit')!)).toBe(
      'unit',
    );
    expect(testEnvironmentsByClass(manifest, ['integration'])).toEqual(['integration']);
  } finally {
    root.cleanup();
  }
});
