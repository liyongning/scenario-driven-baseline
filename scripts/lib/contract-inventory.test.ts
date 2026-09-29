import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateCoverage } from '../check-scenarios.ts';
import { buildContractInventory } from './contract-inventory.ts';

describe('buildContractInventory', () => {
  it('separates reachable fields from reviewed request applicability and directional encoding rules', async () => {
    const inventory = await buildContractInventory(process.cwd());
    expect(inventory.methods).toEqual([
      { name: 'CreateTradePay', method: 'POST', path: '/api/base/trade/pay' },
      { name: 'QueryTrade', method: 'POST', path: '/api/base/trade/query' },
    ]);
    expect(inventory.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'infra.trade.v1.CreateTradePay#request-mapping#trade_no', cases: ['mapped-value'] }),
      expect.objectContaining({ id: 'infra.trade.v1.CreateTradePay#request-mapping#open_id', cases: ['omitted'] }),
      expect.objectContaining({ id: 'infra.trade.v1.CreateTradePay#response-mapping#payment_no', cases: ['decoded-value', 'decoded-default'] }),
      expect.objectContaining({ id: 'infra.trade.v1.CreateTradePay#response-mapping#pay_params.wechat_virtual.sign_data' }),
      expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#request-mapping#sync_channel', cases: ['omitted'] }),
      expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#response-mapping#trade.orders.refund_status' }),
      expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#header-base-req#$' }),
      expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#encoding-boundary#response.trade.orders.unit_price', cases: expect.arrayContaining(['response-json-int64-string']) }),
      expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#response-handling#$' }),
      expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#timeout#$' }),
      expect.objectContaining({ id: 'infra.trade.v1.CreateTradePay#request-mapping#xpay_env', cases: ['omitted', 'sandbox', 'prod'] }),
      expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#request-mapping#xpay_env', cases: ['query-no-env'] }),
      expect.objectContaining({ id: 'idl.error-contract#business-error#$', cases: expect.arrayContaining(['ErrInfraTradeQueryTradeUnavailable']) }),
    ]));
    expect(inventory.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'infra.trade.v1.CreateTradePay#encoding-boundary#request.trade_no' }),
      expect.objectContaining({ id: 'infra.trade.v1.CreateTradePay#encoding-boundary#response.trade_no' }),
    ]));
    expect(new Set(inventory.obligations.map(item => item.id)).size).toBe(inventory.obligations.length);
    expect(inventory.discoveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'CreateTradePay', direction: 'request', path: 'open_id', applicability: 'applicable', authority: expect.stringContaining('Design') }),
      expect.objectContaining({ method: 'CreateTradePay', direction: 'response', path: 'pay_params.wechat_jsapi', oneofBranch: true, applicability: 'applicable' }),
    ]));
    expect(inventory.discoveries.filter(item => item.applicability === 'pending')).toEqual([]);
    expect(inventory.issues).toEqual([]);
  });

  it('derives a newly reachable non-xpay field and leaves it missing without a binding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-contract-added-field-'));
    await cp(join(process.cwd(), 'packages/payment-protocol/src/generated'), join(root, 'generated'), { recursive: true });
    const tradeFile = join(root, 'generated/idl/infra/trade/v1/trade.ts');
    const original = await readFile(tradeFile, 'utf8');
    await writeFile(tradeFile, original.replace('export interface QueryTradeResponse {', 'export interface QueryTradeResponse {\n  reviewProbe: string;'));
    const inventory = await buildContractInventory(process.cwd(), { generatedRoot: join(root, 'generated') });
    const obligation = inventory.obligations.find(item => item.id === 'infra.trade.v1.QueryTrade#response-mapping#review_probe');
    expect(obligation).toEqual(expect.objectContaining({ cases: ['decoded-value', 'decoded-default'] }));
    const coverage = evaluateCoverage({
      current: { runId: 'controlled', sourceDigest: 'source', specDigest: 'spec', idlDigest: 'idl', fixtureDigest: 'fixture' },
      scenarios: [], contracts: inventory.obligations.map(item => ({ ...item, requiredIn: item.requiredIn as Array<'integration' | 'weapp'> })),
      flows: [], bindings: [], reports: [], sourceIssues: [], reductionReasons: {},
    });
    expect(coverage.issues).toContain('infra.trade.v1.QueryTrade#response-mapping#review_probe/decoded-value: missing binding for integration');
    expect(coverage.issues).toContain('infra.trade.v1.QueryTrade#response-mapping#review_probe/decoded-default: missing binding for weapp');
  });

  it('keeps unreviewed request fields and unknown encodings visible as pending issues', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-contract-pending-field-'));
    await cp(join(process.cwd(), 'packages/payment-protocol/src/generated'), join(root, 'generated'), { recursive: true });
    const tradeFile = join(root, 'generated/idl/infra/trade/v1/trade.ts');
    const original = await readFile(tradeFile, 'utf8');
    await writeFile(tradeFile, original
      .replace('export interface QueryTradeRequest {', 'export interface QueryTradeRequest {\n  reviewProbe: string;')
      .replace('export interface QueryTradeResponse {', 'export interface QueryTradeResponse {\n  cycle?: QueryTradeResponse;\n  opaqueProbe: unknown;'));
    const inventory = await buildContractInventory(process.cwd(), { generatedRoot: join(root, 'generated') });
    expect(inventory.discoveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: 'request', path: 'review_probe', applicability: 'pending', authority: null }),
      expect.objectContaining({ direction: 'response', path: 'opaque_probe', applicability: 'pending', encoding: null }),
      expect.objectContaining({ direction: 'response', path: 'cycle', applicability: 'applicable', encoding: 'nested-object' }),
    ]));
    expect(inventory.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('review_probe has no reviewed applicability rule'),
      expect.stringContaining('opaque_probe has no approved encoding rule'),
    ]));
    expect(inventory.obligations.some(item => item.id.includes('review_probe') || item.id.includes('opaque_probe'))).toBe(false);
  });

  it('makes malformed oneof shapes and missing generated roots explicit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-contract-malformed-oneof-'));
    await cp(join(process.cwd(), 'packages/payment-protocol/src/generated'), join(root, 'generated'), { recursive: true });
    const payFile = join(root, 'generated/idl/infra/pay/v1/pay.ts');
    const original = await readFile(payFile, 'utf8');
    await writeFile(payFile, original.replace(
      '{ $case: "wechatVirtual"; wechatVirtual: WechatVirtualPayParams }',
      '{ $case: "wechatVirtual"; wechatVirtual: WechatVirtualPayParams; unexpected: string }',
    ));
    const malformed = await buildContractInventory(process.cwd(), { generatedRoot: join(root, 'generated') });
    expect(malformed.issues).toContain('CreateTradePay response field pay_params.params has no approved encoding rule');

    const recursiveRoot = await mkdtemp(join(tmpdir(), 'payment-contract-recursive-oneof-'));
    await cp(join(process.cwd(), 'packages/payment-protocol/src/generated'), join(recursiveRoot, 'generated'), { recursive: true });
    const recursivePayFile = join(recursiveRoot, 'generated/idl/infra/pay/v1/pay.ts');
    await writeFile(recursivePayFile, original.replace('wechatVirtual: WechatVirtualPayParams }', 'wechatVirtual: PayParams }'));
    const recursive = await buildContractInventory(process.cwd(), { generatedRoot: join(recursiveRoot, 'generated') });
    expect(recursive.discoveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'pay_params.wechat_virtual', encoding: 'oneof-object', oneofBranch: true }),
    ]));

    const missingRoot = await mkdtemp(join(tmpdir(), 'payment-contract-missing-generated-'));
    await expect(buildContractInventory(process.cwd(), { generatedRoot: missingRoot })).rejects.toThrow('generated Consumer trade output is missing');
    const tradeFile = join(recursiveRoot, 'generated/idl/infra/trade/v1/trade.ts');
    const trade = await readFile(tradeFile, 'utf8');
    await writeFile(tradeFile, trade
      .replace('export interface QueryTradeResponse {', 'export interface MissingQueryTradeResponse {')
      .replace('export const QueryTradeResponse:', 'export const MissingQueryTradeResponse:'));
    await expect(buildContractInventory(process.cwd(), { generatedRoot: join(recursiveRoot, 'generated') })).rejects.toThrow('missing type QueryTradeResponse');
  });

  it('reports missing presence rules and enum value drift from independent descriptor evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payment-contract-inventory-'));
    const descriptorDir = join(root, 'packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-023');
    const errorsDir = join(root, 'packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-024');
    await mkdir(descriptorDir, { recursive: true }); await mkdir(errorsDir, { recursive: true });
    await writeFile(join(errorsDir, 'idl-errors.json'), await readFile(new URL('../../packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-024/idl-errors.json', import.meta.url)));
    await writeFile(join(descriptorDir, 'descriptor.json'), '[]');
    const generatedRoot = join(process.cwd(), 'packages/payment-protocol/src/generated');
    expect((await buildContractInventory(root, { generatedRoot })).issues).toEqual(expect.arrayContaining([expect.stringContaining('does not preserve')]));
    await writeFile(join(descriptorDir, 'descriptor.json'), JSON.stringify([{ field: 'infra.trade.v1.CreateTradePayRequest.xpay_env', optional: true, hasPresence: true, rules: { definedOnly: true, notIn: [0] }, values: { XPAY_ENV_SANDBOX: 9, XPAY_ENV_PROD: 8 } }]));
    expect((await buildContractInventory(root, { generatedRoot })).issues).toEqual(expect.arrayContaining([expect.stringContaining('enum values drifted')]));
  });
});
