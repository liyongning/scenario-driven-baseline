import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('SCN-TEMPLATE-EXAMPLE-007 core-neutrality', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-007', caseId: 'core-neutrality', environment: 'integration', fixtureCase: 'core-neutrality',
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-007', caseKey: 'core-neutrality', checks: ['core-neutral'] }],
} } }, async context => {
  const before = context.expect.getState().assertionCalls;
  const root = process.cwd();
  const core = readFileSync(resolve(root, 'packages/payment-sdk/src/example/core/client.ts'), 'utf8');
  const ports = readFileSync(resolve(root, 'packages/payment-sdk/src/example/ports/backend.ts'), 'utf8');
  expect(core).not.toMatch(/TradeStatus|CreateTrade|QueryTrade|GoodsType|generated/);
  const imports = [...core.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]);
  expect(imports).toEqual(expect.arrayContaining(['../contracts', '../ports/backend', '@daqian/payment-protocol']));
  expect(imports?.every(path => path === '../contracts' || path === '../ports/backend' || path === '@daqian/payment-protocol')).toBe(true);
  expect(ports).not.toMatch(/TradeStatus|CreateTrade|QueryTrade|GoodsType|generated|\bwx\b/);
  await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints: ['core-neutral'] }), 'payment-evidence');
});
