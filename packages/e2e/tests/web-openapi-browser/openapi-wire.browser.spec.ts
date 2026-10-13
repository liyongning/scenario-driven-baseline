import type { RestOperation } from '@daqian/template-openapi';
import * as generatedOperations from '@daqian/template-openapi/generated/operations';
import { defineCase } from '../../src/cases/define-case.ts';
import type { ProtocolHost } from '../../src/hosts/protocol-host.ts';
import { waitForCalls } from '../../src/harness.ts';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';
import { browserCancelEvent } from '../../../openapi/testing/browser-runner.ts';
import {
  runBrowserPlan,
  runBrowserPlanWithCancel,
  useBrowserDriver,
  type BrowserPlan,
} from './browser-case-support.ts';
import { accessIdentity, operatorIdentity, securitySchemes } from './openapi-wire.ts';
import { withProtocolHost } from './openapi-wire-support.ts';
import {
  assertMatrixObligations,
  matrixCaseCovers,
  matrixObligationKeys,
  matrixPlan,
  matrixScenario,
} from './openapi-obligation-matrix.ts';

const root = process.cwd();
const driver = useBrowserDriver();
const requestIdPattern = '^\\d{8}_\\d{6}_\\d{3}_[a-z]{6}$';
const operations = Object.fromEntries(
  Object.values(generatedOperations).map((operation) => [operation.meta.id, operation]),
) as Readonly<Record<string, RestOperation>>;
const { cancelTrade, createTrade, getTrade, listTrades } = generatedOperations;
const inventory = await buildContractInventory(root);
const matrixOperations = Object.fromEntries(
  inventory.methods
    .filter((method) => method.name in operations)
    .map((method) => [method.name, operations[method.name]!]),
) as Readonly<Record<string, RestOperation>>;

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-007',
    caseId: 'envelope-results-wire',
    fixtureCase: 'envelope-results-wire',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-007',
        caseKey: 'envelope-results-wire',
        checks: [
          'success-result',
          'business-failure-result',
          'http-status-result',
          'invalid-envelope-result',
          'no-throw',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await withProtocolHost(
      routesFromOpenApiOperations([createTrade], [createTrade]),
      {
        createTrade: {
          expectedRequests: Array.from({ length: 4 }, () => ({ recordOnly: true })),
          steps: [
            {
              body: {
                code: 0,
                message: 'ok',
                data: { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1 },
              },
            },
            {
              body: {
                code: 40901,
                message: 'conflict',
                data: { trade_no: 'T-1', conflict_code: 'STATE_CHANGED' },
              },
            },
            {
              status: 500,
              body: { code: 0, message: 'ok', data: {} },
              malformed: { reason: '契约未声明 500 响应 schema' },
            },
            { body: { not: 'an envelope' }, malformed: { reason: '故意构造非法信封' } },
          ],
        },
      },
      async (host, server) => {
        const results = await run(host, [
          createTradeStep(),
          createTradeStep(),
          createTradeStep(),
          createTradeStep(),
        ]);
        await checkpoint('success-result', () =>
          expect(results[0]).toEqual({
            kind: 'success',
            data: { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1 },
          }),
        );
        await checkpoint('business-failure-result', () =>
          expect(results[1]).toEqual({
            kind: 'business-failure',
            code: 40901,
            message: 'conflict',
            data: { trade_no: 'T-1', conflict_code: 'STATE_CHANGED' },
          }),
        );
        await checkpoint('http-status-result', () =>
          expect(results[2]).toEqual({ kind: 'transport-failure', reason: 'HTTP_STATUS' }),
        );
        await checkpoint('invalid-envelope-result', () =>
          expect(results[3]).toEqual({ kind: 'transport-failure', reason: 'INVALID_ENVELOPE' }),
        );
        await checkpoint('no-throw', () => {
          expect(results).toHaveLength(4);
          expect(server.records()).toHaveLength(4);
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-009',
    caseId: 'path-params-wire',
    fixtureCase: 'path-params-wire',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-009',
        caseKey: 'path-params-wire',
        checks: ['path-encoded', 'multi-params', 'missing-param-codec-error'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await withProtocolHost(
      routesFromOpenApiOperations([getTrade, listTrades], [getTrade, listTrades]),
      {
        getTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
        },
        listTrades: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ body: { code: 0, message: 'ok', data: { items: [trade()] } } }],
        },
      },
      async (host, server) => {
        const results = await run(host, [
          { method: 'getTrade', input: { path: { trade_no: 'T/测试 1' } } },
          { method: 'listTrades', input: { path: { merchant_id: 1001 } } },
          { method: 'getTrade', input: { path: {} } },
        ]);
        await checkpoint('path-encoded', () => {
          expect(results[0]?.kind).toBe('success');
          expect(server.records()[0]?.path).toContain('T%2F%E6%B5%8B%E8%AF%95%201');
        });
        await checkpoint('multi-params', () => {
          expect(results[1]?.kind).toBe('success');
          expect(server.records()[1]?.path).toBe('/api/v1/merchants/1001/trades');
        });
        await checkpoint('missing-param-codec-error', () => {
          expect(results[2]).toEqual({ kind: 'transport-failure', reason: 'CODEC_ERROR' });
          expect(server.records()).toHaveLength(2);
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-010',
    caseId: 'identity-wire',
    fixtureCase: 'identity-wire',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-010',
        caseKey: 'identity-wire',
        checks: [
          'header-name-from-scheme',
          'anonymous-no-identity',
          'empty-token-rejected',
          'scheme-mismatch-rejected',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await withProtocolHost(
      routesFromOpenApiOperations(
        [getTrade, cancelTrade, listTrades],
        [getTrade, cancelTrade, listTrades],
      ),
      {
        getTrade: {
          expectedRequests: [{ recordOnly: true, headers: { 'x-access-token': 'fixture-token' } }],
          steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
        },
        cancelTrade: {
          expectedRequests: [
            { recordOnly: true, headers: { 'x-operator-token': 'operator-token' } },
          ],
          steps: [{ body: { code: 0, message: 'ok', data: {} } }],
        },
        listTrades: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ body: { code: 0, message: 'ok', data: { items: [] } } }],
        },
      },
      async (host, server) => {
        const requests = await Promise.all([
          run(host, [{ method: 'getTrade', input: { path: { trade_no: 'T-1' } } }], {
            identity: accessIdentity,
          }),
          run(host, [{ method: 'cancelTrade', input: { path: { trade_no: 'T-1' }, body: {} } }], {
            identity: operatorIdentity,
          }),
          run(host, [{ method: 'listTrades', input: { path: { merchant_id: 1001 } } }], {
            identity: undefined,
          }),
          run(host, [{ method: 'getTrade', input: { path: { trade_no: 'T-1' } } }], {
            identity: undefined,
          }),
          run(host, [{ method: 'getTrade', input: { path: { trade_no: 'T-1' } } }], {
            identity: { scheme: 'accessToken', token: ' ' },
          }),
          run(host, [{ method: 'getTrade', input: { path: { trade_no: 'T-1' } } }], {
            identity: operatorIdentity,
          }),
        ]);
        await checkpoint('header-name-from-scheme', () => {
          expect(
            server.records().find((record) => record.headers['x-access-token'] === 'fixture-token'),
          ).toBeDefined();
          expect(
            server
              .records()
              .find((record) => record.headers['x-operator-token'] === 'operator-token'),
          ).toBeDefined();
        });
        await checkpoint('anonymous-no-identity', () => {
          const headers =
            server.records().find((record) => record.methodName === 'listTrades')?.headers ?? {};
          expect(headers['x-access-token']).toBeUndefined();
          expect(headers['x-operator-token']).toBeUndefined();
        });
        await checkpoint('empty-token-rejected', () => {
          expect(requests[3]).toEqual([
            { kind: 'transport-failure', reason: 'EMPTY_ACCESS_TOKEN' },
          ]);
          expect(requests[4]).toEqual([
            { kind: 'transport-failure', reason: 'EMPTY_ACCESS_TOKEN' },
          ]);
          expect(server.records()).toHaveLength(3);
        });
        await checkpoint('scheme-mismatch-rejected', () => {
          expect(requests[5]).toEqual([
            { kind: 'transport-failure', reason: 'HOST_CONTEXT_ERROR' },
          ]);
          expect(server.records()).toHaveLength(3);
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-011',
    caseId: 'method-wire',
    fixtureCase: 'method-wire',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-011',
        caseKey: 'method-wire',
        checks: ['method-from-meta'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await withProtocolHost(
      routesFromOpenApiOperations([createTrade, getTrade], [createTrade, getTrade]),
      {
        createTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
        },
        getTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
        },
      },
      async (host, server) => {
        const results = await run(host, [
          createTradeStep(),
          { method: 'getTrade', input: { path: { trade_no: 'T-1' } } },
        ]);
        await checkpoint('method-from-meta', () => {
          expect(results.map((item) => item.kind)).toEqual(['success', 'success']);
          expect(server.records().map((record) => record.methodName)).toEqual([
            'createTrade',
            'getTrade',
          ]);
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-012',
    caseId: 'request-id-wire',
    fixtureCase: 'request-id-wire',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-012',
        caseKey: 'request-id-wire',
        checks: ['header-format', 'fresh-per-request', 'no-basereq-requirement'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await withProtocolHost(
      routesFromOpenApiOperations([createTrade], [createTrade]),
      {
        createTrade: {
          expectedRequests: Array.from({ length: 2 }, () => ({
            recordOnly: true,
            headerPatterns: { 'x-request-id': requestIdPattern },
          })),
          steps: Array.from({ length: 2 }, () => ({
            body: { code: 0, message: 'ok', data: trade() },
          })),
        },
      },
      async (host, server) => {
        await run(host, [createTradeStep(), createTradeStep()]);
        const records = server.records();
        const header = (index: number) => String(records[index]?.headers['x-request-id'] ?? '');
        await checkpoint('header-format', () => {
          expect(header(0)).toMatch(new RegExp(requestIdPattern));
          expect(header(1)).toMatch(new RegExp(requestIdPattern));
          expect(records.every((record) => record.headers.request_id === undefined)).toBe(true);
          expect(server.verify()).toEqual([]);
        });
        await checkpoint('fresh-per-request', () => expect(header(0)).not.toBe(header(1)));
        await checkpoint('no-basereq-requirement', () => {
          expect(records[0]?.rawBody).toEqual({ merchant_id: 1001, amount: 1, channel: 'WEB' });
          expect(records[0]?.rawBody).not.toHaveProperty('baseReq');
        });
      },
    );
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-014',
    caseId: 'transport-failure-wire',
    fixtureCase: 'transport-failure-wire',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-014',
        caseKey: 'transport-failure-wire',
        checks: ['network-error', 'timeout', 'cancelled', 'single-delivery'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await withProtocolHost(
      routesFromOpenApiOperations([createTrade], [createTrade]),
      {
        createTrade: {
          expectedRequests: Array.from({ length: 3 }, () => ({ recordOnly: true })),
          steps: [
            { partialThenDisconnect: true },
            { delayMs: 500, body: { code: 0, message: 'late', data: trade() } },
            { delayMs: 500, body: { code: 0, message: 'late', data: trade() } },
          ],
        },
      },
      async (host, server) => {
        const initial = await run(
          host,
          [createTradeStep(), { ...createTradeStep(), timeoutMs: 250 }],
          { timeoutMs: 5_000 },
        );
        const cancelled = await runBrowserPlanWithCancel(
          driver,
          host,
          [{ ...createTradeStep(), cancel: 'in-flight' }],
          browserOptions(host),
          () =>
            waitForCalls(
              () => server.records(),
              (items) => items.length >= 3,
              { timeoutMs: 5_000, intervalMs: 20 },
            ).then(() => undefined),
          browserCancelEvent,
        );
        const results = [...initial, ...cancelled];
        await checkpoint('network-error', () =>
          expect(results[0]).toEqual({ kind: 'transport-failure', reason: 'NETWORK_ERROR' }),
        );
        await checkpoint('timeout', () =>
          expect(results[1]).toEqual({ kind: 'transport-failure', reason: 'TIMEOUT' }),
        );
        await checkpoint('cancelled', () =>
          expect(results[2]).toEqual({ kind: 'transport-failure', reason: 'CANCELLED' }),
        );
        await checkpoint('single-delivery', () => {
          expect(results).toHaveLength(3);
          expect(server.records()).toHaveLength(3);
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-021',
    caseId: 'openapi-matrix',
    fixtureCase: 'openapi-matrix',
    environment: 'browser',
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
    await withProtocolHost(
      routesFromOpenApiOperations(selected, Object.values(operations)),
      matrixScenario(matrixOperations),
      async (host, server) => {
        const results = await run(host, matrixPlan(matrixOperations), { timeoutMs: 5_000 });
        const covered = await assertMatrixObligations({
          inventory,
          operations: matrixOperations,
          results,
          records: server.records(),
          expect,
          checkpoint,
        });
        await checkpoint('obligations-covered', () => {
          expect(expectedKeys.length).toBeGreaterThan(0);
          expect(covered).toEqual(expectedKeys);
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
              .every(
                (record) => record.methodName !== null && record.methodName in matrixOperations,
              ),
          ).toBe(true);
          expect(server.verify()).toEqual([]);
        });
        await checkpoint('matrix-iterates-declaration', () => {
          expect(selected.map((operation) => operation.meta.id)).toEqual(
            inventory.methods
              .map((method) => method.name)
              .filter((name) => name in matrixOperations),
          );
          expect(Object.keys(matrixOperations).sort()).toEqual(
            inventory.methods
              .map((method) => method.name)
              .filter((name) => name in operations)
              .sort(),
          );
        });
      },
    );
  },
  { timeoutMs: 60_000 },
);

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-028',
    caseId: 'fetch-adapter-wire',
    fixtureCase: 'fetch-adapter-wire',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-028',
        caseKey: 'fetch-adapter-wire',
        checks: ['no-replay', 'request-options'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await withProtocolHost(
      routesFromOpenApiOperations([createTrade], [createTrade]),
      {
        createTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
        },
      },
      async (host, server) => {
        const options = await driver.runCase({}, async ({ page }) => {
          await page.addInitScript(() => {
            const original = window.fetch;
            const state = window as unknown as { __fetchOptions: unknown[] };
            state.__fetchOptions = [];
            window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
              state.__fetchOptions.push({ credentials: init?.credentials, cache: init?.cache });
              return original(input, init);
            }) as typeof window.fetch;
          });
          await runBrowserPlan(page, host, [createTradeStep()], browserOptions(host));
          return page.evaluate(
            () => (window as unknown as { __fetchOptions: unknown[] }).__fetchOptions,
          );
        });
        await checkpoint('no-replay', () => {
          expect(server.records()).toHaveLength(1);
          expect(server.verify()).toEqual([]);
        });
        await checkpoint('request-options', () => {
          expect(options).toContainEqual({ credentials: 'same-origin', cache: 'no-store' });
        });
      },
    );
  },
  { timeoutMs: 30_000 },
);

async function run(
  host: ProtocolHost,
  plan: BrowserPlan,
  options: Readonly<Record<string, unknown>> = {},
) {
  return driver.runCase({}, ({ page }) =>
    runBrowserPlan(page, host, plan, { ...browserOptions(host), ...options }),
  );
}

function browserOptions(host: ProtocolHost) {
  return {
    gatewayBaseUrl: `${host.url.replace(/\/$/, '')}/__shadow`,
    securitySchemes,
    identity: accessIdentity,
  };
}

function createTradeStep() {
  return {
    method: 'createTrade',
    input: { body: { merchant_id: 1001, amount: 1, channel: 'WEB' } },
  } as const;
}

function trade() {
  return { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 };
}
