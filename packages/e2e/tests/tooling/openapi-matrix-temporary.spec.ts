import { expect, test } from 'vitest';
import * as openapi from '@daqian/template-openapi';
import type { RestOperation } from '@daqian/template-openapi';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { runOpenApiMatrix, type OpenApiMatrixPlan } from '../web-openapi-browser/openapi-matrix.ts';
import { accessIdentity, securitySchemes } from '../web-openapi-browser/openapi-wire.ts';
import { openApiFixtureRoot } from './openapi-fixture.ts';

function isOperation(value: unknown): value is RestOperation {
  return (
    value !== null &&
    typeof value === 'object' &&
    'meta' in value &&
    typeof (value as { meta?: { id?: unknown } }).meta?.id === 'string'
  );
}

test(
  'OpenAPI matrix executes declarations from a controlled web product',
  { timeout: 30_000 },
  async () => {
    const fixture = openApiFixtureRoot({ prefix: 'openapi-matrix-temporary-' });
    try {
      const inventory = await buildContractInventory(fixture.root);
      const methods = inventory.methods.filter((method) =>
        inventory.obligations.some((obligation) =>
          obligation.id.startsWith(`trade.v1.${method.name}#`),
        ),
      );
      const plans = Object.fromEntries(
        methods.map((method) => [
          method.name,
          {
            input: {
              body: { merchant_id: 1001, amount: 1, channel: 'WEB' },
            },
            responses: [
              {
                code: 0,
                message: 'ok',
                data: { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 },
              },
            ],
          } satisfies OpenApiMatrixPlan,
        ]),
      );
      const result = await runOpenApiMatrix({
        methods,
        operations: Object.values(openapi).filter(isOperation) as RestOperation[],
        plans,
        securitySchemes,
        identity: accessIdentity,
      });
      const resolved = import.meta.resolve('@daqian/template-openapi');

      expect(methods.map((method) => method.name)).toEqual(['createTrade']);
      expect(result.methods).toEqual(methods.map((method) => method.name));
      expect(result.results).toEqual([
        { kind: 'success', data: expect.objectContaining({ trade_no: 'T-1' }) },
      ]);
      expect(result.records).toHaveLength(1);
      expect(result.verify).toEqual([]);
      expect(resolved).toContain('/packages/openapi/dist/index.js');
      expect(
        inventory.obligations
          .filter((obligation) => obligation.id.startsWith('trade.v1.createTrade#'))
          .every((obligation) => obligation.requiredIn.includes('integration')),
      ).toBe(true);
    } finally {
      fixture.cleanup();
    }
  },
);
