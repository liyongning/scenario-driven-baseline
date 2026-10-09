import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { evaluateCoverage } from '../check-scenarios.ts';
import { buildContractInventory } from './contract-inventory.ts';
import { loadProjectManifest, testProjectsByClass } from './project-manifest.ts';

/** 模板自身事实核验：只读真实仓库已提交的协议产物与清单，不依赖调用方工作目录。 */
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const generated = join(repositoryRoot, 'packages/protocol/src/generated');
const tradeFile = 'generated/idl/infra/trade/v1/trade.ts';
/** 义务运行环境由清单派生：路由、字段与共享方法要求全部 integration 与 platform 项目。 */
const requiredIn = testProjectsByClass(loadProjectManifest(repositoryRoot), [
  'integration',
  'platform',
]);

async function copyGenerated(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await cp(generated, join(root, 'generated'), { recursive: true });
  return { root, file: join(root, tradeFile) };
}

describe('buildContractInventory', () => {
  it('derives obligations for the example protocol only', async () => {
    const inventory = await buildContractInventory(repositoryRoot);
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

  it('derives a newly reachable field and leaves it missing without a binding', async () => {
    const { root, file } = await copyGenerated('template-contract-added-field-');
    const original = await readFile(file, 'utf8');
    await writeFile(
      file,
      original.replace(
        'export interface QueryTradeResponse {',
        'export interface QueryTradeResponse {\n  reviewProbe: string;',
      ),
    );
    const inventory = await buildContractInventory(repositoryRoot, {
      generatedRoot: join(root, 'generated'),
    });
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
  });

  it('keeps unreviewed request fields and unknown encodings visible as pending issues', async () => {
    const { root, file } = await copyGenerated('template-contract-pending-field-');
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
    const inventory = await buildContractInventory(repositoryRoot, {
      generatedRoot: join(root, 'generated'),
    });
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
  });

  it('treats a single-params union as oneof branches and rejects malformed shapes', async () => {
    const { root, file } = await copyGenerated('template-contract-oneof-');
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
    const inventory = await buildContractInventory(repositoryRoot, {
      generatedRoot: join(root, 'generated'),
    });
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

    const malformed = await copyGenerated('template-contract-malformed-oneof-');
    await writeFile(
      malformed.file,
      patched.replace('alpha: string }', 'alpha: string; unexpected: string }'),
    );
    const malformedInventory = await buildContractInventory(repositoryRoot, {
      generatedRoot: join(malformed.root, 'generated'),
    });
    expect(malformedInventory.issues).toContain(
      'QueryTrade response field probe.params has no approved encoding rule',
    );
  });

  it('fails loudly when the generated Consumer output is missing or incomplete', async () => {
    const missing = await mkdtemp(join(tmpdir(), 'template-contract-missing-generated-'));
    await expect(
      buildContractInventory(repositoryRoot, { generatedRoot: missing }),
    ).rejects.toThrow('generated Consumer trade output is missing');

    const { root, file } = await copyGenerated('template-contract-missing-type-');
    const trade = await readFile(file, 'utf8');
    await writeFile(
      file,
      trade
        .replace(
          'export interface QueryTradeResponse {',
          'export interface MissingQueryTradeResponse {',
        )
        .replace('export const QueryTradeResponse:', 'export const MissingQueryTradeResponse:'),
    );
    await expect(
      buildContractInventory(repositoryRoot, { generatedRoot: join(root, 'generated') }),
    ).rejects.toThrow('missing type QueryTradeResponse');
  });
});

test(
  'SCN-PROTOCOL-CONTRACT-001 derivation-rules',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-001',
        caseId: 'derivation-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-001',
            caseKey: 'derivation-rules',
            checks: ['consumed-methods-only', 'complete-obligations', 'pending-reported'],
          },
        ],
      },
    },
  },
  async (context: TestContext) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };
    const inventory = await buildContractInventory(repositoryRoot);

    await check('consumed-methods-only', () => {
      context
        .expect(inventory.methods.map((item) => item.name))
        .toEqual(['CreateTrade', 'QueryTrade']);
      const prefixes = new Set(inventory.obligations.map((item) => item.id.split('#')[0]));
      context
        .expect([...prefixes].sort())
        .toEqual(['idl.error-contract', 'infra.trade.v1.CreateTrade', 'infra.trade.v1.QueryTrade']);
    });
    await check('complete-obligations', () => {
      const categories = new Set(inventory.obligations.map((item) => item.id.split('#')[1]));
      context
        .expect([...categories].sort())
        .toEqual([
          'business-error',
          'encoding-boundary',
          'error-handling',
          'header-base-req',
          'http-route',
          'request-mapping',
          'response-handling',
          'response-mapping',
          'timeout',
        ]);
      for (const method of ['CreateTrade', 'QueryTrade']) {
        const scoped = inventory.obligations.filter((item) =>
          item.id.startsWith(`infra.trade.v1.${method}#`),
        );
        context.expect(scoped.length, method).toBeGreaterThan(0);
        for (const obligation of scoped) {
          context.expect(obligation.cases.length, obligation.id).toBeGreaterThan(0);
          context.expect(obligation.requiredIn, obligation.id).toEqual(requiredIn);
        }
      }
      context
        .expect(inventory.discoveries.filter((item) => item.applicability === 'pending'))
        .toEqual([]);
    });
    await check('pending-reported', async () => {
      const { root, file } = await copyGenerated('template-contract-derivation-');
      const original = await readFile(file, 'utf8');
      await writeFile(
        file,
        original.replace(
          'export interface QueryTradeRequest {',
          'export interface QueryTradeRequest {\n  reviewProbe: string;',
        ),
      );
      const mutated = await buildContractInventory(repositoryRoot, {
        generatedRoot: join(root, 'generated'),
      });
      context.expect(mutated.discoveries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            direction: 'request',
            path: 'review_probe',
            applicability: 'pending',
            authority: null,
          }),
        ]),
      );
      context
        .expect(mutated.issues.join('\n'))
        .toContain('review_probe has no reviewed applicability rule');
      context
        .expect(mutated.obligations.some((item) => item.id.includes('review_probe')))
        .toBe(false);
    });

    context
      .expect(executed.sort())
      .toEqual(['complete-obligations', 'consumed-methods-only', 'pending-reported']);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);
