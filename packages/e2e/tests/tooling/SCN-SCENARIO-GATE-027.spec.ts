import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { cliEvidence, runGate } from './scenario-gate-helpers.ts';
import { createAdapterFixture } from './protocol-adapter-fixture.ts';

type Obligation = Readonly<{ id: string; cases: string[]; requiredIn: string[] }>;

function coverageInput(obligations: ReadonlyArray<Obligation>, existingProject: string) {
  const current = {
    runId: 'binding-environments',
    sourceDigest: 'source',
    specDigest: 'spec',
    protocolDigest: 'protocol',
    fixtureDigest: 'fixture',
  };
  const bindings = obligations.flatMap((obligation) =>
    obligation.requiredIn.map((environment) => ({
      ownerId: obligation.id,
      caseId: `${obligation.id.replace(/[^A-Za-z0-9]+/g, '-')}-${environment}`,
      fixtureCase: null,
      environment,
      covers: obligation.cases.map((caseKey) => ({
        id: obligation.id,
        caseKey,
        checks: [`${obligation.id}/${caseKey}`],
      })),
    })),
  );
  const reports = bindings
    .filter(
      (binding) => binding.environment !== 'platform-a' && binding.environment !== 'platform-b',
    )
    .concat(bindings.filter((binding) => binding.environment === existingProject))
    .map((binding) => ({
      ...current,
      fixtureDigest: null as null,
      project: binding.environment,
      file: `${binding.caseId}.spec.ts`,
      fullName: `${binding.ownerId} ${binding.caseId}`,
      caseId: binding.caseId,
      status: 'passed' as const,
      assertions: 1,
      checkpoints: binding.covers.flatMap((cover) => cover.checks),
    }));
  return { current, scenarios: [], contracts: obligations, flows: [], bindings, reports };
}

function runCoverage(root: string, input: unknown, name: string) {
  const path = join(root, `${name}.json`);
  writeFileSync(path, JSON.stringify(input));
  return runGate(root, ['--input', path]);
}

cliEvidence(
  'SCN-SCENARIO-GATE-027',
  'binding-environment-cli',
  ['environments-by-binding', 'no-cross-binding-requirement', 'gap-scoped-to-binding'],
  async (context, check) => {
    const fixture = createAdapterFixture({ prefix: 'binding-environment-cli-' });
    try {
      const inventory = await buildContractInventory(fixture.root);
      const contracts = inventory.obligations.map(({ id, cases, requiredIn }) => ({
        id,
        cases,
        requiredIn,
      }));

      await check('environments-by-binding', () => {
        context
          .expect(contracts.find((item) => item.id === 'a-op#http-route#$')?.requiredIn)
          .toEqual(['integration', 'platform-a']);
        context
          .expect(contracts.find((item) => item.id === 'b-op#http-route#$')?.requiredIn)
          .toEqual(['integration', 'platform-b']);
      });

      const onlyA = runCoverage(fixture.root, coverageInput(contracts, 'platform-a'), 'only-a');
      const onlyB = runCoverage(fixture.root, coverageInput(contracts, 'platform-b'), 'only-b');
      await check('no-cross-binding-requirement', () => {
        const issuesA = (onlyA.output?.issues ?? []).join('\n');
        const issuesB = (onlyB.output?.issues ?? []).join('\n');
        context.expect(issuesA).not.toMatch(/a-op#http-route#\$[^\n]*missing platform-b evidence/);
        context.expect(issuesB).not.toMatch(/b-op#http-route#\$[^\n]*missing platform-a evidence/);
      });

      await check('gap-scoped-to-binding', () => {
        const issuesA = (onlyA.output?.issues ?? []).join('\n');
        const issuesB = (onlyB.output?.issues ?? []).join('\n');
        context.expect(issuesA).toContain('b-op#http-route#$');
        context.expect(issuesA).toContain('missing platform-b evidence');
        context.expect(issuesA).not.toContain('missing platform-a evidence');
        context.expect(issuesB).toContain('a-op#http-route#$');
        context.expect(issuesB).toContain('missing platform-a evidence');
        context.expect(issuesB).not.toContain('missing platform-b evidence');
      });
    } finally {
      fixture.cleanup();
    }
  },
  { timeoutMs: 30_000 },
);
