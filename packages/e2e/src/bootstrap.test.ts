import { describe, expect, it } from 'vitest';

describe('Task 6 E2E support surface', () => {
  it('loads fixture, harness, case, reporter, and driver helpers', async () => {
    const [fixture, harness, cases, reporter, weapp, consumer] = await Promise.all([
      import('./cases/fixture-loader.ts'),
      import('./harness.ts'),
      import('./cases/define-case.ts'),
      import('./reporters/scenario-reporter.ts'),
      import('./drivers/weapp.ts'),
      import('./package-consumer.ts'),
    ]);
    expect([
      fixture.loadFixtureCase,
      harness.createHarness,
      cases.defineCase,
      reporter.ScenarioReporter,
      weapp.runWeappFunction,
      consumer.inspectPackageConsumer,
    ]).toEqual(Array(6).fill(expect.any(Function)));
  });
});
