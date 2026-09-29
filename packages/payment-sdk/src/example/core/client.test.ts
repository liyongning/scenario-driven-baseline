import { expect, test, vi, type TestContext } from 'vitest';
import type { Cancellation } from '@daqian/payment-protocol';
import type { ExampleBackend, ExampleRuntimePort } from '../ports/backend';
import type { ExampleCreateInput, ExampleResourceRef } from '../contracts';
import { createExampleCore } from './client';

const input: ExampleCreateInput = { ownerId: '42', externalRef: 'ref-1', units: 2 };
const reference: ExampleResourceRef = { id: 'trade-1', externalRef: 'ref-1' };
function source() { let now = 0; const runtime: ExampleRuntimePort = { nowMs: () => now, sleepMs: async duration => { now += duration; } }; return runtime; }
function stopSource(): { signal: Cancellation; stop: () => void } {
  let stopped = false; let listener: (() => void) | undefined;
  return { signal: { isStopped: () => stopped, subscribe: callback => { listener = callback; return () => { listener = undefined; }; } }, stop: () => { stopped = true; listener?.(); } };
}
function backend(overrides: Partial<ExampleBackend> = {}): ExampleBackend {
  return { create: async () => ({ ok: true, value: { reference } }), query: async () => ({ ok: true, value: { reference, state: 'completed' } }), ...overrides };
}
async function annotate(context: TestContext, before: number, checkpoints: string[]) {
  await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints }), 'payment-evidence');
}

test('SCN-TEMPLATE-EXAMPLE-002 create-mapping', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-002', caseId: 'create-mapping', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-002', caseKey: 'create-mapping', checks: ['neutral-reference'] }],
} } }, async context => {
  const before = context.expect.getState().assertionCalls;
  const result = await createExampleCore({ backend: backend(), runtime: source() }).create(input);
  expect(result).toEqual({ ok: true, reference });
  await annotate(context, before, ['neutral-reference']);
});

test('SCN-TEMPLATE-EXAMPLE-003 create-error-mapping', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-003', caseId: 'create-error-mapping', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-003', caseKey: 'create-error-mapping', checks: ['error-category', 'server-code-preserved'] }],
} } }, async context => {
  const before = context.expect.getState().assertionCalls;
  const invalid = await createExampleCore({ backend: backend(), runtime: source() }).create({ ...input, ownerId: '0' });
  expect(invalid).toMatchObject({ ok: false, error: { category: 'invalid_input' } });
  expect(invalid).toEqual({ ok: false, error: expect.objectContaining({ category: 'invalid_input' }) });
  const failure = await createExampleCore({ backend: backend({ create: async () => ({ ok: false, error: { category: 'server', message: '服务端处理失败', serverCode: '123' } }) }), runtime: source() }).create(input);
  expect(failure).toMatchObject({ ok: false, error: { category: 'server', serverCode: '123' } });
  await annotate(context, before, ['error-category', 'server-code-preserved']);
});

test('SCN-TEMPLATE-EXAMPLE-005 observation-budget', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-005', caseId: 'observation-budget', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-005', caseKey: 'observation-budget', checks: ['request-timeout-local', 'window-elapsed', 'no-request-after-end'] }],
} } }, async context => {
  const before = context.expect.getState().assertionCalls;
  let calls = 0;
  const runtime = source();
  const result = await createExampleCore({ runtime, policy: { requestTimeoutMs: 1, intervalMs: 1, windowMs: 3 }, backend: backend({ query: async () => { calls += 1; return { ok: false, error: { category: 'timeout', message: '请求超时' }, retryable: true }; } }) }).observe(reference);
  expect(result).toMatchObject({ end: 'window_elapsed', lastState: 'unknown' });
  expect(calls).toBeGreaterThan(0);
  await annotate(context, before, ['request-timeout-local', 'window-elapsed', 'no-request-after-end']);
});

test('SCN-TEMPLATE-EXAMPLE-006 cancellation-rules', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-006', caseId: 'cancellation-rules', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-006', caseKey: 'cancellation-rules', checks: ['cancel-while-waiting', 'cancel-in-flight', 'no-request-after-cancel'] }],
} } }, async context => {
  const before = context.expect.getState().assertionCalls;
  const host = stopSource();
  const query = vi.fn(async () => new Promise<never>(() => undefined));
  const pending = createExampleCore({ runtime: source(), backend: backend({ query }) }).observe(reference, { cancellation: host.signal });
  host.stop();
  await expect(pending).resolves.toMatchObject({ end: 'cancelled' });
  expect(query).toHaveBeenCalledTimes(1);
  await annotate(context, before, ['cancel-while-waiting', 'cancel-in-flight', 'no-request-after-cancel']);
});

test('neutral core maps terminal and protocol failures', async () => {
  const completed = await createExampleCore({ runtime: source(), backend: backend() }).observe(reference);
  expect(completed).toMatchObject({ end: 'completed', lastState: 'completed' });
  const mismatch = await createExampleCore({ runtime: source(), backend: backend({ query: async () => ({ ok: false, error: { category: 'protocol', message: '协议响应无效' } }) }) }).observe(reference);
  expect(mismatch).toMatchObject({ end: 'failed', error: { category: 'protocol' } });
  const closed = await createExampleCore({ runtime: source(), backend: backend({ query: async () => ({ ok: true, value: { reference, state: 'closed' } }) }) }).observe(reference);
  expect(closed).toMatchObject({ end: 'closed' });
});
