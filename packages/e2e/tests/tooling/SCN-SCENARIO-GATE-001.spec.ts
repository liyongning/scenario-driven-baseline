import { expect, test } from 'vitest';
import { runScenarioPrechecks } from '../../../../scripts/check-scenarios.ts';

test('GATE-001 reports missing OpenSpec directory and CLI before coverage', async () => {
  const result = await runScenarioPrechecks('/tmp/does-not-exist-scenario-gate', () => ({ status: 1 }));
  expect(result.issues).toEqual(expect.arrayContaining([
    expect.stringContaining('openspec/specs directory is missing'),
    expect.stringContaining('openspec CLI cannot be invoked'),
  ]));
});
