import * as openapi from '@daqian/template-openapi';
import type { RestOperation } from '@daqian/template-openapi';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { runOpenApiMatrix, type OpenApiMatrixPlan } from '../web-openapi-browser/openapi-matrix.ts';
import { accessIdentity, securitySchemes } from '../web-openapi-browser/openapi-wire.ts';
import { openApiFixtureRoot } from './openapi-fixture.ts';
import { cliEvidence } from './scenario-gate-helpers.ts';

function isOperation(value: unknown): value is RestOperation {
  return (
    value !== null &&
    typeof value === 'object' &&
    'meta' in value &&
    typeof (value as { meta?: { id?: unknown } }).meta?.id === 'string'
  );
}

cliEvidence(
  'SCN-OPENAPI-CONTRACT-021',
  'openapi-matrix-empty',
  ['empty-declaration-matrix'],
  async (context, check) => {
    const fixture = openApiFixtureRoot({
      declaration: 'export const consumedOperations = [] as const;\n',
      prefix: 'openapi-matrix-temporary-',
    });
    try {
      const inventory = await buildContractInventory(fixture.root);
      const methods = inventory.methods.filter((method) =>
        inventory.obligations.some((obligation) =>
          obligation.id.startsWith(`trade.v1.${method.name}#`),
        ),
      );
      const plans = Object.fromEntries(
        methods.map((method) => [method.name, { responses: [] } satisfies OpenApiMatrixPlan]),
      );
      const result = await runOpenApiMatrix({
        methods,
        operations: Object.values(openapi).filter(isOperation) as RestOperation[],
        plans,
        securitySchemes,
        identity: accessIdentity,
      });
      const resolved = import.meta.resolve('@daqian/template-openapi');

      await check('empty-declaration-matrix', () => {
        context.expect(methods).toEqual([]);
        context.expect(result.methods).toEqual([]);
        context.expect(result.results).toEqual([]);
        context.expect(result.records).toEqual([]);
        context.expect(result.verify).toEqual([]);
        context.expect(resolved).toContain('/packages/openapi/dist/index.js');
        context.expect(inventory.obligations).toEqual([]);
      });
    } finally {
      fixture.cleanup();
    }
  },
  { binding: 'web-openapi-browser' },
);
