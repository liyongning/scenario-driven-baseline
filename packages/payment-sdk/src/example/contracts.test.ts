import { test, type TestContext } from 'vitest';
import type { ExampleClient, ExampleCreateInput, ExampleCreateResult, ExampleOutcome, ExampleResourceRef, ExampleRunOptions, ExampleState } from './contracts';

/** SCN-TEMPLATE-EXAMPLE-001 public-type-contract：tsc 真实编译正反消费者。 */
function exhaustEnd(outcome: ExampleOutcome): string {
  switch (outcome.end) {
    case 'completed': return 'completed';
    case 'closed': return 'closed';
    case 'window_elapsed': return 'window_elapsed';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    default: return assertNever(outcome.end);
  }
}
function assertNever(value: never): never { throw new Error(`unexpected ${JSON.stringify(value)}`); }

// @ts-expect-error 示例输入不接受协议交易字段。
const protocolLeak: ExampleCreateInput = { tradeNo: 'trade-1' };
// @ts-expect-error 示例状态不接受协议状态取值。
const protocolState: ExampleState = 'PAID';
const readonlyRef: ExampleResourceRef = { id: 'resource-1', externalRef: 'ref-1' };
// @ts-expect-error 公共引用只读。
readonlyRef.id = 'resource-2';
// @ts-expect-error 判别值与结果形态必须一致。
const mismatched: ExampleCreateResult = { ok: true, error: { category: 'server', message: 'x' } };
// @ts-expect-error 初始化选项不接收平台句柄。
const platformHandle: ExampleRunOptions = { wx: {} };
const client: ExampleClient = {
  create: async () => ({ ok: false, error: { category: 'host', message: 'x' } }),
  observe: async () => ({ end: 'cancelled', lastState: 'pending' }),
};
void client;

test('SCN-TEMPLATE-EXAMPLE-001 public-type-contract', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-001', caseId: 'public-type-contract', environment: 'sdk-unit', fixtureCase: null,
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-001', caseKey: 'public-type-contract', checks: ['public-type-contract'] }],
} } }, async (context: TestContext) => {
  const before = context.expect.getState().assertionCalls;
  context.expect(exhaustEnd({ end: 'closed', lastState: 'closed' })).toBe('closed');
  context.expect(Object.keys(protocolLeak)).toEqual(['tradeNo']);
  context.expect(protocolState).toBe('PAID');
  context.expect(readonlyRef.id).toBe('resource-2');
  context.expect(mismatched.ok).toBe(true);
  context.expect(Object.keys(platformHandle)).toEqual(['wx']);
  const options: ExampleRunOptions = { policy: { windowMs: 10 } };
  context.expect(options.policy?.windowMs).toBe(10);
  context.expect(await client.observe({ id: 'resource-1', externalRef: 'ref-1' })).toMatchObject({ end: 'cancelled', lastState: 'pending' });
  await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints: ['public-type-contract'] }), 'payment-evidence');
});
