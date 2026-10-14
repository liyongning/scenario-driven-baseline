import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { test } from 'vitest';
import { generateContractFiles } from '../../../../scripts/lib/openapi-contract-core.ts';
import { cancelTrade, createTrade, getTrade, listTrades } from './generated/operations.ts';
import { businessCodeTable, type OperationCodes } from './generated/codes.ts';
import { normalizeContractConventions } from './conventions.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const engineDirectory = join(repositoryRoot, 'packages/openapi/testing/engine');

type Outcome = 'handled';

const createTradeOutcomes = {
  AMOUNT_LIMIT_EXCEEDED: 'handled',
  INVALID_REQUEST: 'handled',
  TRADE_CONFLICT: 'handled',
} satisfies Record<OperationCodes<'createTrade'>, Outcome>;

// @ts-expect-error 缺少一个接口业务码必须编译失败。
const missingCode: Record<OperationCodes<'createTrade'>, Outcome> = {
  INVALID_REQUEST: 'handled',
};

const extraCode: Record<OperationCodes<'createTrade'>, Outcome> = {
  INVALID_REQUEST: 'handled',
  TRADE_CONFLICT: 'handled',
  // @ts-expect-error 契约之外的业务码必须编译失败。
  UNKNOWN_CODE: 'handled',
};

test(
  'SCN-OPENAPI-CONTRACT-020 code-completeness-types',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-OPENAPI-CONTRACT-020',
        caseId: 'code-completeness-types',
        fixtureCase: null,
        environment: 'openapi-unit',
        covers: [
          {
            id: 'SCN-OPENAPI-CONTRACT-020',
            caseKey: 'code-completeness-types',
            checks: ['operation-codes-match', 'exhaustive-compiles', 'missing-or-extra-fails'],
          },
        ],
      },
    },
  },
  (context) => {
    const before = context.expect.getState().assertionCalls;
    context.expect(createTrade.meta).toEqual({
      id: 'createTrade',
      method: 'post',
      path: '/api/v1/trades',
      security: [{ accessToken: [] }],
      codes: ['AMOUNT_LIMIT_EXCEEDED', 'INVALID_REQUEST', 'TRADE_CONFLICT'],
      implemented: true,
    });
    context.expect(getTrade.meta.path).toBe('/api/v1/trades/{trade_no}');
    context.expect(listTrades.meta.security).toEqual([]);
    context.expect(cancelTrade.meta).toMatchObject({ id: 'cancelTrade', implemented: false });
    context.expect(businessCodeTable).toEqual({
      OK: 0,
      INVALID_REQUEST: 40001,
      AMOUNT_LIMIT_EXCEEDED: 42201,
      TRADE_NOT_FOUND: 40401,
      TRADE_CONFLICT: 40901,
    });
    context
      .expect(Object.keys(createTradeOutcomes).sort())
      .toEqual(['AMOUNT_LIMIT_EXCEEDED', 'INVALID_REQUEST', 'TRADE_CONFLICT']);
    context.expect(missingCode).toBeDefined();
    context.expect(extraCode).toBeDefined();
    context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['operation-codes-match', 'exhaustive-compiles', 'missing-or-extra-fails'],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-OPENAPI-CONTRACT-029 engine-artifacts-fresh',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-OPENAPI-CONTRACT-029',
        caseId: 'engine-artifacts-fresh',
        fixtureCase: null,
        environment: 'openapi-unit',
        covers: [
          {
            id: 'SCN-OPENAPI-CONTRACT-029',
            caseKey: 'engine-artifacts-fresh',
            checks: ['engine-artifacts-fresh'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const source = readFileSync(join(engineDirectory, 'trade-v1.yaml'), 'utf8');
    const generated = await generateContractFiles(
      source,
      normalizeContractConventions(parse(source)),
    );
    for (const [path, content] of Object.entries(generated)) {
      const name = path.split('/').pop()!;
      context.expect(readFileSync(join(engineDirectory, 'generated', name), 'utf8')).toBe(content);
    }

    const temporary = mkdtempSync(join(tmpdir(), 'openapi-engine-bundle-'));
    try {
      const output = join(temporary, 'contract.bundle.json');
      const bundle = spawnSync(
        join(repositoryRoot, 'node_modules/.bin/redocly'),
        [
          'bundle',
          'packages/openapi/testing/engine/trade-v1.yaml',
          '--config',
          join(engineDirectory, 'redocly.yaml'),
          '--dereferenced',
          '--ext',
          'json',
          '--output',
          output,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      );
      context.expect(bundle.status, bundle.stderr || bundle.stdout).toBe(0);
      context
        .expect(JSON.parse(readFileSync(output, 'utf8')))
        .toEqual(JSON.parse(readFileSync(join(engineDirectory, 'contract.bundle.json'), 'utf8')));
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }

    const manifest = JSON.parse(
      readFileSync(join(repositoryRoot, 'project.manifest.json'), 'utf8'),
    ) as {
      fingerprints: { protocolInputs: string[] };
    };
    context
      .expect(manifest.fingerprints.protocolInputs)
      .toContain('packages/openapi/testing/engine/**');
    context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['engine-artifacts-fresh'],
      }),
      'scenario-evidence',
    );
  },
);
