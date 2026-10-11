import { resolve } from 'node:path';
import { cliEvidence, runGate } from './scenario-gate-helpers.ts';
import {
  createAdapterFixture,
  protocolKindBranchOffenders,
  readAdapterCalls,
} from './protocol-adapter-fixture.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

cliEvidence(
  'SCN-PROTOCOL-CONTRACT-014',
  'adapter-loading-cli',
  ['adapter-by-binding', 'adapter-interface-required'],
  async (context, check) => {
    const fixture = createAdapterFixture({ prefix: 'protocol-adapter-cli-' });
    try {
      const result = runGate(fixture.root, ['--inventory']);
      const output = result.output as
        | Readonly<{ contracts?: ReadonlyArray<Readonly<{ id: string; requiredIn: string[] }>> }>
        | undefined;

      await check('adapter-by-binding', () => {
        context
          .expect(
            output?.contracts?.map((item) => item.id),
            result.stderr,
          )
          .toEqual(
            context.expect.arrayContaining([
              'a.error-contract#business-error#$',
              'a-op#http-route#$',
              'b.error-contract#business-error#$',
              'b-op#http-route#$',
            ]),
          );
        context
          .expect(output?.contracts?.find((item) => item.id === 'a-op#http-route#$')?.requiredIn)
          .toEqual(['integration', 'platform-a']);
        context
          .expect(output?.contracts?.find((item) => item.id === 'b-op#http-route#$')?.requiredIn)
          .toEqual(['integration', 'platform-b']);
        const calls = readAdapterCalls(fixture);
        context.expect([...new Set(calls.map((call) => call.protocol))].sort()).toEqual(['a', 'b']);
        context.expect(calls.filter((call) => call.name === 'resolveDeclaration')).toHaveLength(2);
        context.expect(calls.filter((call) => call.name === 'deriveObligations')).toHaveLength(4);
        context.expect(calls.filter((call) => call.name === 'scanCalls')).toHaveLength(2);
      });

      await check('adapter-interface-required', () => {
        const missingFile = createAdapterFixture({
          missingAdapter: 'b',
          prefix: 'protocol-adapter-cli-missing-file-',
        });
        try {
          const failure = runGate(missingFile.root, ['--inventory']);
          context.expect(failure.status).not.toBe(0);
          context
            .expect(`${failure.stdout}${failure.stderr}`)
            .toMatch(/protocol-b.*testing\/adapter\.ts/);
        } finally {
          missingFile.cleanup();
        }

        const missingMethod = createAdapterFixture({
          missingMethod: 'b',
          prefix: 'protocol-adapter-cli-missing-method-',
        });
        try {
          const failure = runGate(missingMethod.root, ['--inventory']);
          context.expect(failure.status).not.toBe(0);
          context.expect(`${failure.stdout}${failure.stderr}`).toMatch(/protocol-b.*scanCalls/);
        } finally {
          missingMethod.cleanup();
        }
      });
    } finally {
      fixture.cleanup();
    }
  },
  { timeoutMs: 30_000 },
);

cliEvidence(
  'SCN-PROTOCOL-CONTRACT-014',
  'no-kind-branching',
  ['no-kind-branching'],
  async (context, check) => {
    await check('no-kind-branching', () => {
      context.expect(protocolKindBranchOffenders(repositoryRoot)).toEqual([]);
    });
  },
);
