import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { declarationRoot } from '../../packages/e2e/tests/tooling/declaration-fixture.ts';
import {
  customMethodFile,
  exampleInventoryRoot,
  inventoryTradeFile,
} from '../../packages/e2e/tests/tooling/contract-inventory-fixture.ts';
import { evaluateCoverage } from '../check-scenarios.ts';
import { buildContractInventory } from './contract-inventory.ts';

describe('buildContractInventory', () => {
  // 副本内（SCN-SCENARIO-GATE-026）负载叠加时默认 5s 超时不够，显式放宽。
  it('derives obligations for the example protocol only', { timeout: 30_000 }, async () => {
    const root = exampleInventoryRoot();
    const inventory = await buildContractInventory(root.root);
    root.cleanup();
    expect(inventory.methods).toEqual([
      { name: 'CreateTrade', method: 'POST', path: '/api/base/trade/create' },
      { name: 'QueryTrade', method: 'POST', path: '/api/base/trade/query' },
    ]);
    expect(inventory.obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#http-route#$',
          cases: ['CreateTrade'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#request-mapping#user_id',
          cases: ['mapped-value'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#request-mapping#goods_type',
          cases: ['fixed-value'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#request-mapping#items.sku_snapshot',
          cases: ['omitted'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#request-mapping#discount_amount',
          cases: ['fixed-value'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#response-mapping#order_nos',
          cases: ['decoded-value', 'decoded-default'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#encoding-boundary#response.order_nos',
          cases: ['response-repeated-array'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#request-mapping#sync_channel',
          cases: ['omitted'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#response-mapping#trade.orders.refund_status',
        }),
        expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#header-base-req#$' }),
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#encoding-boundary#response.trade.orders.unit_price',
          cases: expect.arrayContaining(['response-json-int64-string']),
        }),
        expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#response-handling#$' }),
        expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#error-handling#$' }),
        expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#timeout#$' }),
        expect.objectContaining({
          id: 'idl.error-contract#business-error#$',
          cases: expect.arrayContaining(['ErrInfraTradeQueryTradeUnavailable']),
        }),
      ]),
    );
    expect(inventory.obligations.some((item) => item.id.includes('CreateTradePay'))).toBe(false);
    expect(new Set(inventory.obligations.map((item) => item.id)).size).toBe(
      inventory.obligations.length,
    );
    for (const obligation of inventory.obligations) {
      expect(obligation.cases.length, obligation.id).toBeGreaterThan(0);
      expect(obligation.requiredIn.length, obligation.id).toBeGreaterThan(0);
    }
    expect(inventory.discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'CreateTrade',
          direction: 'request',
          path: 'user_id',
          applicability: 'applicable',
          authority: expect.stringContaining('Design'),
        }),
        expect.objectContaining({
          method: 'QueryTrade',
          direction: 'response',
          path: 'trade.orders.refund_status',
          applicability: 'applicable',
          authority: expect.stringContaining('Design'),
        }),
      ]),
    );
    expect(inventory.discoveries.filter((item) => item.applicability === 'pending')).toEqual([]);
    expect(inventory.issues).toEqual([]);
  });

  it(
    'derives a newly reachable field and leaves it missing without a binding',
    { timeout: 30_000 },
    async () => {
      const root = exampleInventoryRoot();
      const file = inventoryTradeFile(root.root);
      const original = await readFile(file, 'utf8');
      await writeFile(
        file,
        original.replace(
          'export interface QueryTradeResponse {',
          'export interface QueryTradeResponse {\n  reviewProbe: string;',
        ),
      );
      const inventory = await buildContractInventory(root.root);
      root.cleanup();
      const obligation = inventory.obligations.find(
        (item) => item.id === 'infra.trade.v1.QueryTrade#response-mapping#review_probe',
      );
      expect(obligation).toEqual(
        expect.objectContaining({ cases: ['decoded-value', 'decoded-default'] }),
      );
      const coverage = evaluateCoverage({
        current: {
          runId: 'controlled',
          sourceDigest: 'source',
          specDigest: 'spec',
          protocolDigest: 'idl',
          fixtureDigest: 'fixture',
        },
        scenarios: [],
        contracts: inventory.obligations.map((item) => ({
          ...item,
          requiredIn: [...item.requiredIn],
        })),
        flows: [],
        bindings: [],
        reports: [],
        sourceIssues: [],
        reductionReasons: {},
      });
      expect(coverage.issues).toContain(
        'infra.trade.v1.QueryTrade#response-mapping#review_probe/decoded-value: missing binding for integration',
      );
      expect(coverage.issues).toContain(
        'infra.trade.v1.QueryTrade#response-mapping#review_probe/decoded-default: missing binding for weapp',
      );
    },
  );

  it(
    'keeps unreviewed request fields and unknown encodings visible as pending issues',
    { timeout: 30_000 },
    async () => {
      const root = exampleInventoryRoot();
      const file = inventoryTradeFile(root.root);
      const original = await readFile(file, 'utf8');
      await writeFile(
        file,
        original
          .replace(
            'export interface QueryTradeRequest {',
            'export interface QueryTradeRequest {\n  reviewProbe: string;',
          )
          .replace(
            'export interface QueryTradeResponse {',
            'export interface QueryTradeResponse {\n  cycle?: QueryTradeResponse;\n  opaqueProbe: unknown;',
          ),
      );
      const inventory = await buildContractInventory(root.root);
      root.cleanup();
      expect(inventory.discoveries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            direction: 'request',
            path: 'review_probe',
            applicability: 'pending',
            authority: null,
          }),
          expect.objectContaining({
            direction: 'response',
            path: 'opaque_probe',
            applicability: 'pending',
            encoding: null,
          }),
          expect.objectContaining({
            direction: 'response',
            path: 'cycle',
            applicability: 'applicable',
            encoding: 'nested-object',
          }),
        ]),
      );
      expect(inventory.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('review_probe has no reviewed applicability rule'),
          expect.stringContaining('opaque_probe has no approved encoding rule'),
        ]),
      );
      expect(
        inventory.obligations.some(
          (item) => item.id.includes('review_probe') || item.id.includes('opaque_probe'),
        ),
      ).toBe(false);
    },
  );

  it(
    'treats a single-params union as oneof branches and rejects malformed shapes',
    { timeout: 30_000 },
    async () => {
      const root = exampleInventoryRoot();
      const file = inventoryTradeFile(root.root);
      const original = await readFile(file, 'utf8');
      const probes = [
        'interface OneofProbe { params: { $case: "alpha"; alpha: string } | { $case: "beta"; beta: string } | { $case: "gamma"; gamma: { nested: string } } }',
        'interface SingleFieldProbe { only: string }',
      ].join('\n');
      const patched = original.replace(
        'export interface QueryTradeResponse {',
        `${probes}\nexport interface QueryTradeResponse {\n  probe?: OneofProbe | undefined;\n  single?: SingleFieldProbe | undefined;`,
      );
      await writeFile(file, patched);
      const inventory = await buildContractInventory(root.root);
      root.cleanup();
      expect(inventory.discoveries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'probe',
            encoding: 'oneof-object',
            oneofBranch: false,
            applicability: 'applicable',
          }),
          expect.objectContaining({
            path: 'probe.alpha',
            oneofBranch: true,
            encoding: 'json-string',
          }),
          expect.objectContaining({
            path: 'single.only',
            oneofBranch: false,
            encoding: 'json-string',
          }),
        ]),
      );
      expect(inventory.obligations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'infra.trade.v1.QueryTrade#response-mapping#probe',
            cases: ['decoded-value', 'decoded-absence', 'wire-present', 'wire-absent'],
          }),
          expect.objectContaining({
            id: 'infra.trade.v1.QueryTrade#response-mapping#probe.alpha',
            cases: ['decoded-branch', 'wire-present', 'wire-absent'],
          }),
          expect.objectContaining({
            id: 'infra.trade.v1.QueryTrade#encoding-boundary#response.probe',
            cases: ['response-oneof-object', 'response-optional-absence'],
          }),
        ]),
      );
      expect(inventory.issues).toEqual([]);

      const malformed = exampleInventoryRoot();
      await writeFile(
        inventoryTradeFile(malformed.root),
        patched.replace('alpha: string }', 'alpha: string; unexpected: string }'),
      );
      const malformedInventory = await buildContractInventory(malformed.root);
      malformed.cleanup();
      expect(malformedInventory.issues).toContain(
        'QueryTrade response field probe.params has no approved encoding rule',
      );
    },
  );

  it(
    'fails loudly when a declared type is missing from generated output',
    { timeout: 30_000 },
    async () => {
      const root = declarationRoot({
        generated: [
          {
            relative: 'idl/infra/trade/v1/trade.ts',
            content: customMethodFile('CreateTrade', {
              meta: [
                '  {',
                "    method: 'POST',",
                "    path: '/api/base/trade/create',",
                "    name: 'CreateTrade',",
                "    requestType: 'CreateTradeRequest',",
                "    responseType: 'MissingResponse',",
                '    responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
                '  }',
              ].join('\n'),
            }),
          },
        ],
        declaration: [
          "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
          'export const consumedOperations = [',
          "  { method: CreateTrade, requestFields: { user_id: { cases: ['mapped-value'], authority: 'PC-01' } } },",
          '];',
          '',
        ].join('\n'),
        caller: null,
      });
      try {
        await expect(buildContractInventory(root.root)).rejects.toThrow(
          'missing type MissingResponse',
        );
      } finally {
        root.cleanup();
      }
    },
  );
});
