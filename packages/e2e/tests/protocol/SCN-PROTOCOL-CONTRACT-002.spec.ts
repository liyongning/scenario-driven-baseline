// @SCN-PROTOCOL-CONTRACT-002: 声明的消费接口的协议义务逐项由公共协议客户端与 Shadow 执行。
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { createProtocolClient } from '@daqian/template-protocol';
import type { HttpPort } from '@daqian/template-protocol';
import { consumedOperations } from '@daqian/template-sdk';
import {
  compareJsonPresence,
  createShadowServer,
  discoverDeclaredRoutes,
  type RunningShadowServer,
  type ShadowEnvironmentClass,
} from '@template-test/protocol';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { createNodeHttpDriver } from '../../src/drivers/node.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const inventory = await buildContractInventory(repositoryRoot);

/** 矩阵用例遍历产品包声明的消费接口，不写死任何接口名（PC-01）。 */
const operations: ReadonlyArray<(typeof consumedOperations)[number]> = consumedOperations;
const declaredNames = operations.map((operation) => operation.method.meta.name);
const routes = discoverDeclaredRoutes(operations.map((operation) => operation.method));
const running = new Set<RunningShadowServer>();

afterEach(async () => {
  await Promise.all([...running].map((server) => server.close()));
  running.clear();
});

type MatrixEntry = Readonly<{
  request: Record<string, unknown>;
  responses: Record<string, unknown>[];
}>;
type MatrixFixture = Readonly<Record<string, MatrixEntry>>;
type Result = Awaited<ReturnType<ReturnType<typeof createProtocolClient>['request']>>;
type MatrixRun = Readonly<{
  results: Result[];
  records: ReturnType<RunningShadowServer['records']>;
  verify: string[];
}>;

const metaOf = (operation: (typeof operations)[number]) => operation.method.meta;
const nameOf = (operation: (typeof operations)[number]) => operation.method.meta.name;

/** 公司规范的请求 ID：26 字符、北京时间、末尾 6 位小写字母（PC-05）。 */
const requestIdPattern = /^\d{8}_\d{6}_\d{3}_[a-z]{6}$/;

/** 按接口名取矩阵 Fixture 数据；缺少键时失败并指出接口名。 */
function entryOf(fixture: MatrixFixture, name: string): MatrixEntry {
  const entry = fixture[name];
  if (!entry) throw new Error(`协议矩阵 Fixture 缺少接口 ${name} 的数据`);
  return entry;
}

/** 该接口全部义务的 ID 前缀：由方法描述在 generated 中的声明位置推导（PC-01）。 */
function prefixOf(name: string): string {
  const suffix = `.${name}#http-route#$`;
  const route = inventory.obligations.find((item) => item.id.endsWith(suffix));
  if (!route) throw new Error(`接口 ${name} 缺少 http-route 义务`);
  return route.id.slice(0, route.id.length - suffix.length);
}

const obligationsOf = (name: string) =>
  inventory.obligations.filter((item) => item.id.startsWith(`${prefixOf(name)}.${name}#`));

/** 按消费接口派生的义务键；声明为空时为空数组。 */
const declaredObligationKeys = () =>
  declaredNames.flatMap((name) =>
    obligationsOf(name).flatMap((item) => item.cases.map((caseKey) => `${item.id}/${caseKey}`)),
  );

const declaredObligationCases = () =>
  declaredNames.flatMap((name) =>
    obligationsOf(name).flatMap((item) =>
      item.cases.map((caseKey) => ({ id: item.id, caseKey, checks: [`${item.id}/${caseKey}`] })),
    ),
  );

function camel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function valueAt(root: unknown, path: string): unknown {
  let value = root;
  for (const part of path.split('.').map(camel)) {
    if (Array.isArray(value)) value = value[0];
    value =
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  }
  return value;
}

const decodedAt = valueAt;

function communicationClient(
  url: string,
  configured = true,
  runtime?: Readonly<{ nowMs: () => number; sleepMs: (ms: number) => Promise<void> }>,
  token: () => unknown = () => 'fixture-token',
) {
  return createProtocolClient({
    gatewayBaseUrl: url,
    getAccessToken: token as () => string | null | Promise<string | null>,
    http: createNodeHttpDriver(),
    ...(configured
      ? {
          requestContext: { productId: 'matrix-product', lane: 'matrix-lane', appVersion: '1.2.3' },
        }
      : {}),
    runtime: {
      nowMs: runtime?.nowMs ?? (() => Date.now()),
      sleepMs: runtime?.sleepMs ?? (() => new Promise(() => undefined)),
    },
  });
}

/** 用方法描述的请求 codec 由 Fixture 请求体构造消息，baseReq 由公共客户端填充。 */
function messageOf(
  fixture: MatrixFixture,
  name: string,
  codec: { fromJSON(input: unknown): unknown },
) {
  const source = structuredClone(entryOf(fixture, name).request);
  delete source.baseReq;
  return codec.fromJSON(source);
}

function expectedBody(fixture: MatrixFixture, name: string, sparse = false) {
  const body = structuredClone(entryOf(fixture, name).request);
  if (sparse) delete (body.baseReq as Record<string, unknown>).productId;
  return body;
}

/** 请求 ID 每次都变：核验请求体其余字段前先去掉它，只由格式与请求头相等核验（PC-05）。 */
function withoutDynamicRequestId(body: unknown): unknown {
  const clone = structuredClone(body) as { baseReq?: Record<string, unknown> } | undefined;
  if (clone?.baseReq) delete clone.baseReq.requestId;
  return clone;
}

function encodingMatches(caseKey: string, value: unknown): boolean {
  if (
    caseKey.endsWith('json-string') ||
    caseKey.endsWith('json-int64-string') ||
    caseKey.endsWith('enum-name')
  )
    return typeof value === 'string';
  if (caseKey.endsWith('json-number')) return typeof value === 'number';
  if (caseKey.endsWith('json-boolean')) return typeof value === 'boolean';
  if (caseKey.endsWith('repeated-array')) return Array.isArray(value);
  if (
    caseKey.endsWith('nested-object') ||
    caseKey.endsWith('oneof-object') ||
    caseKey.endsWith('string-map')
  )
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return true;
}

/** 用真实协议客户端逐条发送 fixture 中的响应样例；sparse 请求省略可配置的公共上下文。 */
async function runMatrix(
  operation: (typeof operations)[number],
  fixture: MatrixFixture,
  environmentClass: ShadowEnvironmentClass,
): Promise<MatrixRun> {
  const meta = metaOf(operation);
  const name = meta.name;
  const responses = entryOf(fixture, name).responses;
  const message = () => messageOf(fixture, name, meta.requestCodec!);
  const scenario = {
    id: `${name}-matrix`,
    routes: {
      [name]: {
        // 请求 ID 每次都变，请求只记录不比对；随后由本用例逐字段核验请求体（PC-05）。
        expectedRequests: [
          ...responses.map(() => ({ recordOnly: true as const })),
          { recordOnly: true as const },
        ],
        steps: [...responses.map((body) => ({ body })), { body: {} }],
      },
    },
  };
  const server = await createShadowServer({
    routes,
    scenarios: [scenario],
    environmentClass,
  }).start();
  running.add(server);
  const configured = communicationClient(server.url);
  const results: Result[] = [];
  for (let index = 0; index < responses.length; index += 1) {
    results.push(await configured.request(meta, message(), { deadlineAtMs: Date.now() + 5_000 }));
  }
  results.push(
    await communicationClient(server.url, false).request(meta, message(), {
      deadlineAtMs: Date.now() + 5_000,
    }),
  );
  const records = server.records();
  // 去掉动态请求 ID 后与 Fixture 精确比较：字段缺失与多余字段都会被报出。
  const bodyIssues = records.flatMap((record, index) =>
    compareJsonPresence(
      expectedBody(fixture, name, index >= responses.length),
      withoutDynamicRequestId(record.rawBody),
    ).map((issue) => `${name} request ${index + 1}: ${issue}`),
  );
  return { results, records, verify: [...server.verify(), ...bodyIssues] };
}

/** 通信错误、响应处理与超时分支；每条分支都通过公共客户端的真实网络适配发出或按契约拒绝。 */
async function runSharedEvidence(
  operation: (typeof operations)[number],
  fixture: MatrixFixture,
  environmentClass: ShadowEnvironmentClass,
): Promise<Record<string, boolean>> {
  const meta = metaOf(operation);
  const name = meta.name;
  const request = () => messageOf(fixture, name, meta.requestCodec!);
  const deadline = () => Date.now() + 2_000;
  const requestStep = async (
    step: Readonly<{ status?: number; body?: unknown; rawBody?: string; delayMs?: number }>,
  ) => {
    const server = await createShadowServer({
      routes,
      scenarios: [
        {
          id: `${name}-shared-${running.size}`,
          // 请求 ID 每次都变：共享分支只记录，请求体由矩阵用例逐字段核验（PC-05）。
          routes: { [name]: { expectedRequests: [{ recordOnly: true }], steps: [step] } },
        },
      ],
      environmentClass,
    }).start();
    running.add(server);
    return communicationClient(server.url).request(meta, request(), { deadlineAtMs: deadline() });
  };
  const success = await requestStep({ body: { baseResp: { success: true, statusCode: '0' } } });
  const business = await requestStep({
    body: { baseResp: { success: false, statusCode: '123', statusMsg: 'matrix-business' } },
  });
  const httpError = await requestStep({
    status: 503,
    body: { baseResp: { success: false, statusCode: '123' } },
  });
  const malformed = await requestStep({ rawBody: '{', status: 200 });

  const noSend: HttpPort = {
    send: async () => {
      throw new Error('must not send');
    },
  };
  const make = (
    token: () => unknown,
    nowMs = () => 0,
    sleepMs = () => new Promise<void>(() => undefined),
    http: HttpPort = noSend,
  ) =>
    createProtocolClient({
      gatewayBaseUrl: 'http://127.0.0.1:1',
      getAccessToken: token as () => string | null | Promise<string | null>,
      http,
      runtime: { nowMs, sleepMs },
    });
  const emptyToken = await make(() => '').request(meta, request(), { deadlineAtMs: 10 });
  const hostError = await make(() => {
    throw new Error('host');
  }).request(meta, request(), { deadlineAtMs: 10 });
  const networkError = await make(
    () => 'token',
    () => 0,
    () => new Promise<void>(() => undefined),
    {
      send: async () => {
        throw new Error('network');
      },
    },
  ).request(meta, request(), { deadlineAtMs: 10 });
  const cancelled = await make(() => 'token').request(meta, request(), {
    deadlineAtMs: 10,
    cancellation: { isStopped: () => true, subscribe: () => () => undefined },
  });
  const codecRequest = new Proxy(request() as object, {
    get() {
      throw new Error('codec');
    },
  });
  const codecError = await make(() => 'token').request(meta, codecRequest, { deadlineAtMs: 10 });

  const beforeContext = await make(
    () => 'token',
    () => 10,
  ).request(meta, request(), { deadlineAtMs: 10 });
  const providerTimeout = await make(
    () => new Promise<string>(() => undefined),
    () => 0,
    async () => undefined,
  ).request(meta, request(), { deadlineAtMs: 10 });
  let currentTime = 0;
  const deadlineRequest = new Proxy(request() as object, {
    get(target, property, receiver) {
      currentTime = 10;
      return Reflect.get(target, property, receiver);
    },
  });
  const beforeSend = await make(
    () => 'token',
    () => currentTime,
  ).request(meta, deadlineRequest, { deadlineAtMs: 5 });
  const delayedServer = await createShadowServer({
    routes,
    scenarios: [
      {
        id: `${name}-in-flight-timeout`,
        routes: {
          [name]: { expectedRequests: [{ recordOnly: true }], steps: [{ delayMs: 30, body: {} }] },
        },
      },
    ],
    environmentClass,
  }).start();
  running.add(delayedServer);
  const delayed = await communicationClient(delayedServer.url).request(meta, request(), {
    deadlineAtMs: Date.now() + 5,
  });
  let resolveLate!: (token: string) => void;
  let sends = 0;
  const lateToken = new Promise<string>((resolve) => {
    resolveLate = resolve;
  });
  const late = await make(
    () => lateToken,
    () => 0,
    async () => undefined,
    {
      send: async () => {
        sends += 1;
        return { ok: true, value: { status: 200, headers: {}, body: '{}' } };
      },
    },
  ).request(meta, request(), { deadlineAtMs: 10 });
  resolveLate('late-token');
  await Promise.resolve();
  await Promise.resolve();

  const errorCode = (result: Result) => (result.ok ? undefined : result.error.code);
  return {
    'response-handling/success': success.ok && success.value.http.status === 200,
    'response-handling/business-error':
      business.ok && valueAt(business.value.wire, 'base_resp.status_code') === '123',
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

defineCase(
  {
    ownerId: 'SCN-PROTOCOL-CONTRACT-002',
    caseId: 'protocol-matrix',
    fixtureCase: 'protocol-matrix',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-PROTOCOL-CONTRACT-002',
        caseKey: 'protocol-matrix',
        checks: [
          'obligations-covered',
          'real-client-path',
          'routes-from-declaration',
          'matrix-iterates-declaration',
        ],
      },
      ...declaredObligationCases(),
    ],
  },
  async ({ fixture: value, checkpoint, expect, environmentClass }) => {
    const fixture = value as MatrixFixture;
    const covered = new Set<string>();
    const runs = new Map<string, MatrixRun>();
    const shared = new Map<string, Record<string, boolean>>();
    for (const operation of operations) {
      const name = nameOf(operation);
      runs.set(name, await runMatrix(operation, fixture, environmentClass));
      shared.set(name, await runSharedEvidence(operation, fixture, environmentClass));
    }
    for (const name of declaredNames) {
      expect(runs.get(name)!.verify).toEqual([]);
      expect(runs.get(name)!.results.every((result) => result.ok)).toBe(true);
    }

    for (const operation of operations) {
      const name = nameOf(operation);
      const run = runs.get(name)!;
      const entries = entryOf(fixture, name).responses;
      const richResults = run.results.slice(0, entries.length);
      const emptyResult = run.results.at(-1)!;
      const richRecord = run.records[0]!;
      const sparseRecord = run.records.at(-1)!;
      const responseCodec = metaOf(operation).responseCodec;
      const emptyDecoded = responseCodec.fromJSON({});

      for (const obligation of obligationsOf(name)) {
        const match = obligation.id.match(/#([^#]+)#(.+)$/)!;
        const category = match[1]!;
        const path = match[2]!;
        for (const caseKey of obligation.cases) {
          covered.add(`${obligation.id}/${caseKey}`);
          await checkpoint(`${obligation.id}/${caseKey}`, () => {
            if (category === 'http-route') {
              expect(run.records.every((record) => record.methodName === name)).toBe(true);
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
              const headers = caseKey.endsWith('omitted')
                ? sparseRecord.headers
                : richRecord.headers;
              const body = caseKey.endsWith('omitted') ? sparseRecord.rawBody : richRecord.rawBody;
              const facts: Record<string, boolean> = {
                authorization: headers.authorization === 'Bearer fixture-token',
                'content-type': String(headers['content-type']).startsWith('application/json'),
                'x-product-id-configured': headers['x-product-id'] === 'matrix-product',
                'x-product-id-omitted': headers['x-product-id'] === undefined,
                // 请求 ID 每次都变：核验头名、格式，以及头与 BaseReq.requestId 同值（PC-05）。
                'x-request-id-header':
                  headers.request_id === undefined && typeof headers['x-request-id'] === 'string',
                'x-request-id-format':
                  typeof headers['x-request-id'] === 'string' &&
                  requestIdPattern.test(headers['x-request-id']),
                'base-req-request-id':
                  valueAt(body, 'base_req.request_id') === headers['x-request-id'],
                'base-req-product-id-configured':
                  valueAt(body, 'base_req.product_id') === 'matrix-product',
                'base-req-product-id-omitted': valueAt(body, 'base_req.product_id') === undefined,
                'lane-configured': headers.lane === 'matrix-lane',
                'lane-omitted': headers.lane === undefined,
                'app-version-configured': headers.app_version === '1.2.3',
                'app-version-omitted': headers.app_version === undefined,
              };
              expect(facts[caseKey]).toBe(true);
              return;
            }
            if (
              category === 'response-mapping' ||
              (category === 'encoding-boundary' && path.startsWith('response.'))
            ) {
              const responsePath =
                category === 'response-mapping' ? path : path.slice('response.'.length);
              const rich = richResults[0]!;
              expect(rich.ok).toBe(true);
              expect(emptyResult.ok).toBe(true);
              if (!rich.ok || !emptyResult.ok) return;
              if (
                caseKey === 'wire-absent' ||
                caseKey.endsWith('optional-absence') ||
                caseKey.endsWith('oneof-absence')
              ) {
                expect(valueAt(emptyResult.value.wire, responsePath)).toBeUndefined();
              } else if (caseKey === 'decoded-absence') {
                expect(decodedAt(emptyResult.value.data, responsePath)).toBeUndefined();
              } else if (caseKey === 'decoded-default') {
                expect(decodedAt(emptyResult.value.data, responsePath)).toEqual(
                  decodedAt(emptyDecoded, responsePath),
                );
              } else if (caseKey.startsWith('response-')) {
                expect(encodingMatches(caseKey, valueAt(rich.value.wire, responsePath))).toBe(true);
              } else if (caseKey === 'decoded-value' || caseKey === 'decoded-branch') {
                expect(decodedAt(rich.value.data, responsePath)).toEqual(
                  decodedAt(responseCodec.fromJSON(entries[0]), responsePath),
                );
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
            expect(
              shared.get(name)![`${category}/${caseKey}`],
              `${name}/${category}/${caseKey}`,
            ).toBe(true);
          });
        }
      }
    }

    await checkpoint('routes-from-declaration', () => {
      expect(routes.map((route) => route.methodName)).toEqual([...declaredNames]);
      // 中立字段与声明一致；响应结构校验器由协议来源注入（PC-04），不参与中立字段比较。
      expect(
        routes.map(({ methodName, httpMethod, path }) => ({ methodName, httpMethod, path })),
      ).toEqual(
        operations.map((operation) => ({
          methodName: metaOf(operation).name,
          httpMethod: metaOf(operation).method,
          path: metaOf(operation).path,
        })),
      );
      expect(routes.every((route) => typeof route.validateResponse === 'function')).toBe(true);
      expect(routes.length).toBe(declaredNames.length);
    });

    await checkpoint('matrix-iterates-declaration', () => {
      expect([...runs.keys()].sort()).toEqual([...declaredNames].sort());
      for (const operation of operations) {
        const name = nameOf(operation);
        expect(Object.prototype.hasOwnProperty.call(fixture, name)).toBe(true);
        expect(runs.get(name)!.records.length).toBe(entryOf(fixture, name).responses.length + 1);
      }
      expect(() => entryOf({}, 'UndeclaredInterface')).toThrow(/UndeclaredInterface/);
    });

    await checkpoint('obligations-covered', () => {
      const derived = declaredObligationKeys();
      // 声明为空时按消费接口派生的义务为空并结束（业务错误码义务不在矩阵范围内）。
      if (declaredNames.length === 0) {
        expect(derived).toEqual([]);
        expect(routes).toEqual([]);
        return;
      }
      expect(derived.length).toBeGreaterThan(0);
      expect(covered.size).toBe(derived.length);
      expect(inventory.methods.map((item) => item.name).sort()).toEqual([...declaredNames].sort());
    });

    await checkpoint('real-client-path', () => {
      for (const name of declaredNames) {
        const run = runs.get(name)!;
        expect(run.records.length).toBe(entryOf(fixture, name).responses.length + 1);
        expect(run.records.every((record) => record.methodName === name)).toBe(true);
      }
    });
  },
  { fixtureRoot },
);
