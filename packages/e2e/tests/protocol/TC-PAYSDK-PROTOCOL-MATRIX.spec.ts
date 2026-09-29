import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { createProtocolClient } from '@daqian/payment-protocol';
import type { HttpPort } from '@daqian/payment-protocol';
import {
  CreateTradePay, CreateTradePayRequest, CreateTradePayResponse,
  QueryTrade, QueryTradeRequest, QueryTradeResponse,
} from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { createShadowServer, type RunningShadowServer } from '@payment-test/protocol';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { createNodeHttpDriver } from '../../src/drivers/node.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const inventory = await buildContractInventory(repositoryRoot);
const running = new Set<RunningShadowServer>();

type MethodName = 'CreateTradePay' | 'QueryTrade';
type MatrixFixture = Readonly<Record<'create' | 'query', Readonly<{
  request: Record<string, unknown>;
  responses: Record<string, unknown>[];
}>>>;
type Result = Awaited<ReturnType<ReturnType<typeof createProtocolClient>['request']>>;

afterEach(async () => {
  await Promise.all([...running].map(server => server.close()));
  running.clear();
});

function camel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function valueAt(root: unknown, path: string): unknown {
  let value = root;
  for (const part of path.split('.').map(camel)) {
    if (Array.isArray(value)) value = value[0];
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  }
  return value;
}

function decodedAt(root: unknown, path: string): unknown {
  const parts = path.split('.').map(camel);
  let value = root;
  for (let index = 0; index < parts.length; index += 1) {
    if (Array.isArray(value)) value = value[0];
    const part = parts[index]!;
    if (part === 'payParams' && index + 1 < parts.length) {
      const branch = parts[index + 1]!;
      value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
      const params = value && typeof value === 'object' ? (value as Record<string, unknown>).params : undefined;
      if (!params || typeof params !== 'object' || (params as Record<string, unknown>).$case !== branch) return undefined;
      value = (params as Record<string, unknown>)[branch];
      index += 1;
      continue;
    }
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  }
  return value;
}

function communicationClient(url: string, configured = true, runtime?: Readonly<{ nowMs: () => number; sleepMs: (ms: number) => Promise<void> }>, token: () => unknown = () => 'fixture-token') {
  return createProtocolClient({
    gatewayBaseUrl: url,
    getAccessToken: token as () => string | null | Promise<string | null>,
    http: createNodeHttpDriver(),
    ...(configured ? { requestContext: { productId: 'matrix-product', lane: 'matrix-lane', appVersion: '1.2.3' } } : {}),
    runtime: {
      nowMs: runtime?.nowMs ?? (() => Date.now()),
      nextRequestId: () => 'matrix-request',
      sleepMs: runtime?.sleepMs ?? (() => new Promise(() => undefined)),
    },
  });
}

function requestBody(fixture: MatrixFixture, method: MethodName, sparse = false) {
  const source = structuredClone(fixture[method === 'CreateTradePay' ? 'create' : 'query'].request);
  delete source.baseReq;
  if (sparse && method === 'CreateTradePay') delete source.xpayEnv;
  return method === 'CreateTradePay' ? CreateTradePayRequest.fromJSON(source) : QueryTradeRequest.fromJSON(source);
}

function expectedBody(fixture: MatrixFixture, method: MethodName, sparse = false) {
  const body = structuredClone(fixture[method === 'CreateTradePay' ? 'create' : 'query'].request);
  if (sparse) {
    const baseReq = body.baseReq as Record<string, unknown>;
    delete baseReq.productId;
    if (method === 'CreateTradePay') delete body.xpayEnv;
  }
  return body;
}

function encodingMatches(caseKey: string, value: unknown): boolean {
  if (caseKey.endsWith('json-string') || caseKey.endsWith('json-int64-string') || caseKey.endsWith('enum-name')) return typeof value === 'string';
  if (caseKey.endsWith('json-number')) return typeof value === 'number';
  if (caseKey.endsWith('json-boolean')) return typeof value === 'boolean';
  if (caseKey.endsWith('repeated-array')) return Array.isArray(value);
  if (caseKey.endsWith('nested-object') || caseKey.endsWith('oneof-object') || caseKey.endsWith('string-map')) return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return true;
}

async function runMatrix(method: MethodName, fixture: MatrixFixture) {
  const entry = fixture[method === 'CreateTradePay' ? 'create' : 'query'];
  const responses = entry.responses;
  const scenario = {
    id: `${method}-matrix`,
    routes: {
      [method]: {
        expectedRequests: [...responses.map(() => ({ body: expectedBody(fixture, method) })), { body: expectedBody(fixture, method, true) }],
        steps: [...responses.map(body => ({ body })), { body: {} }],
      },
    },
  };
  const server = await createShadowServer({ scenarios: [scenario] }).start();
  running.add(server);
  const configured = communicationClient(server.url);
  const meta = method === 'CreateTradePay' ? CreateTradePay.meta : QueryTrade.meta;
  const results: Result[] = [];
  for (let index = 0; index < responses.length; index += 1) {
    results.push(await configured.request(meta as typeof CreateTradePay.meta, requestBody(fixture, method) as CreateTradePayRequest, { deadlineAtMs: Date.now() + 5_000 }));
  }
  results.push(await communicationClient(server.url, false).request(meta as typeof CreateTradePay.meta, requestBody(fixture, method, true) as CreateTradePayRequest, { deadlineAtMs: Date.now() + 5_000 }));
  return { results, records: server.records(), verify: server.verify() };
}

async function runSharedEvidence(method: MethodName, fixture: MatrixFixture): Promise<Record<string, boolean>> {
  const meta = method === 'CreateTradePay' ? CreateTradePay.meta : QueryTrade.meta;
  const request = requestBody(fixture, method);
  const expected = expectedBody(fixture, method);
  const deadline = () => Date.now() + 2_000;
  const requestStep = async (step: Readonly<{ status?: number; body?: unknown; rawBody?: string; delayMs?: number }>) => {
    const server = await createShadowServer({ scenarios: [{
      id: `${method}-shared-${running.size}`,
      routes: { [method]: { expectedRequests: [{ body: expected }], steps: [step] } },
    }] }).start();
    running.add(server);
    return communicationClient(server.url).request(meta as typeof CreateTradePay.meta, request as CreateTradePayRequest, { deadlineAtMs: deadline() });
  };
  const success = await requestStep({ body: { baseResp: { success: true, statusCode: '0' } } });
  const business = await requestStep({ body: { baseResp: { success: false, statusCode: '123', statusMsg: 'matrix-business' } } });
  const httpError = await requestStep({ status: 503, body: { baseResp: { success: false, statusCode: '123' } } });
  const malformed = await requestStep({ rawBody: '{', status: 200 });

  const noSend: HttpPort = { send: async () => { throw new Error('must not send'); } };
  const make = (token: () => unknown, nowMs = () => 0, sleepMs = () => new Promise<void>(() => undefined), http: HttpPort = noSend) => createProtocolClient({
    gatewayBaseUrl: 'http://127.0.0.1:1', getAccessToken: token as () => string | null | Promise<string | null>, http,
    runtime: { nowMs, nextRequestId: () => 'matrix-request', sleepMs },
  });
  const emptyToken = await make(() => '').request(meta as typeof CreateTradePay.meta, request as CreateTradePayRequest, { deadlineAtMs: 10 });
  const hostError = await make(() => { throw new Error('host'); }).request(meta as typeof CreateTradePay.meta, request as CreateTradePayRequest, { deadlineAtMs: 10 });
  const networkError = await make(() => 'token', () => 0, () => new Promise<void>(() => undefined), { send: async () => { throw new Error('network'); } })
    .request(meta as typeof CreateTradePay.meta, request as CreateTradePayRequest, { deadlineAtMs: 10 });
  const cancelled = await make(() => 'token').request(meta as typeof CreateTradePay.meta, request as CreateTradePayRequest, {
    deadlineAtMs: 10, cancellation: { isStopped: () => true, subscribe: () => () => undefined },
  });
  const codecRequest = new Proxy(request as object, { get() { throw new Error('codec'); } }) as CreateTradePayRequest;
  const codecError = await make(() => 'token').request(meta as typeof CreateTradePay.meta, codecRequest, { deadlineAtMs: 10 });

  const beforeContext = await make(() => 'token', () => 10).request(meta as typeof CreateTradePay.meta, request as CreateTradePayRequest, { deadlineAtMs: 10 });
  const providerTimeout = await make(() => new Promise<string>(() => undefined), () => 0, async () => undefined)
    .request(meta as typeof CreateTradePay.meta, request as CreateTradePayRequest, { deadlineAtMs: 10 });
  let currentTime = 0;
  const deadlineRequest = new Proxy(request as object, { get(target, property, receiver) { currentTime = 10; return Reflect.get(target, property, receiver); } }) as CreateTradePayRequest;
  const beforeSend = await make(() => 'token', () => currentTime).request(meta as typeof CreateTradePay.meta, deadlineRequest, { deadlineAtMs: 5 });
  const delayedServer = await createShadowServer({ scenarios: [{
    id: `${method}-in-flight-timeout`,
    routes: { [method]: { expectedRequests: [{ body: expected }], steps: [{ delayMs: 30, body: {} }] } },
  }] }).start();
  running.add(delayedServer);
  const delayed = await communicationClient(delayedServer.url).request(
    meta as typeof CreateTradePay.meta,
    request as CreateTradePayRequest,
    { deadlineAtMs: Date.now() + 5 },
  );
  let resolveLate!: (token: string) => void;
  let sends = 0;
  const lateToken = new Promise<string>(resolve => { resolveLate = resolve; });
  const late = await make(() => lateToken, () => 0, async () => undefined, { send: async () => { sends += 1; return { ok: true, value: { status: 200, headers: {}, body: '{}' } }; } })
    .request(meta as typeof CreateTradePay.meta, request as CreateTradePayRequest, { deadlineAtMs: 10 });
  resolveLate('late-token');
  await Promise.resolve();
  await Promise.resolve();

  const errorCode = (result: Result) => result.ok ? undefined : result.error.code;
  return {
    'response-handling/success': success.ok && success.value.http.status === 200,
    'response-handling/business-error': business.ok && valueAt(business.value.wire, 'base_resp.status_code') === '123',
    'response-handling/http-error': httpError.ok && httpError.value.http.status === 503,
    'response-handling/malformed-body': errorCode(malformed) === 'CODEC_ERROR',
    'error-handling/empty-access-token': errorCode(emptyToken) === 'EMPTY_ACCESS_TOKEN',
    'error-handling/host-context-error': errorCode(hostError) === 'HOST_CONTEXT_ERROR',
    'error-handling/network-error': errorCode(networkError) === 'NETWORK_ERROR',
    'error-handling/cancelled': errorCode(cancelled) === 'CANCELLED',
    'error-handling/codec-error': errorCode(codecError) === 'CODEC_ERROR',
    'timeout/deadline-before-context': errorCode(beforeContext) === 'TIMEOUT',
    'timeout/provider-timeout': errorCode(providerTimeout) === 'TIMEOUT',
    'timeout/deadline-before-send': errorCode(beforeSend) === 'TIMEOUT',
    'timeout/in-flight-timeout': errorCode(delayed) === 'TIMEOUT',
    'timeout/late-result-isolated': errorCode(late) === 'TIMEOUT' && sends === 0,
  };
}

for (const method of ['CreateTradePay', 'QueryTrade'] as const) {
  const obligations = inventory.obligations.filter(item => item.id.startsWith(`infra.trade.v1.${method}#`));
  const covers = obligations.flatMap(item => item.cases.map(caseKey => ({
    id: item.id, caseKey, checks: [`${item.id}/${caseKey}`],
  })));
  defineCase({
    ownerId: 'TC-PAYSDK-CONTRACT-023', caseId: `task8-${method}-matrix`, fixtureCase: 'task8-protocol-matrix', environment: 'integration', covers,
  }, async ({ fixture: value, checkpoint, expect }) => {
    const fixture = value as MatrixFixture;
    const matrix = await runMatrix(method, fixture);
    const shared = await runSharedEvidence(method, fixture);
    expect(matrix.verify).toEqual([]);
    expect(matrix.results.every(result => result.ok)).toBe(true);
    const entry = fixture[method === 'CreateTradePay' ? 'create' : 'query'];
    const richResults = matrix.results.slice(0, entry.responses.length);
    const emptyResult = matrix.results.at(-1)!;
    const richRecord = matrix.records[0]!;
    const sparseRecord = matrix.records.at(-1)!;
    const responseCodec = method === 'CreateTradePay' ? CreateTradePayResponse : QueryTradeResponse;
    const emptyDecoded = responseCodec.fromJSON({});

    for (const obligation of obligations) {
      const match = obligation.id.match(/#([^#]+)#(.+)$/)!;
      const category = match[1]!;
      const path = match[2]!;
      for (const caseKey of obligation.cases) {
        await checkpoint(`${obligation.id}/${caseKey}`, () => {
          if (category === 'http-route') {
            expect(matrix.records.every(record => record.methodName === method)).toBe(true);
            return;
          }
          if (category === 'request-mapping') {
            const targetPath = path === 'user_id' || path === 'xpay_env' ? path : path;
            const record = caseKey === 'omitted' || caseKey === 'query-no-env' ? sparseRecord : richRecord;
            const actual = valueAt(record.rawBody, targetPath);
            if (caseKey === 'omitted' || caseKey === 'query-no-env') expect(actual).toBeUndefined();
            else expect(actual).toBeDefined();
            return;
          }
          if (category === 'header-base-req') {
            const headers = caseKey.endsWith('omitted') ? sparseRecord.headers : richRecord.headers;
            const body = caseKey.endsWith('omitted') ? sparseRecord.rawBody : richRecord.rawBody;
            const facts: Record<string, boolean> = {
              authorization: headers.authorization === 'Bearer fixture-token',
              'content-type': String(headers['content-type']).startsWith('application/json'),
              'x-product-id-configured': headers['x-product-id'] === 'matrix-product',
              'x-product-id-omitted': headers['x-product-id'] === undefined,
              'request-id-header': headers.request_id === 'matrix-request',
              'base-req-request-id': valueAt(body, 'base_req.request_id') === 'matrix-request',
              'base-req-product-id-configured': valueAt(body, 'base_req.product_id') === 'matrix-product',
              'base-req-product-id-omitted': valueAt(body, 'base_req.product_id') === undefined,
              'lane-configured': headers.lane === 'matrix-lane',
              'lane-omitted': headers.lane === undefined,
              'app-version-configured': headers.app_version === '1.2.3',
              'app-version-omitted': headers.app_version === undefined,
              'xpay-env-absent': headers.xpayenv === undefined && headers['xpay-env'] === undefined,
            };
            expect(facts[caseKey]).toBe(true);
            return;
          }
          if (category === 'response-mapping' || category === 'encoding-boundary' && path.startsWith('response.')) {
            const responsePath = category === 'response-mapping' ? path : path.slice('response.'.length);
            const richIndex = responsePath.includes('wechat_jsapi') ? 1 : responsePath.includes('wechat_native') ? 2 : 0;
            const rich = richResults[richIndex]!;
            expect(rich.ok).toBe(true);
            expect(emptyResult.ok).toBe(true);
            if (!rich.ok || !emptyResult.ok) return;
            if (caseKey === 'wire-absent' || caseKey.endsWith('optional-absence') || caseKey.endsWith('oneof-absence')) {
              expect(valueAt(emptyResult.value.wire, responsePath)).toBeUndefined();
            } else if (caseKey === 'decoded-absence') {
              expect(decodedAt(emptyResult.value.data, responsePath)).toBeUndefined();
            } else if (caseKey === 'decoded-default') {
              expect(decodedAt(emptyResult.value.data, responsePath)).toEqual(decodedAt(emptyDecoded, responsePath));
            } else if (caseKey.startsWith('response-')) {
              expect(encodingMatches(caseKey, valueAt(rich.value.wire, responsePath))).toBe(true);
            } else if (caseKey === 'decoded-value' || caseKey === 'decoded-branch') {
              expect(decodedAt(rich.value.data, responsePath)).toEqual(decodedAt(responseCodec.fromJSON(entry.responses[richIndex]), responsePath));
              expect(decodedAt(rich.value.data, responsePath)).toBeDefined();
            } else {
              expect(valueAt(rich.value.wire, responsePath)).toBeDefined();
            }
            return;
          }
          if (category === 'encoding-boundary') {
            const requestPath = path.slice('request.'.length);
            const record = caseKey.endsWith('absent') ? sparseRecord : richRecord;
            const actual = valueAt(record.rawBody, requestPath);
            if (caseKey.endsWith('absent')) expect(actual).toBeUndefined();
            else expect(encodingMatches(caseKey, actual)).toBe(true);
            return;
          }
          expect(shared[`${category}/${caseKey}`], `${category}/${caseKey}`).toBe(true);
        });
      }
    }
  }, { fixtureRoot });
}
