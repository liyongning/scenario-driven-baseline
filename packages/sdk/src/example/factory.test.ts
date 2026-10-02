import { describe, expect, test, type TestContext } from 'vitest';
import { createExampleClient, ExampleConfigurationError } from './factory';
import type { ExampleClientOptions } from './contracts';

function valid(): ExampleClientOptions {
  return { runtime: 'wechat-miniapp', gatewayBaseUrl: 'https://fixture.invalid', getAccessToken: () => 'token', catalog: { kind: 'fixture', itemId: 'item-1', itemName: 'Fixture item', unitValue: 120n } };
}
async function annotate(context: TestContext, before: number) {
  await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints: ['config-validated-first'] }), 'payment-evidence');
}

test('SCN-TEMPLATE-EXAMPLE-001 factory-validation', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-001', caseId: 'factory-validation', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-001', caseKey: 'factory-validation', checks: ['config-validated-first'] }],
} } }, async context => {
  const before = context.expect.getState().assertionCalls;
  context.expect(() => createExampleClient(valid())).not.toThrow();
  context.expect(() => createExampleClient({ ...valid(), gatewayBaseUrl: '' })).toThrow(ExampleConfigurationError);
  context.expect(() => createExampleClient({ ...valid(), catalog: { ...valid().catalog, unitValue: 0n } })).toThrow(ExampleConfigurationError);
  context.expect(() => createExampleClient({ ...valid(), policy: { windowMs: 0 } })).toThrow(ExampleConfigurationError);
  context.expect(() => createExampleClient({ ...valid(), requestContext: { productId: 1 as never } })).toThrow(ExampleConfigurationError);
  context.expect(() => createExampleClient({ ...valid(), policy: { requestTimeoutMs: 10, intervalMs: 20, windowMs: 30 }, requestContext: { productId: 'p', lane: 'l', appVersion: 'v' } })).not.toThrow();
  await annotate(context, before);
});

describe('example factory', () => {
  test('does not touch platform or token during creation', () => {
    expect('wx' in globalThis).toBe(false);
    expect(createExampleClient(valid())).toEqual({ create: expect.any(Function), observe: expect.any(Function) });
  });
  test.each([
    undefined, null, [], { ...valid(), runtime: 'node' }, { ...valid(), getAccessToken: 1 },
    { ...valid(), catalog: null }, { ...valid(), catalog: { ...valid().catalog, kind: '' } },
    { ...valid(), catalog: { ...valid().catalog, unitValue: 1 } }, { ...valid(), policy: null },
    { ...valid(), policy: [] }, { ...valid(), policy: { requestTimeoutMs: 0 } },
    { ...valid(), policy: { intervalMs: Number.POSITIVE_INFINITY } },
    { ...valid(), requestContext: null }, { ...valid(), requestContext: [] },
    { ...valid(), requestContext: { lane: 1 } }, { ...valid(), requestContext: { appVersion: 1 } },
    { ...valid(), catalog: [] }, { ...valid(), catalog: { ...valid().catalog, itemId: '' } },
    { ...valid(), catalog: { ...valid().catalog, itemName: '' } },
  ])('rejects malformed configuration %#', value => expect(() => createExampleClient(value as ExampleClientOptions)).toThrow(ExampleConfigurationError));
  test('accepts partial policy and request context without reading token', () => {
    for (const policy of [{ requestTimeoutMs: 1 }, { intervalMs: 1 }, { windowMs: 1 }]) {
      expect(() => createExampleClient({ ...valid(), policy })).not.toThrow();
    }
    for (const requestContext of [{ productId: 'p' }, { lane: 'l' }, { appVersion: 'v' }]) {
      expect(() => createExampleClient({ ...valid(), requestContext })).not.toThrow();
    }
  });
});
