import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineCase } from '../../src/cases/define-case.ts';
import { runApiContractCli } from '../../../../scripts/api-contract.ts';
import { lockPath, repositoryRoot, writeOpenApiRoot } from './openapi-contract-fixture.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-002',
    caseId: 'api-sync-cli',
    fixtureCase: 'api-sync-cli',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-002',
        caseKey: 'api-sync-cli',
        checks: ['source-from-argument', 'missing-source-rejected', 'lock-covers-all-generated'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const fixture = writeOpenApiRoot();
    try {
      const lock = join(fixture.root, lockPath);
      await checkpoint('source-from-argument', async () => {
        const first = await runApiContractCli(['sync', 'local/contract/path'], fixture.root);
        expect(first.exitCode).toBe(0);
        expect(JSON.parse(readFileSync(lock, 'utf8'))).toMatchObject({
          source: 'local/contract/path',
          version: '1.0.0',
        });
        const second = await runApiContractCli(
          ['sync', 'repo:sample/template#main@abc123'],
          fixture.root,
        );
        expect(second.exitCode).toBe(0);
        expect(JSON.parse(readFileSync(lock, 'utf8')).source).toBe(
          'repo:sample/template#main@abc123',
        );
        const script = readFileSync(join(repositoryRoot, 'scripts/api-contract.ts'), 'utf8');
        expect(script).not.toContain('本仓库');
        expect(script).toContain('pkg.contract');
      });
      await checkpoint('missing-source-rejected', async () => {
        const before = readFileSync(lock, 'utf8');
        const result = await runApiContractCli(['sync'], fixture.root);
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toContain('source');
        expect(readFileSync(lock, 'utf8')).toBe(before);
      });
      await checkpoint('lock-covers-all-generated', () => {
        const locked = JSON.parse(readFileSync(lock, 'utf8')) as {
          generated?: Record<string, string>;
        };
        expect(Object.keys(locked.generated ?? {}).sort()).toEqual([
          'src/generated/codes.ts',
          'src/generated/operations.ts',
          'src/generated/schema.d.ts',
        ]);
        for (const path of Object.keys(locked.generated ?? {}))
          expect(existsSync(join(fixture.root, 'packages/openapi', path))).toBe(true);
      });
    } finally {
      fixture.cleanup();
    }
  },
  { timeoutMs: 30_000 },
);
