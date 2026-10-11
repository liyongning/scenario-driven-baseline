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
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-OPENAPI-CONTRACT-021',
        caseId: 'openapi-matrix-empty',
        fixtureCase: 'openapi-matrix-empty',
        environment: 'integration',
        binding: 'web-openapi-browser',
        covers: [
          {
            id: 'SCN-OPENAPI-CONTRACT-021',
            caseKey: 'openapi-matrix-empty',
            checks: ['empty-declaration-matrix'],
          },
        ],
      },
    },
  },
  async () => {
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

      expect(methods).toEqual([]);
      expect(result.methods).toEqual([]);
      expect(result.results).toEqual([]);
      expect(result.records).toEqual([]);
      expect(result.verify).toEqual([]);
      expect(resolved).toContain('/packages/openapi/dist/index.js');
      expect(inventory.obligations).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  },
);
