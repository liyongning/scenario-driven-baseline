import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineCase } from '../../src/cases/define-case.ts';
import { runApiContractCli } from '../../../../scripts/api-contract.ts';
import {
  contractPath,
  lockPath,
  readRepositoryFile,
  repositoryRoot,
  writeOpenApiRoot,
} from './openapi-contract-fixture.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-003',
    caseId: 'api-status-cli',
    fixtureCase: 'api-status-cli',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-003',
        caseKey: 'api-status-cli',
        checks: [
          'in-sync-passes',
          'contract-drift-detected',
          'generated-drift-detected',
          'generated-set-checked',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await checkpoint('in-sync-passes', async () => {
      const result = await runApiContractCli(['status'], repositoryRoot);
      expect(result.exitCode).toBe(0);
      expect(result.issues).toEqual([]);
    });
    await checkpoint('contract-drift-detected', async () => {
      const fixture = writeOpenApiRoot();
      try {
        await runApiContractCli(['sync', 'source-a'], fixture.root);
        writeFileSync(
          join(fixture.root, contractPath),
          readRepositoryFile(contractPath).replace('version: 1.0.0', 'version: 2.0.0'),
        );
        const result = await runApiContractCli(['status'], fixture.root);
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toContain('version');
        expect(result.issues.join('\n')).toContain('sha256');
      } finally {
        fixture.cleanup();
      }
    });
    await checkpoint('generated-drift-detected', async () => {
      const fixture = writeOpenApiRoot();
      try {
        await runApiContractCli(['sync', 'source-b'], fixture.root);
        writeFileSync(join(fixture.root, 'packages/openapi/src/generated/codes.ts'), 'tampered\n');
        const result = await runApiContractCli(['status'], fixture.root);
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toContain('codes.ts');
      } finally {
        fixture.cleanup();
      }
    });
    await checkpoint('generated-set-checked', async () => {
      const fixture = writeOpenApiRoot();
      try {
        await runApiContractCli(['sync', 'source-c'], fixture.root);
        const path = join(fixture.root, lockPath);
        const lock = JSON.parse(readFileSync(path, 'utf8')) as {
          generated: Record<string, string>;
        };
        delete lock.generated['src/generated/codes.ts'];
        lock.generated['src/generated/extra.ts'] = '0'.repeat(64);
        writeFileSync(path, JSON.stringify(lock, null, 2));
        const result = await runApiContractCli(['status'], fixture.root);
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toContain('missing generated src/generated/codes.ts');
        expect(result.issues.join('\n')).toContain('unknown generated src/generated/extra.ts');
      } finally {
        fixture.cleanup();
      }
    });
  },
  { timeoutMs: 30_000 },
);
