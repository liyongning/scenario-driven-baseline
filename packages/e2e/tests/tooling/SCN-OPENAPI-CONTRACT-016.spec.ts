import { cliEvidence, runGate } from './scenario-gate-helpers.ts';
import { openApiCaller, openApiDeclaration, openApiFixtureRoot } from './openapi-fixture.ts';

cliEvidence(
  'SCN-OPENAPI-CONTRACT-016',
  'bidirectional-gate',
  ['unused-declaration', 'undeclared-call', 'gate-fails'],
  async (context, check) => {
    const valid = openApiFixtureRoot({ prefix: 'openapi-bidirectional-valid-' });
    try {
      const result = runGate(valid.root, ['--inventory']);
      await check('unused-declaration', () => {
        context
          .expect(result.output?.issues.filter((issue) => issue.includes('未使用的声明')))
          .toEqual([]);
        const unused = openApiFixtureRoot({
          declaration: openApiDeclaration(),
          caller: null,
          prefix: 'openapi-bidirectional-unused-',
        });
        try {
          const failed = runGate(unused.root, ['--inventory']);
          context.expect(failed.output?.issues.join('\n')).toContain('未使用的声明：createTrade');
          context.expect(failed.output?.issues.join('\n')).toContain('consumed-operations.ts');
        } finally {
          unused.cleanup();
        }
      });

      const fixtures = [
        openApiFixtureRoot({
          declaration: openApiDeclaration(),
          caller: `import { getTrade } from '@daqian/template-openapi/generated/operations';
declare const client: { request(method: unknown, input: unknown): Promise<unknown> };
export const call = () => client.request(getTrade, {});`,
          prefix: 'openapi-bidirectional-mismatch-',
        }),
        openApiFixtureRoot({
          declaration: 'export const consumedOperations = [];',
          caller: openApiCaller,
          prefix: 'openapi-bidirectional-call-',
        }),
      ];
      try {
        const mismatch = runGate(fixtures[0]!.root, ['--inventory']);
        const mismatchIssues = mismatch.output?.issues.join('\n') ?? '';
        await check('undeclared-call', () => {
          context.expect(mismatchIssues).toContain('未声明的调用：getTrade');
          context.expect(mismatchIssues).toContain('caller.ts');
        });
        await check('gate-fails', () => {
          const undeclared = runGate(fixtures[1]!.root, ['--inventory']);
          context.expect(mismatch.status).not.toBe(0);
          context.expect(undeclared.status).not.toBe(0);
          context
            .expect(undeclared.output?.issues.join('\n'))
            .toContain('未声明的调用：createTrade');
        });
      } finally {
        for (const fixture of fixtures) fixture.cleanup();
      }
    } finally {
      valid.cleanup();
    }
  },
  { timeoutMs: 60_000 },
);
