import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { defaultReportNames, loadProjectManifest, reportNameFor } from './project-manifest.ts';
import { testEnvironmentsByClass } from './test-environments.ts';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

test('derives default report names from the registered test projects', () => {
  const manifest = loadProjectManifest(repositoryRoot);
  expect(defaultReportNames(manifest)).toEqual([
    'unit',
    'integration',
    'integration-heavy',
    'weapp',
    'browser',
  ]);
  expect(reportNameFor(manifest.testProjects.find((item) => item.name === 'weapp')!)).toBe('weapp');
  expect(reportNameFor(manifest.testProjects.find((item) => item.name === 'sdk-unit')!)).toBe(
    'unit',
  );
  expect(testEnvironmentsByClass(manifest, ['integration'])).toEqual(['integration']);
});
