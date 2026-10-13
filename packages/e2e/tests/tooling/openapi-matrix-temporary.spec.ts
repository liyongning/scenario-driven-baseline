import * as openapi from '@daqian/template-openapi';
import { createFetchHttp, createRestClient } from '@daqian/template-openapi';
import type { Cancellation, RestOperation } from '@daqian/template-openapi';
import { createShadowServer } from '@template-test/shadow';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';
import {
  assertMatrixObligations,
  matrixCaseCovers,
  matrixObligationKeys,
  matrixPlan,
  matrixScenario,
} from '../web-openapi-browser/openapi-obligation-matrix.ts';
import { runOpenApiMatrix, type OpenApiMatrixPlan } from '../web-openapi-browser/openapi-matrix.ts';
import { accessIdentity, securitySchemes } from '../web-openapi-browser/openapi-wire.ts';
import { openApiFixtureRoot } from './openapi-fixture.ts';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { repositoryRoot } from './helpers.ts';

function asOperation(value: unknown): RestOperation | undefined {
  if (value === null || typeof value !== 'object' || !('meta' in value)) return undefined;
  const meta = (value as { meta?: { id?: unknown } }).meta;
  return typeof meta?.id === 'string' ? (value as RestOperation) : undefined;
}

const inventory = await buildContractInventory(repositoryRoot);
const available = Object.fromEntries(
  Object.values(openapi).flatMap((value) => {
    const operation = asOperation(value);
    return operation ? [[operation.meta.id, operation] as const] : [];
  }),
) as Readonly<Record<string, RestOperation>>;
const matrixOperations = Object.fromEntries(
  inventory.methods
    .filter((method) => method.name in available)
    .map((method) => [method.name, available[method.name]!]),
) as Readonly<Record<string, RestOperation>>;

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-021',
    caseId: 'openapi-matrix',
    fixtureCase: 'openapi-matrix',
    environment: 'integration',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-021',
        caseKey: 'openapi-matrix',
        checks: ['obligations-covered', 'real-client-path', 'matrix-iterates-declaration'],
      },
      ...matrixCaseCovers(inventory, matrixOperations),
    ],
  },
  async ({ checkpoint, expect }) => {
    const selected = Object.values(matrixOperations);
    const expectedKeys = matrixObligationKeys(inventory, matrixOperations);
    const server = await createShadowServer({
      routes: routesFromOpenApiOperations(selected, Object.values(available)),
      environmentClass: 'integration',
      scenarios: [{ id: 'openapi-matrix', routes: matrixScenario(matrixOperations) as never }],
    }).start();
    try {
      const client = createRestClient({
        gatewayBaseUrl: server.url,
        http: createFetchHttp(),
        securitySchemes,
        identity: accessIdentity,
      });
      const results = [];
      for (const step of matrixPlan(matrixOperations)) {
        const cancellation = cancellationSource(step.cancel === 'before-send');
        results.push(
          await client.request(matrixOperations[step.method]!, step.input, {
            deadlineAtMs: Date.now() + (step.timeoutMs ?? 5_000),
            cancellation: cancellation.port,
          }),
        );
      }
      const covered = await assertMatrixObligations({
        inventory,
        operations: matrixOperations,
        results,
        records: server.records(),
        expect,
        checkpoint,
      });
      await checkpoint('obligations-covered', () => {
        expect(covered).toEqual(expectedKeys);
        if (selected.length === 0) expect(expectedKeys).toEqual([]);
        else expect(expectedKeys.length).toBeGreaterThan(0);
      });
      await checkpoint('real-client-path', () => {
        expect(server.records()).toHaveLength(
          Object.values(matrixOperations).reduce(
            (count, operation) => count + (operation.meta.codes?.length ?? 0) + 4,
            0,
          ),
        );
        expect(
          server
            .records()
            .every((record) => record.methodName !== null && record.methodName in matrixOperations),
        ).toBe(true);
        expect(server.verify()).toEqual([]);
      });
      await checkpoint('matrix-iterates-declaration', () => {
        expect(selected.map((operation) => operation.meta.id)).toEqual(
          inventory.methods.map((method) => method.name).filter((name) => name in matrixOperations),
        );
      });
    } finally {
      await server.close();
    }
  },
  { timeoutMs: 60_000 },
);

cliEvidence(
  'SCN-OPENAPI-CONTRACT-017',
  'derive-obligations-gate',
  ['obligation-kinds', 'obligation-id-format', 'environments-by-binding'],
  async (context, check) => {
    const obligations = inventory.obligations.filter((item) => item.id.startsWith('trade.v1.'));
    await check('obligation-kinds', async () => {
      const categories = new Set(obligations.map((item) => item.id.split('#')[1]));
      if (obligations.length === 0) context.expect(categories.size).toBe(0);
      else {
        context.expect(obligations.length).toBeGreaterThan(0);
        for (const category of [
          'route',
          'identity',
          'request-headers',
          'request-fields',
          'envelope',
          'business-code',
          'transport-failure',
          'presence',
        ])
          context.expect(categories).toContain(category);
      }
      const fixture = openApiFixtureRoot({
        declaration: [
          "import { createTrade } from '@daqian/template-openapi/generated/operations';",
          "export const consumedOperations = [{ method: createTrade, requestFields: { 'body.unknown': { cases: ['mapped-value'], authority: 'fixture' } } }];",
          'void createTrade;',
        ].join('\n'),
      });
      try {
        const negative = await buildContractInventory(fixture.root);
        context.expect(negative.issues.join('\n')).toContain('body.unknown');
      } finally {
        fixture.cleanup();
      }
    });
    await check('obligation-id-format', () => {
      if (obligations.length === 0) context.expect(obligations).toEqual([]);
      context
        .expect(
          obligations.every((item) => /^trade\.v1\.[A-Za-z][A-Za-z0-9]*#[^#]+#/.test(item.id)),
        )
        .toBe(true);
    });
    await check('environments-by-binding', () => {
      if (obligations.length === 0) context.expect(obligations).toEqual([]);
      for (const obligation of obligations) {
        context.expect(obligation.requiredIn).toContain('integration');
        context.expect(obligation.requiredIn).toContain('browser');
        context.expect(obligation.requiredIn).not.toContain('weapp');
      }
    });
  },
);

function cancellationSource(stopped = false) {
  let cancelled = stopped;
  const listeners = new Set<() => void>();
  const port: Cancellation = {
    isStopped: () => cancelled,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    cancel() {
      cancelled = true;
      for (const listener of [...listeners]) listener();
    },
  };
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
        operations: Object.values(openapi).flatMap((value) => {
          const operation = asOperation(value);
          return operation ? [operation] : [];
        }),
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
