import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineCase } from '../../src/cases/define-case.ts';
import { runApiContractCli } from '../../../../scripts/api-contract.ts';
import {
  contractPath,
  readRepositoryFile,
  repositoryRoot,
  writeOpenApiRoot,
} from './openapi-contract-fixture.ts';

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-001',
    caseId: 'api-validate-cli',
    fixtureCase: 'api-validate-cli',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-001',
        caseKey: 'api-validate-cli',
        checks: [
          'example-passes',
          'envelope-enum-equals-table',
          'codes-subset-of-table',
          'lint-error-fails',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const original = readRepositoryFile(contractPath);
    const cases = [
      original.replace('enum: [0, 40001, 40401, 40901]', 'enum: [0, 40001, 40401, 40901, 50001]'),
    ];
    cases.push(
      original.replace('TRADE_CONFLICT: 40901', 'TRADE_CONFLICT: 40901\n  SERVER_ERROR: 50001'),
    );
    cases.push(
      original.replace(
        'x-common-business-codes: [INVALID_REQUEST]',
        'x-common-business-codes: [INVALID_REQUEST, UNKNOWN]',
      ),
    );
    cases.push(
      original.replace(
        'x-business-codes: [TRADE_CONFLICT, TRADE_NOT_FOUND]',
        'x-business-codes: [TRADE_CONFLICT, TRADE_NOT_FOUND, UNKNOWN]',
      ),
    );
    const lintError = original.replace(
      "        - $ref: '#/components/parameters/TradeNo'\n        - $ref: '#/components/parameters/XRequestId'\n",
      "        - $ref: '#/components/parameters/XRequestId'\n",
    );

    await checkpoint('example-passes', async () => {
      const result = await runApiContractCli(['validate'], repositoryRoot);
      expect(result.exitCode).toBe(0);
      expect(result.issues).toEqual([]);
    });
    await checkpoint('envelope-enum-equals-table', async () => {
      for (const source of cases.slice(0, 2)) {
        const fixture = writeOpenApiRoot(source);
        try {
          const result = await runApiContractCli(['validate'], fixture.root);
          expect(result.exitCode).not.toBe(0);
          expect(result.issues.join('\n')).toContain('50001');
        } finally {
          fixture.cleanup();
        }
      }
    });
    await checkpoint('codes-subset-of-table', async () => {
      for (const source of cases.slice(2)) {
        const fixture = writeOpenApiRoot(source);
        try {
          const result = await runApiContractCli(['validate'], fixture.root);
          expect(result.exitCode).not.toBe(0);
          expect(result.issues.join('\n')).toContain('UNKNOWN');
        } finally {
          fixture.cleanup();
        }
      }
    });
    await checkpoint('lint-error-fails', async () => {
      const fixture = writeOpenApiRoot(lintError);
      try {
        const result = await runApiContractCli(['validate'], fixture.root);
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toContain('path-parameters-defined');
        expect(result.issues.join('\n')).toContain('trade_no');
      } finally {
        fixture.cleanup();
      }
    });
    expect(readFileSync(join(repositoryRoot, contractPath), 'utf8')).toBe(original);
  },
  { timeoutMs: 30_000 },
);
