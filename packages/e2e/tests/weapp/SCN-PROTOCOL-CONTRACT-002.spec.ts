// @SCN-PROTOCOL-CONTRACT-002: 示例协议义务在真实 wx.request 上逐项取证。
import automator from 'miniprogram-automator';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { CreateTradeResponse, QueryTradeResponse } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { createShadowServer, discoverExampleRoutes, type RunningShadowServer } from '@payment-test/protocol';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { runWeappFunction } from '../../src/drivers/weapp.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const projectPath = new URL('../../host/weapp', import.meta.url).pathname;
const cliPath = process.env.WECHAT_DEVTOOLS_CLI_PATH ?? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const inventory = await buildContractInventory(repositoryRoot);
const routes = discoverExampleRoutes();
const running = new Set<RunningShadowServer>();
afterEach(async () => { await Promise.all([...running].map(server => server.close())); running.clear(); });

type MethodName = 'CreateTrade' | 'QueryTrade';
const methods = ['CreateTrade', 'QueryTrade'] as const;
type MatrixFixture = Readonly<Record<'create' | 'query', Readonly<{
  request: Record<string, unknown>;
  responses: Record<string, unknown>[];
}>>>;
type ProtocolResult = Readonly<{ ok: boolean; httpStatus?: number; wire?: Record<string, unknown>; decodedProjection?: Record<string, unknown>; code?: string }>;
type MethodSuite = Readonly<{
  matrix: ProtocolResult[];
  response: Record<'success' | 'business' | 'http' | 'malformed', ProtocolResult>;
  errors: Record<string, ProtocolResult>;
  timeouts: Record<string, ProtocolResult>;
}>;
type SuiteResult = Readonly<{ suites: Record<MethodName, MethodSuite> }>;

const camel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const entryOf = (fixture: MatrixFixture, method: MethodName) => fixture[method === 'CreateTrade' ? 'create' : 'query'];
const inputBody = (fixture: MatrixFixture, method: MethodName) => {
  const value = structuredClone(entryOf(fixture, method).request);
  delete value.baseReq;
  return value;
};
const expectedBody = (fixture: MatrixFixture, method: MethodName, sparse = false) => {
  const value = structuredClone(entryOf(fixture, method).request);
  if (sparse) delete (value.baseReq as Record<string, unknown>).productId;
  return value;
};
function valueAt(root: unknown, path: string): unknown {
  let value = root;
  for (const part of path.split('.').map(camel)) {
    if (Array.isArray(value)) value = value[0];
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  }
  return value;
}
function serializable(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializable(child)]));
  return value;
}
const decodedAt = (root: unknown, path: string) => serializable(valueAt(root, path));
function encodingMatches(caseKey: string, value: unknown): boolean {
  if (caseKey.endsWith('json-string') || caseKey.endsWith('json-int64-string') || caseKey.endsWith('enum-name')) return typeof value === 'string';
  if (caseKey.endsWith('json-number')) return typeof value === 'number';
  if (caseKey.endsWith('json-boolean')) return typeof value === 'boolean';
  if (caseKey.endsWith('repeated-array')) return Array.isArray(value);
  if (caseKey.endsWith('nested-object') || caseKey.endsWith('oneof-object') || caseKey.endsWith('string-map')) return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return true;
}

const success = { baseResp: { success: true, statusCode: '0' } };
const business = { baseResp: { success: false, statusCode: '123', statusMsg: 'matrix-business' } };

defineCase({
  ownerId: 'SCN-PROTOCOL-CONTRACT-002', caseId: 'protocol-matrix', fixtureCase: 'protocol-matrix', environment: 'weapp',
  covers: [
    { id: 'SCN-PROTOCOL-CONTRACT-002', caseKey: 'protocol-matrix', checks: ['obligations-covered', 'real-client-path'] },
    ...inventory.obligations
      .filter(item => item.id.startsWith('infra.trade.v1.'))
      .flatMap(item => item.cases.map(caseKey => ({ id: item.id, caseKey, checks: [`${item.id}/${caseKey}`] }))),
  ],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as MatrixFixture;
  const covered = new Set<string>();
  const planned = methods.map(method => {
    const responses = entryOf(fixture, method).responses;
    return {
      method,
      request: inputBody(fixture, method),
      sparseRequest: inputBody(fixture, method),
      responseCount: responses.length,
      responsePaths: inventory.discoveries
        .filter(item => item.method === method && item.direction === 'response' && item.applicability === 'applicable')
        .map(item => item.path),
      expectedRequests: [
        ...responses.map(() => ({ body: expectedBody(fixture, method) })),
        { body: expectedBody(fixture, method, true) },
        ...Array.from({ length: 6 }, () => ({ body: expectedBody(fixture, method) })),
      ],
      steps: [
        ...responses.map(body => ({ body })),
        { body: {} }, { body: success }, { body: business }, { status: 503, body: business },
        { rawBody: '{', contentType: 'application/json' }, { delayMs: 30, body: {} }, { disconnect: true },
      ],
    };
  });
  const server = await createShadowServer({
    routes,
    scenarios: [{ id: 'weapp-protocol-matrix', routes: Object.fromEntries(planned.map(item => [item.method, { expectedRequests: item.expectedRequests, steps: item.steps }])) }],
  }).start();
  running.add(server);
  const result = await runWeappFunction({
    automator, projectPath, cliPath, functionName: 'runProtocolSuite',
    args: {
      gatewayBaseUrl: server.url, accessToken: 'fixture-token', requestId: 'matrix-request', productId: 'matrix-product', timeoutMs: 10_000,
      methods: planned.map(item => ({ method: item.method, request: item.request, sparseRequest: item.sparseRequest, responseCount: item.responseCount, responsePaths: item.responsePaths })),
    },
  }) as SuiteResult;
  expect(server.verify()).toEqual([]);
  const records = server.records();

  for (const method of methods) {
    const suite = result.suites[method];
    const responses = entryOf(fixture, method).responses;
    const methodRecords = records.filter(record => record.methodName === method);
    const richRecord = methodRecords[0]!;
    const sparseRecord = methodRecords[responses.length]!;
    const responseCodec = method === 'CreateTrade' ? CreateTradeResponse : QueryTradeResponse;
    const emptyDecoded = responseCodec.fromJSON({});
    const obligations = inventory.obligations.filter(item => item.id.startsWith(`infra.trade.v1.${method}#`));

    for (const obligation of obligations) {
      const match = obligation.id.match(/#([^#]+)#(.+)$/)!;
      const category = match[1]!;
      const path = match[2]!;
      for (const caseKey of obligation.cases) {
        covered.add(`${obligation.id}/${caseKey}`);
        await checkpoint(`${obligation.id}/${caseKey}`, () => {
          if (category === 'http-route') {
            expect(methodRecords.every(record => record.methodName === method)).toBe(true);
            return;
          }
          if (category === 'request-mapping') {
            const actual = valueAt(caseKey === 'omitted' ? sparseRecord.rawBody : richRecord.rawBody, path);
            if (caseKey === 'omitted') expect(actual).toBeUndefined();
            else expect(actual).toBeDefined();
            return;
          }
          if (category === 'header-base-req') {
            const omitted = caseKey.endsWith('omitted');
            const record = omitted ? sparseRecord : richRecord;
            const facts: Record<string, boolean> = {
              authorization: record.headers.authorization === 'Bearer fixture-token',
              'content-type': String(record.headers['content-type']).startsWith('application/json'),
              'x-product-id-configured': record.headers['x-product-id'] === 'matrix-product',
              'x-product-id-omitted': record.headers['x-product-id'] === undefined,
              'request-id-header': record.headers.request_id === 'matrix-request',
              'base-req-request-id': valueAt(record.rawBody, 'base_req.request_id') === 'matrix-request',
              'base-req-product-id-configured': valueAt(record.rawBody, 'base_req.product_id') === 'matrix-product',
              'base-req-product-id-omitted': valueAt(record.rawBody, 'base_req.product_id') === undefined,
              'lane-configured': record.headers.lane === 'matrix-lane',
              'lane-omitted': record.headers.lane === undefined,
              'app-version-configured': record.headers.app_version === '1.2.3',
              'app-version-omitted': record.headers.app_version === undefined,
            };
            expect(facts[caseKey]).toBe(true);
            return;
          }
          if (category === 'response-mapping' || (category === 'encoding-boundary' && path.startsWith('response.'))) {
            const responsePath = category === 'response-mapping' ? path : path.slice('response.'.length);
            const rich = suite.matrix[0]!;
            const absent = suite.matrix.at(-1)!;
            if (caseKey === 'wire-absent' || caseKey.endsWith('optional-absence') || caseKey.endsWith('oneof-absence')) {
              expect(valueAt(absent.wire, responsePath)).toBeUndefined();
            } else if (caseKey === 'decoded-absence') {
              expect(absent.decodedProjection?.[responsePath]).toBeUndefined();
            } else if (caseKey === 'decoded-default') {
              expect(absent.decodedProjection?.[responsePath]).toEqual(decodedAt(emptyDecoded, responsePath));
            } else if (caseKey.startsWith('response-')) {
              expect(encodingMatches(caseKey, valueAt(rich.wire, responsePath))).toBe(true);
            } else if (caseKey === 'decoded-value' || caseKey === 'decoded-branch') {
              expect(rich.decodedProjection?.[responsePath]).toEqual(decodedAt(responseCodec.fromJSON(responses[0]), responsePath));
              expect(rich.decodedProjection?.[responsePath]).toBeDefined();
            } else {
              expect(valueAt(rich.wire, responsePath)).toBeDefined();
            }
            return;
          }
          if (category === 'encoding-boundary') {
            const requestPath = path.slice('request.'.length);
            const actual = valueAt(caseKey.endsWith('absent') ? sparseRecord.rawBody : richRecord.rawBody, requestPath);
            if (caseKey.endsWith('absent')) expect(actual).toBeUndefined();
            else expect(encodingMatches(caseKey, actual)).toBe(true);
            return;
          }
          const map: Record<string, boolean> = {
            'response-handling/success': Boolean(suite.response.success.ok && suite.response.success.httpStatus === 200),
            'response-handling/business-error': Boolean(suite.response.business.ok && valueAt(suite.response.business.wire, 'base_resp.status_code') === '123'),
            'response-handling/http-error': Boolean(suite.response.http.ok && suite.response.http.httpStatus === 503),
            'response-handling/malformed-body': suite.response.malformed.code === 'CODEC_ERROR',
            'error-handling/empty-access-token': suite.errors.emptyToken?.code === 'EMPTY_ACCESS_TOKEN',
            'error-handling/host-context-error': suite.errors.hostError?.code === 'HOST_CONTEXT_ERROR',
            'error-handling/network-error': suite.errors.network?.code === 'NETWORK_ERROR',
            'error-handling/cancelled': suite.errors.cancelled?.code === 'CANCELLED',
            'error-handling/codec-error': suite.errors.codecError?.code === 'CODEC_ERROR',
            'timeout/deadline-before-context': suite.timeouts.beforeContext?.code === 'TIMEOUT',
            'timeout/provider-timeout': suite.timeouts.providerTimeout?.code === 'TIMEOUT',
            'timeout/deadline-before-send': suite.timeouts.beforeSend?.code === 'TIMEOUT',
            'timeout/in-flight-timeout': suite.timeouts.inFlight?.code === 'TIMEOUT',
            'timeout/late-result-isolated': suite.timeouts.late?.code === 'TIMEOUT',
          };
          expect(map[`${category}/${caseKey}`], `${method}/${category}/${caseKey}`).toBe(true);
        });
      }
    }
  }

  await checkpoint('obligations-covered', () => {
    const derived = inventory.obligations
      .filter(item => item.id.startsWith('infra.trade.v1.'))
      .flatMap(item => item.cases.map(caseKey => `${item.id}/${caseKey}`));
    expect(derived.length).toBeGreaterThan(0);
    expect(covered.size).toBe(derived.length);
  });

  await checkpoint('real-client-path', () => {
    for (const method of methods) {
      expect(records.filter(record => record.methodName === method).length).toBe(entryOf(fixture, method).responses.length + 7);
    }
    expect(result.suites.CreateTrade.matrix.every(item => item.ok)).toBe(true);
    expect(result.suites.QueryTrade.matrix.every(item => item.ok)).toBe(true);
  });
}, { fixtureRoot });
