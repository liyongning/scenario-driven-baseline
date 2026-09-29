import { describe, expect, it } from 'vitest';

describe('Task 6 E2E support surface', () => {
  it('loads fixture, harness, case, reporter, and driver helpers', async () => {
    const [fixture, harness, cases, reporter, node, weapp, channel, consumer] = await Promise.all([
      import('./cases/fixture-loader.ts'), import('./harness.ts'), import('./cases/define-case.ts'),
      import('./reporters/scenario-reporter.ts'), import('./drivers/node.ts'), import('./drivers/weapp.ts'),
      import('./drivers/channel-double.ts'), import('./package-consumer.ts'),
    ]);
    expect([fixture.loadFixtureCase, harness.createHarness, cases.defineCase, reporter.ScenarioReporter,
      node.createNodeHttpDriver, weapp.runWeappFunction, channel.createChannelDouble,
      consumer.inspectPackageConsumer]).toEqual(Array(8).fill(expect.any(Function)));
  });
});
