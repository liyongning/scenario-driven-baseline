import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { defineCase } from '../../src/cases/define-case.ts';
import { runApiContractCli } from '../../../../scripts/api-contract.ts';
import { contractPath, repositoryRoot } from './openapi-contract-fixture.ts';

type ContractNode = Readonly<Record<string, unknown>>;

function node(value: unknown): ContractNode {
  return value as ContractNode;
}

function allFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.name === 'node_modules' || entry.name === '.git'
      ? []
      : entry.isDirectory()
        ? allFiles(path)
        : [path];
  });
}

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-029',
    caseId: 'example-contract-structure',
    fixtureCase: 'example-contract-structure',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-029',
        caseKey: 'example-contract-structure',
        checks: [
          'four-operations',
          'operation-features',
          'top-level-extensions',
          'two-api-key-schemes',
          'request-id-declared',
          'neutral-and-valid',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const source = readFileSync(join(repositoryRoot, contractPath), 'utf8');
    const document = node(parse(source));
    const operation = (path: string, method: string) =>
      node(node(node(document.paths)[path])[method]);
    const schemas = node(node(document.components).schemas);
    const envelope = node(schemas.Envelope);
    const envelopeData = node(node(node(envelope.allOf)[1]).properties).data;
    const trade = node(schemas.Trade);
    await checkpoint('four-operations', () => {
      expect(operation('/api/v1/trades', 'post').operationId).toBe('createTrade');
      expect(operation('/api/v1/trades/{trade_no}', 'get').operationId).toBe('getTrade');
      expect(operation('/api/v1/merchants/{merchant_id}/trades', 'get').operationId).toBe(
        'listTrades',
      );
      expect(operation('/api/v1/trades/{trade_no}/cancel', 'post').operationId).toBe('cancelTrade');
    });
    await checkpoint('operation-features', () => {
      expect(
        node(node(operation('/api/v1/trades', 'post').requestBody).content)['application/json'],
      ).toBeDefined();
      expect(operation('/api/v1/trades', 'post')['x-business-codes']).toContain('TRADE_CONFLICT');
      expect(node(envelopeData).oneOf).toHaveLength(4);
      expect(node(node(trade.properties).failure_reason)).toMatchObject({
        type: 'string',
        nullable: true,
      });
      expect(node(node(trade.properties).status).enum).toContain('SUCCEEDED');
      expect(operation('/api/v1/merchants/{merchant_id}/trades', 'get').security).toEqual([]);
      expect(operation('/api/v1/trades/{trade_no}/cancel', 'post')['x-implemented']).toBe(false);
      expect(operation('/api/v1/trades', 'post').security).toEqual([{ accessToken: [] }]);
      expect(operation('/api/v1/trades/{trade_no}', 'get').security).toEqual([{ accessToken: [] }]);
      expect(operation('/api/v1/trades/{trade_no}/cancel', 'post').security).toEqual([
        { operatorToken: [] },
      ]);
    });
    await checkpoint('top-level-extensions', () => {
      expect(document['x-common-business-codes']).toContain('INVALID_REQUEST');
      expect(document['x-business-code-table']).toMatchObject({
        OK: 0,
        INVALID_REQUEST: 40001,
        TRADE_NOT_FOUND: 40401,
        TRADE_CONFLICT: 40901,
      });
      expect(envelope.allOf).toBeDefined();
      expect(node(envelopeData).nullable).toBe(true);
    });
    await checkpoint('two-api-key-schemes', () => {
      const schemes = node(node(document.components).securitySchemes);
      expect(
        Object.values(schemes)
          .map((scheme) => node(scheme).name)
          .sort(),
      ).toEqual(['X-Access-Token', 'X-Operator-Token']);
      expect(Object.values(schemes).every((scheme) => node(scheme).in === 'header')).toBe(true);
    });
    await checkpoint('request-id-declared', () => {
      const components = node(document.components);
      expect(node(node(components.parameters).XRequestId).name).toBe('X-Request-Id');
      expect(node(node(node(components.headers).XRequestId).schema).type).toBe('string');
    });
    await checkpoint('neutral-and-valid', async () => {
      const result = await runApiContractCli(['validate'], repositoryRoot);
      expect(result.exitCode).toBe(0);
      expect(source.split('\n').length).toBeGreaterThanOrEqual(200);
      expect(source.split('\n').length).toBeLessThanOrEqual(300);
      expect(allFiles(repositoryRoot).some((path) => /xueshan/i.test(path))).toBe(false);
    });
  },
  { timeoutMs: 30_000 },
);
