import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence, enableInventory, fixtureRoot, runGate } from './scenario-gate-helpers.ts';

cliEvidence('SCN-SCENARIO-GATE-001', 'missing-specs-dir-cli', ['precheck-before-coverage', 'missing-specs-dir', 'restored-passes'], async (context, check) => {
  const fixture = fixtureRoot();
  try {
    rmSync(join(fixture.root, 'openspec/specs'), { recursive: true });
    const missing = runGate(fixture.root);
    await check('precheck-before-coverage', () => context.expect(missing.output?.scenarios).toBeUndefined());
    await check('missing-specs-dir', () => { context.expect(missing.status).toBe(1); context.expect(missing.output?.issues.join('\n')).toContain('openspec/specs directory is missing'); });
    mkdirSync(join(fixture.root, 'openspec/specs'));
    enableInventory(fixture.root);
    const restored = runGate(fixture.root);
    await check('restored-passes', () => {
      context.expect(restored.output?.summaries, restored.stderr).toBeDefined();
      context.expect(restored.output?.issues.some(issue => issue.startsWith('precheck:'))).toBe(false);
    });
  } finally { fixture.cleanup(); }
});

cliEvidence('SCN-SCENARIO-GATE-001', 'missing-openspec-cli', ['precheck-before-coverage', 'missing-cli', 'restored-passes'], async (context, check) => {
  const fixture = fixtureRoot();
  try {
    const missing = runGate(fixture.root, [], false);
    await check('precheck-before-coverage', () => context.expect(missing.output?.scenarios).toBeUndefined());
    await check('missing-cli', () => { context.expect(missing.status).toBe(1); context.expect(missing.output?.issues.join('\n')).toContain('openspec CLI cannot be invoked'); });
    enableInventory(fixture.root);
    const restored = runGate(fixture.root);
    await check('restored-passes', () => {
      context.expect(restored.output?.summaries, restored.stderr).toBeDefined();
      context.expect(restored.output?.issues.some(issue => issue.startsWith('precheck:'))).toBe(false);
    });
  } finally { fixture.cleanup(); }
});
