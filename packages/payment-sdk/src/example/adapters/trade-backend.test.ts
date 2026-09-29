import { expect, test, type TestContext } from 'vitest';
import { CreateTradeResponse, QueryTradeResponse, TradeStatus } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { GoodsType } from '@daqian/payment-protocol/generated/idl/infra/pay/v1/pay';
import { createExampleTradeBackend } from './trade-backend';

const catalog = { kind: 'fixture', itemId: 'sku-1', itemName: 'Fixture', unitValue: 125n };
const context = { deadlineAtMs: 1000 } as const;
async function annotate(context: TestContext, before: number, checkpoints: string[]) {
  await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints }), 'payment-evidence');
}
test('SCN-TEMPLATE-EXAMPLE-002 create-mapping', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-002', caseId: 'create-mapping', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-002', caseKey: 'create-mapping', checks: ['neutral-reference'] }],
} } }, async testContext => {
  const before = testContext.expect.getState().assertionCalls;
  const wire = { tradeNo: 'trade-1', baseResp: { statusCode: '0' } };
  const client = createExampleTradeBackend({ catalog, protocol: { request: async (_meta, request) => { expect(request).toMatchObject({ bizType: 'fixture', bizTradeNo: 'ref-1', userId: 9n, goodsType: GoodsType.GOODS_TYPE_VIRTUAL, payAmount: 250n, originalAmount: 250n, discountAmount: 0n, items: [{ bizOrderNo: 'ref-1-1', skuId: 'sku-1', skuName: 'Fixture', quantity: 2, unitPrice: 125n, discountAmount: 0n, payAmount: 250n }] }); return { ok: true, value: { data: CreateTradeResponse.fromJSON({ ...wire, status: TradeStatus.TRADE_STATUS_CREATED }), wire, http: { status: 200, headers: {}, body: wire } } } as never; } } });
  await expect(client.create({ ownerId: '9', externalRef: 'ref-1', units: 2 }, context)).resolves.toEqual({ ok: true, value: { reference: { id: 'trade-1', externalRef: 'ref-1' } } });
  await annotate(testContext, before, ['neutral-reference']);
});

test('SCN-TEMPLATE-EXAMPLE-007 status mapping and reference validation', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-007', caseId: 'status-mapping-table', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-007', caseKey: 'status-mapping-table', checks: ['status-mapping', 'reference-mismatch'] }],
} } }, async testContext => {
  const before = testContext.expect.getState().assertionCalls;
  for (const [status, expected] of [[TradeStatus.TRADE_STATUS_CREATED, 'pending'], [TradeStatus.TRADE_STATUS_PAYING, 'pending'], [TradeStatus.TRADE_STATUS_PAID, 'completed'], [TradeStatus.TRADE_STATUS_CLOSED, 'closed'], [TradeStatus.TRADE_STATUS_UNSPECIFIED, 'unknown'], [TradeStatus.UNRECOGNIZED, 'unknown']] as const) {
    const wire = { trade: { tradeNo: 'trade-1', status }, baseResp: { statusCode: '0' } };
    const client = createExampleTradeBackend({ catalog, protocol: { request: async () => ({ ok: true, value: { data: QueryTradeResponse.fromJSON(wire), wire, http: { status: 200, headers: {}, body: wire } } }) as never } });
    await expect(client.query({ id: 'trade-1', externalRef: 'ref-1' }, context)).resolves.toMatchObject({ ok: true, value: { state: expected } });
  }
  const mismatchWire = { trade: { tradeNo: 'other', status: TradeStatus.TRADE_STATUS_PAID }, baseResp: { statusCode: '0' } };
  const mismatch = createExampleTradeBackend({ catalog, protocol: { request: async () => ({ ok: true, value: { data: QueryTradeResponse.fromJSON(mismatchWire), wire: mismatchWire, http: { status: 200, headers: {}, body: mismatchWire } } }) as never } });
  await expect(mismatch.query({ id: 'trade-1', externalRef: 'ref-1' }, context)).resolves.toMatchObject({ ok: false, error: { category: 'protocol' } });
  await annotate(testContext, before, ['status-mapping', 'reference-mismatch']);
});

test('SCN-TEMPLATE-EXAMPLE-003 create-error-mapping', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-003', caseId: 'create-error-mapping', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-003', caseKey: 'create-error-mapping', checks: ['error-category', 'server-code-preserved'] }],
} } }, async testContext => {
  const before = testContext.expect.getState().assertionCalls;
  const failures = [
    { code: 'TIMEOUT' }, { code: 'NETWORK_ERROR' }, { code: 'EMPTY_ACCESS_TOKEN' }, { code: 'HOST_CONTEXT_ERROR' }, { code: 'CANCELLED' },
    { code: 'CODEC_ERROR', http: { status: 401, headers: {}, body: null } }, { code: 'CODEC_ERROR', http: { status: 500, headers: {}, body: null } }, { code: 'CODEC_ERROR' },
  ] as const;
  for (const error of failures) {
    const client = createExampleTradeBackend({ catalog, protocol: { request: async () => ({ ok: false, error }) as never } });
    const result = await client.query({ id: 'trade-1', externalRef: 'ref-1' }, context);
    const status = 'http' in error ? error.http?.status : undefined;
    expect(result.ok ? undefined : 'cancelled' in result ? 'cancelled' : result.error.category).toBe(error.code === 'CANCELLED' ? 'cancelled' : error.code === 'TIMEOUT' ? 'timeout' : error.code === 'NETWORK_ERROR' ? 'network' : error.code === 'EMPTY_ACCESS_TOKEN' ? 'unauthorized' : error.code === 'HOST_CONTEXT_ERROR' ? 'host' : status === 401 ? 'unauthorized' : status !== undefined ? 'server' : 'protocol');
  }
  const businessWire = { baseResp: { statusCode: '10100801003070', error: { bizCode: '10100801003070', retryable: true } } };
  const business = createExampleTradeBackend({ catalog, protocol: { request: async () => ({ ok: true, value: { data: QueryTradeResponse.fromJSON(businessWire), wire: businessWire, http: { status: 200, headers: {}, body: businessWire } } }) as never } });
  await expect(business.query({ id: 'trade-1', externalRef: 'ref-1' }, context)).resolves.toMatchObject({ ok: false, error: { category: 'server', serverCode: '10100801003070' }, retryable: true });
  await annotate(testContext, before, ['error-category', 'server-code-preserved']);
});
