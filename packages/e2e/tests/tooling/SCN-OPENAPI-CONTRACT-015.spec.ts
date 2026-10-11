import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { collectFiles } from '../../../../scripts/lib/fingerprints.ts';
import { cliEvidence, runGate } from './scenario-gate-helpers.ts';
import { openApiFixtureRoot } from './openapi-fixture.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

cliEvidence(
  'SCN-OPENAPI-CONTRACT-015',
  'adapter-loading',
  ['loaded-by-protocol-kind', 'illegal-element-rejected', 'adapter-not-in-dist'],
  async (context, check) => {
    const valid = openApiFixtureRoot({ prefix: 'openapi-adapter-loading-' });
    try {
      const result = runGate(valid.root, ['--inventory']);
      const obligations = result.output?.contracts ?? [];
      await check('loaded-by-protocol-kind', () => {
        context
          .expect(obligations.map((item) => item.id))
          .toEqual(
            context.expect.arrayContaining([
              'trade.v1.createTrade#route#$',
              'trade.v1.createTrade#envelope#$',
            ]),
          );
        context
          .expect(obligations.find((item) => item.id.endsWith('#route#$'))?.requiredIn)
          .toEqual(['integration']);
      });

      await check('illegal-element-rejected', () => {
        const cases = [
          [
            "export const consumedOperations = [{ method: { meta: { id: 'createTrade' } }, requestFields: {} }];",
            '不是 OpenAPI generated 描述常量',
          ],
          [
            "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';\nexport const consumedOperations = [{ method: CreateTrade, requestFields: {} }];",
            '不是 OpenAPI generated 描述常量',
          ],
          [
            'export const consumedOperations = [{ requestFields: {} }];',
            '不是 OpenAPI generated 描述常量',
          ],
        ] as const;
        for (const [declaration, expected] of cases) {
          const fixture = openApiFixtureRoot({
            declaration,
            caller: null,
            prefix: 'openapi-adapter-invalid-',
          });
          try {
            const failed = runGate(fixture.root, ['--inventory']);
            context.expect(failed.status).not.toBe(0);
            context.expect(failed.output?.issues.join('\n')).toContain(expected);
            context.expect(failed.output?.issues.join('\n')).toContain('consumed-operations.ts');
          } finally {
            fixture.cleanup();
          }
        }
      });

      await check('adapter-not-in-dist', () => {
        const built = spawnSync('pnpm', ['--filter', '@daqian/template-openapi', 'build'], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        });
        context.expect(built.status, `${built.stdout}${built.stderr}`).toBe(0);
        const files = collectFiles(
          resolve(repositoryRoot, 'packages/openapi/dist'),
          () => true,
        ).map((path) => path.slice(repositoryRoot.length + 1));
        context.expect(files.some((path) => path.includes('/testing/'))).toBe(false);
        context.expect(files.some((path) => /(?:^|\/)adapter(?:[./]|$)/.test(path))).toBe(false);
      });
    } finally {
      valid.cleanup();
    }
  },
  { timeoutMs: 60_000 },
);
