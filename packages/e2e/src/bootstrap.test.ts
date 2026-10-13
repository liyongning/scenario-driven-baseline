import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Task 6 E2E support surface', () => {
  it('loads fixture, harness, case, reporter, and driver helpers', async () => {
    const [fixture, harness, cases, reporter, consumer] = await Promise.all([
      import('./cases/fixture-loader.ts'),
      import('./harness.ts'),
      import('./cases/define-case.ts'),
      import('./reporters/scenario-reporter.ts'),
      import('./package-consumer.ts'),
    ]);
    expect([
      fixture.loadFixtureCase,
      harness.createHarness,
      cases.defineCase,
      reporter.ScenarioReporter,
      consumer.inspectPackageConsumer,
    ]).toEqual(Array(5).fill(expect.any(Function)));

    const weappDriver = fileURLToPath(new URL('./drivers/weapp.ts', import.meta.url));
    if (existsSync(weappDriver)) {
      const weapp = await import('./drivers/weapp.ts');
      expect(weapp.runWeappFunction).toEqual(expect.any(Function));
    }
  });
});
