// @SCN-PROTOCOL-CONTRACT-002: 示例接口的协议义务逐项由公共协议客户端与 Shadow 执行。
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { createProtocolClient } from '@daqian/template-protocol';
import type { HttpPort } from '@daqian/template-protocol';
import {
  CreateTrade, CreateTradeRequest, CreateTradeResponse,
  QueryTrade, QueryTradeRequest, QueryTradeResponse,
} from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';
import { createShadowServer, discoverExampleRoutes, type RunningShadowServer } from '@template-test/protocol';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { createNodeHttpDriver } from '../../src/drivers/node.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const inventory = await buildContractInventory(repositoryRoot);
const routes = discoverExampleRoutes();
const running = new Set<RunningShadowServer>();

type MethodName = 'CreateTrade' | 'QueryTrade';
const methods = ['CreateTrade', 'QueryTrade'] as const;
type MatrixFixture = Readonly<Record<'create' | 'query', Readonly<{
  request: Record<string, unknown>;
  responses: Record<string, unknown>[];
}>>>;
type Result = Awaited<ReturnType<ReturnType<typeof createProtocolClient>['request']>>;
type MatrixRun = Readonly<{ results: Result[]; records: ReturnType<RunningShadowServer['records']>; verify: string[] }>;

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

const decodedAt = valueAt;

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

const entryOf = (fixture: MatrixFixture, method: MethodName) => fixture[method === 'CreateTrade' ? 'create' : 'query'];

function requestBody(fixture: MatrixFixture, method: MethodName) {
  const source = structuredClone(entryOf(fixture, method).request);
  delete source.baseReq;
  return method === 'CreateTrade' ? CreateTradeRequest.fromJSON(source) : QueryTradeRequest.fromJSON(source);
}

function expectedBody(fixture: MatrixFixture, method: MethodName, sparse = false) {
  const body = structuredClone(entryOf(fixture, method).request);
  if (sparse) delete (body.baseReq as Record<string, unknown>).productId;
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

const metaOf = (method: MethodName) => method === 'CreateTrade' ? CreateTrade.meta : QueryTrade.meta;
const messageOf = (fixture: MatrixFixture, method: MethodName) => requestBody(fixture, method) as CreateTradeRequest & QueryTradeRequest;
const responseCodecOf = (method: MethodName) => method === 'CreateTrade' ? CreateTradeResponse : QueryTradeResponse;

/** 用真实协议客户端逐条发送 fixture 中的响应样例；sparse 请求省略可配置的公共上下文。 */
async function runMatrix(method: MethodName, fixture: MatrixFixture): Promise<MatrixRun> {
  const responses = entryOf(fixture, method).responses;
  const scenario = {
    id: `${method}-matrix`,
    routes: {
      [method]: {
        expectedRequests: [...responses.map(() => ({ body: expectedBody(fixture, method) })), { body: expectedBody(fixture, method, true) }],
        steps: [...responses.map(body => ({ body })), { body: {} }],
      },
    },
  };
  const server = await createShadowServer({ routes, scenarios: [scenario] }).start();
  running.add(server);
  const configured = communicationClient(server.url);
  const results: Result[] = [];
  for (let index = 0; index < responses.length; index += 1) {
    results.push(await configured.request(metaOf(method) as typeof CreateTrade.meta, messageOf(fixture, method), { deadlineAtMs: Date.now() + 5_000 }));
  }
  results.push(await communicationClient(server.url, false).request(metaOf(method) as typeof CreateTrade.meta, messageOf(fixture, method), { deadlineAtMs: Date.now() + 5_000 }));
  return { results, records: server.records(), verify: server.verify() };
}

/** 通信错误、响应处理与超时分支；每条分支都通过公共客户端的真实网络适配发出或按契约拒绝。 */
async function runSharedEvidence(method: MethodName, fixture: MatrixFixture): Promise<Record<string, boolean>> {
  const meta = metaOf(method) as typeof CreateTrade.meta;
  const request = messageOf(fixture, method);
  const expected = expectedBody(fixture, method);
  const deadline = () => Date.now() + 2_000;
  const requestStep = async (step: Readonly<{ status?: number; body?: unknown; rawBody?: string; delayMs?: number }>) => {
    const server = await createShadowServer({ routes, scenarios: [{
      id: `${method}-shared-${running.size}`,
      routes: { [method]: { expectedRequests: [{ body: expected }], steps: [step] } },
    }] }).start();
    running.add(server);
    return communicationClient(server.url).request(meta, request, { deadlineAtMs: deadline() });
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
  const emptyToken = await make(() => '').request(meta, request, { deadlineAtMs: 10 });
  const hostError = await make(() => { throw new Error('host'); }).request(meta, request, { deadlineAtMs: 10 });
  const networkError = await make(() => 'token', () => 0, () => new Promise<void>(() => undefined), { send: async () => { throw new Error('network'); } })
    .request(meta, request, { deadlineAtMs: 10 });
  const cancelled = await make(() => 'token').request(meta, request, {
    deadlineAtMs: 10, cancellation: { isStopped: () => true, subscribe: () => () => undefined },
  });
  const codecRequest = new Proxy(request as object, { get() { throw new Error('codec'); } }) as CreateTradeRequest;
  const codecError = await make(() => 'token').request(meta, codecRequest, { deadlineAtMs: 10 });

  const beforeContext = await make(() => 'token', () => 10).request(meta, request, { deadlineAtMs: 10 });
  const providerTimeout = await make(() => new Promise<string>(() => undefined), () => 0, async () => undefined)
    .request(meta, request, { deadlineAtMs: 10 });
  let currentTime = 0;
  const deadlineRequest = new Proxy(request as object, { get(target, property, receiver) { currentTime = 10; return Reflect.get(target, property, receiver); } }) as CreateTradeRequest;
  const beforeSend = await make(() => 'token', () => currentTime).request(meta, deadlineRequest, { deadlineAtMs: 5 });
  const delayedServer = await createShadowServer({ routes, scenarios: [{
    id: `${method}-in-flight-timeout`,
    routes: { [method]: { expectedRequests: [{ body: expected }], steps: [{ delayMs: 30, body: {} }] } },
  }] }).start();
  running.add(delayedServer);
  const delayed = await communicationClient(delayedServer.url).request(meta, request, { deadlineAtMs: Date.now() + 5 });
  let resolveLate!: (token: string) => void;
  let sends = 0;
  const lateToken = new Promise<string>(resolve => { resolveLate = resolve; });
  const late = await make(() => lateToken, () => 0, async () => undefined, { send: async () => { sends += 1; return { ok: true, value: { status: 200, headers: {}, body: '{}' } }; } })
    .request(meta, request, { deadlineAtMs: 10 });
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

defineCase({
  ownerId: 'SCN-PROTOCOL-CONTRACT-002', caseId: 'protocol-matrix', fixtureCase: 'protocol-matrix', environment: 'integration',
  covers: [
    { id: 'SCN-PROTOCOL-CONTRACT-002', caseKey: 'protocol-matrix', checks: ['obligations-covered', 'real-client-path'] },
    ...inventory.obligations
      .filter(item => item.id.startsWith('infra.trade.v1.'))
      .flatMap(item => item.cases.map(caseKey => ({ id: item.id, caseKey, checks: [`${item.id}/${caseKey}`] }))),
  ],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as MatrixFixture;
  const covered = new Set<string>();
  const runs = new Map<MethodName, MatrixRun>();
  const shared = new Map<MethodName, Record<string, boolean>>();
  for (const method of methods) {
    runs.set(method, await runMatrix(method, fixture));
    shared.set(method, await runSharedEvidence(method, fixture));
  }
  for (const method of methods) {
    expect(runs.get(method)!.verify).toEqual([]);
    expect(runs.get(method)!.results.every(result => result.ok)).toBe(true);
  }

  for (const method of methods) {
    const run = runs.get(method)!;
    const entries = entryOf(fixture, method).responses;
    const richResults = run.results.slice(0, entries.length);
    const emptyResult = run.results.at(-1)!;
    const richRecord = run.records[0]!;
    const sparseRecord = run.records.at(-1)!;
    const responseCodec = responseCodecOf(method);
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
            expect(run.records.every(record => record.methodName === method)).toBe(true);
            return;
          }
          if (category === 'request-mapping') {
            const record = caseKey === 'omitted' ? sparseRecord : richRecord;
            const actual = valueAt(record.rawBody, path);
            if (caseKey === 'omitted') expect(actual).toBeUndefined();
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
            };
            expect(facts[caseKey]).toBe(true);
            return;
          }
          if (category === 'response-mapping' || (category === 'encoding-boundary' && path.startsWith('response.'))) {
            const responsePath = category === 'response-mapping' ? path : path.slice('response.'.length);
            const rich = richResults[0]!;
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
              expect(decodedAt(rich.value.data, responsePath)).toEqual(decodedAt(responseCodec.fromJSON(entries[0]), responsePath));
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
          expect(shared.get(method)![`${category}/${caseKey}`], `${method}/${category}/${caseKey}`).toBe(true);
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
      const run = runs.get(method)!;
      expect(run.records.length).toBe(entryOf(fixture, method).responses.length + 1);
      expect(run.records.every(record => record.methodName === method)).toBe(true);
    }
  });
}, { fixtureRoot });
