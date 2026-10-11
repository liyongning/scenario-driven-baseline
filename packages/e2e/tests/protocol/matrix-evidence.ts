/**
 * 协议矩阵的取证执行（PC-01、PC-02）：integration 矩阵用例与一次性回归证据共用同一份实现，
 * 使"新增消费接口只改声明与矩阵 Fixture"这条口径对普通接口与 oneof 接口都成立。
 * 取值与取证规则的纯函数在 `matrix-support.ts`；这里只负责经公共协议客户端真实执行并逐义务判定。
 */
import { expect } from 'vitest';
import { createProtocolClient, type HttpPort } from '@daqian/template-protocol';
import type { RpcMethodMeta } from '@daqian/template-protocol/generated/std';
import {
  compareJsonPresence,
  createShadowServer,
  type RunningShadowServer,
  type ShadowEnvironmentClass,
  type ShadowRoute,
} from '@template-test/shadow';
import type { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { createNodeHttpDriver } from '../../src/drivers/node.ts';
import {
  decodedAt,
  encodingMatches,
  missingOmissionSamples,
  omittedSample,
  requestAbsenceCase,
  requestEvidenceIndex,
  responseEvidence,
  wireAt,
  type MatrixEntry,
  type MatrixFixture,
  type RequestContext,
} from './matrix-support.ts';

/** 一份消费接口声明（只用到方法描述；请求字段策略已在派生器里用掉）。 */
export type MatrixOperation = Readonly<{
  method: Readonly<{ meta: RpcMethodMeta<unknown, unknown> }>;
}>;
export type ContractInventory = Awaited<ReturnType<typeof buildContractInventory>>;
/** defineCase 的 checkpoint 或回归证据提供的等价记录器。 */
export type MatrixCheckpoint = (
  name: string,
  assertion: () => void | Promise<void>,
) => Promise<void>;

type Result = Awaited<ReturnType<ReturnType<typeof createProtocolClient>['request']>>;
export type MatrixRun = Readonly<{
  results: Result[];
  records: ReturnType<RunningShadowServer['records']>;
  verify: string[];
}>;

/** 一次矩阵取证的执行结果：逐义务判定、请求记录与共享分支事实。 */
export type MatrixEvidenceSummary = Readonly<{
  names: string[];
  covered: string[];
  missingEvidence: string[];
  missingSamples: string[];
  runs: Record<string, MatrixRun>;
  shared: Record<string, Record<string, boolean>>;
}>;

export const metaOf = (operation: MatrixOperation) => operation.method.meta;
export const nameOf = (operation: MatrixOperation) => operation.method.meta.name;

/** 公司规范的请求 ID：26 字符、北京时间、末尾 6 位小写字母（PC-05）。 */
const requestIdPattern = /^\d{8}_\d{6}_\d{3}_[a-z]{6}$/;

/** 按接口名取矩阵 Fixture 数据；缺少键时失败并指出接口名。 */
export function entryOf(fixture: MatrixFixture, name: string): MatrixEntry {
  const entry = fixture[name];
  if (!entry) throw new Error(`协议矩阵 Fixture 缺少接口 ${name} 的数据`);
  return entry;
}

/** 该接口全部义务的 ID 前缀：由方法描述在 generated 中的声明位置推导（PC-01）。 */
function prefixOf(inventory: ContractInventory, name: string): string {
  const suffix = `.${name}#http-route#$`;
  const route = inventory.obligations.find((item) => item.id.endsWith(suffix));
  if (!route) throw new Error(`接口 ${name} 缺少 http-route 义务`);
  return route.id.slice(0, route.id.length - suffix.length);
}

/** 某个声明接口派生的全部义务。 */
export const obligationsOf = (inventory: ContractInventory, name: string) =>
  inventory.obligations.filter((item) =>
    item.id.startsWith(`${prefixOf(inventory, name)}.${name}#`),
  );

/** 按消费接口派生的义务键；声明为空时为空数组。 */
export const declaredObligationKeys = (
  inventory: ContractInventory,
  names: ReadonlyArray<string>,
) =>
  names.flatMap((name) =>
    obligationsOf(inventory, name).flatMap((item) =>
      item.cases.map((caseKey) => `${item.id}/${caseKey}`),
    ),
  );

/** 逐义务的用例绑定；声明为空时为空数组。 */
export const declaredObligationCases = (
  inventory: ContractInventory,
  names: ReadonlyArray<string>,
) =>
  names.flatMap((name) =>
    obligationsOf(inventory, name).flatMap((item) =>
      item.cases.map((caseKey) => ({ id: item.id, caseKey, checks: [`${item.id}/${caseKey}`] })),
    ),
  );

function communicationClient(
  url: string,
  context: RequestContext | null,
  runtime?: Readonly<{ nowMs: () => number; sleepMs: (ms: number) => Promise<void> }>,
  token: () => unknown = () => 'fixture-token',
) {
  return createProtocolClient({
    gatewayBaseUrl: url,
    getAccessToken: token as () => string | null | Promise<string | null>,
    http: createNodeHttpDriver(),
    ...(context === null ? {} : { requestContext: context }),
    runtime: {
      nowMs: runtime?.nowMs ?? (() => Date.now()),
      sleepMs: runtime?.sleepMs ?? (() => new Promise(() => undefined)),
    },
  });
}

/** 用方法描述的请求 codec 由 Fixture 请求体构造消息，baseReq 由公共客户端填充。 */
function messageOf(request: Record<string, unknown>, codec: { fromJSON(input: unknown): unknown }) {
  const source = structuredClone(request);
  delete source.baseReq;
  return codec.fromJSON(source);
}

/** 期望请求体：样例请求体 + 公共客户端按上下文填充的 BaseReq（请求 ID 动态，稍后去掉）。 */
function expectedBody(request: Record<string, unknown>, context: RequestContext) {
  const body = structuredClone(request);
  delete body.baseReq;
  const productId = context.productId;
  return { ...body, baseReq: productId === undefined ? {} : { productId } };
}

/** 请求 ID 每次都变：核验请求体其余字段前先去掉它，只由格式与请求头相等核验（PC-05）。 */
function withoutDynamicRequestId(body: unknown): unknown {
  const clone = structuredClone(body) as { baseReq?: Record<string, unknown> } | undefined;
  if (clone?.baseReq) delete clone.baseReq.requestId;
  return clone;
}

/**
 * 逐条发送 fixture 中的响应样例，再发逐字段省略样例与不配置公共上下文的请求：
 * 每条派生义务都由其中一条请求/响应取证（PC-01、PC-02）。
 */
async function runMatrix(
  operation: MatrixOperation,
  fixture: MatrixFixture,
  environmentClass: ShadowEnvironmentClass,
  context: RequestContext,
  routes: ReadonlyArray<ShadowRoute>,
  servers: Set<RunningShadowServer>,
): Promise<MatrixRun> {
  const meta = metaOf(operation);
  const name = meta.name;
  const entry = entryOf(fixture, name);
  const responses = entry.responses;
  const samples = (entry.omitted ?? []).map((path) => omittedSample(entry, path, context));
  const requestFor = (source: Record<string, unknown>) => messageOf(source, meta.requestCodec!);
  const scenario = {
    id: `${name}-matrix`,
    routes: {
      [name]: {
        // 请求 ID 每次都变，请求只记录不比对；随后由本用例逐字段核验请求体（PC-05）。
        // 逐字段省略样例与不配置上下文的请求都以空响应应答；expectedRequests 与 steps 等长。
        expectedRequests: [
          ...responses.map(() => ({ recordOnly: true as const })),
          ...samples.map(() => ({ recordOnly: true as const })),
          { recordOnly: true as const },
        ],
        steps: [
          ...responses.map((body) => ({ body })),
          ...samples.map(() => ({ body: {} as Record<string, unknown> })),
          { body: {} },
        ],
      },
    },
  };
  const server = await createShadowServer({
    routes,
    scenarios: [scenario],
    environmentClass,
  }).start();
  servers.add(server);
  const results: Result[] = [];
  for (let index = 0; index < responses.length; index += 1) {
    results.push(
      await communicationClient(server.url, context).request(meta, requestFor(entry.request), {
        deadlineAtMs: Date.now() + 5_000,
      }),
    );
  }
  for (const sample of samples) {
    results.push(
      await communicationClient(server.url, sample.context).request(
        meta,
        requestFor(sample.request),
        {
          deadlineAtMs: Date.now() + 5_000,
        },
      ),
    );
  }
  results.push(
    await communicationClient(server.url, null).request(meta, requestFor(entry.request), {
      deadlineAtMs: Date.now() + 5_000,
    }),
  );
  const records = server.records();
  // 去掉动态请求 ID 后与 Fixture 精确比较：字段缺失与多余字段都会被报出。
  const expectations = [
    ...responses.map(() => ({ request: entry.request, context })),
    ...samples.map((sample) => ({ request: sample.request, context: sample.context })),
    { request: entry.request, context: {} as RequestContext },
  ];
  const bodyIssues = records.flatMap((record, index) =>
    compareJsonPresence(
      expectedBody(expectations[index]!.request, expectations[index]!.context),
      withoutDynamicRequestId(record.rawBody),
    ).map((issue) => `${name} request ${index + 1}: ${issue}`),
  );
  return { results, records, verify: [...server.verify(), ...bodyIssues] };
}

/** 通信错误、响应处理与超时分支；每条分支都通过公共客户端的真实网络适配发出或按契约拒绝。 */
export async function runSharedEvidence(
  operation: MatrixOperation,
  fixture: MatrixFixture,
  routes: ReadonlyArray<ShadowRoute>,
  environmentClass: ShadowEnvironmentClass,
  context: RequestContext,
  servers: Set<RunningShadowServer>,
): Promise<Record<string, boolean>> {
  const meta = metaOf(operation);
  const name = meta.name;
  const request = () => messageOf(entryOf(fixture, name).request, meta.requestCodec!);
  const deadline = () => Date.now() + 2_000;
  const requestStep = async (
    step: Readonly<{
      status?: number;
      body?: unknown;
      rawBody?: string;
      delayMs?: number;
      malformed?: Readonly<{ reason: string }>;
    }>,
  ) => {
    const server = await createShadowServer({
      routes,
      scenarios: [
        {
          id: `${name}-shared-${servers.size}`,
          // 请求 ID 每次都变：共享分支只记录，请求体由矩阵用例逐字段核验（PC-05）。
          routes: { [name]: { expectedRequests: [{ recordOnly: true }], steps: [step] } },
        },
      ],
      environmentClass,
    }).start();
    servers.add(server);
    return communicationClient(server.url, context).request(meta, request(), {
      deadlineAtMs: deadline(),
    });
  };
  const success = await requestStep({ body: { baseResp: { success: true, statusCode: '0' } } });
  const business = await requestStep({
    body: { baseResp: { success: false, statusCode: '123', statusMsg: 'matrix-business' } },
  });
  const httpError = await requestStep({
    status: 503,
    body: { baseResp: { success: false, statusCode: '123' } },
  });
  const malformed = await requestStep({
    rawBody: '{',
    status: 200,
    malformed: { reason: '非法 JSON 响应体（解码错误义务）' },
  });

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
  servers.add(delayedServer);
  const delayed = await communicationClient(delayedServer.url, context).request(meta, request(), {
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
      business.ok && wireAt(business.value.wire, 'base_resp.status_code') === '123',
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

/**
 * 执行整份矩阵并逐义务判定：每条请求字段义务要有取证请求，每条响应义务要有取证响应
 * （oneof 的分支义务由选中该分支的响应取证）；缺证的义务 ID 与缺省略样例的字段 ID 照实报出。
 */
export async function executeMatrixEvidence(
  input: Readonly<{
    operations: ReadonlyArray<MatrixOperation>;
    fixture: MatrixFixture;
    inventory: ContractInventory;
    routes: ReadonlyArray<ShadowRoute>;
    environmentClass: ShadowEnvironmentClass;
    context: RequestContext;
    servers: Set<RunningShadowServer>;
    checkpoint?: MatrixCheckpoint;
  }>,
): Promise<MatrixEvidenceSummary> {
  const { operations, fixture, inventory, routes, environmentClass, context } = input;
  const checkpoint: MatrixCheckpoint =
    input.checkpoint ?? (async (_name, assertion) => assertion());
  const names = operations.map(nameOf);
  const runs: Record<string, MatrixRun> = {};
  const shared: Record<string, Record<string, boolean>> = {};
  for (const operation of operations) {
    const name = nameOf(operation);
    runs[name] = await runMatrix(
      operation,
      fixture,
      environmentClass,
      context,
      routes,
      input.servers,
    );
    shared[name] = await runSharedEvidence(
      operation,
      fixture,
      routes,
      environmentClass,
      context,
      input.servers,
    );
  }
  for (const name of names) {
    expect(runs[name]!.verify).toEqual([]);
    expect(runs[name]!.results.every((result) => result.ok)).toBe(true);
  }

  const covered: string[] = [];
  const missingEvidence: string[] = [];
  const missingSamples: string[] = [];
  for (const operation of operations) {
    const name = nameOf(operation);
    const run = runs[name]!;
    const entry = entryOf(fixture, name);
    const responses = run.results.slice(0, entry.responses.length);
    const emptyResult = run.results.at(-1)!;
    const records = run.records;
    const richRecord = records[0]!;
    // 不配置公共请求上下文的请求：提供"上下文省略"的证据（PC-01）。
    const unconfiguredRecord = records.at(-1)!;
    const omittedRecordIndex = new Map(
      (entry.omitted ?? []).map((path, index) => [path, entry.responses.length + index]),
    );
    const responseSamples = responses.map((result) =>
      result.ok
        ? { decoded: result.value.data, wire: result.value.wire }
        : { decoded: undefined, wire: undefined },
    );
    const responseCodec = metaOf(operation).responseCodec;
    const emptyDecoded = responseCodec.fromJSON({});

    /** 请求侧取样：规则在 matrix-support.ts 中与 weapp 用例共用（缺失类必须取字段缺失的请求）。 */
    const requestEvidence = (caseKey: string, path: string): number =>
      requestEvidenceIndex(caseKey, path, records, omittedRecordIndex);

    // 声明了 omitted 却没有逐字段省略样例：按义务 ID 报出（反例）。
    const omittedFields = obligationsOf(inventory, name)
      .filter((item) => item.id.includes('#request-mapping#') && item.cases.includes('omitted'))
      .map((item) =>
        item.id.slice(item.id.indexOf('#request-mapping#') + '#request-mapping#'.length),
      );
    for (const path of missingOmissionSamples(omittedFields, entry))
      missingSamples.push(`${name}#request-mapping#${path}`);

    for (const obligation of obligationsOf(inventory, name)) {
      const match = obligation.id.match(/#([^#]+)#(.+)$/)!;
      const category = match[1]!;
      const path = match[2]!;
      for (const caseKey of obligation.cases) {
        covered.push(`${obligation.id}/${caseKey}`);
        await checkpoint(`${obligation.id}/${caseKey}`, () => {
          if (category === 'http-route') {
            expect(run.records.every((record) => record.methodName === name)).toBe(true);
            return;
          }
          if (category === 'request-mapping') {
            const index = requestEvidence(caseKey, path);
            if (index < 0) {
              missingEvidence.push(`${obligation.id}/${caseKey}`);
              return;
            }
            const actual = wireAt(records[index]!.rawBody, path);
            if (requestAbsenceCase(caseKey)) expect(actual).toBeUndefined();
            else expect(actual).toBeDefined();
            return;
          }
          if (category === 'header-base-req') {
            const headers = caseKey.endsWith('omitted')
              ? unconfiguredRecord.headers
              : richRecord.headers;
            const body = caseKey.endsWith('omitted')
              ? unconfiguredRecord.rawBody
              : richRecord.rawBody;
            const facts: Record<string, boolean> = {
              authorization: headers.authorization === 'Bearer fixture-token',
              'content-type': String(headers['content-type']).startsWith('application/json'),
              'x-product-id-configured': headers['x-product-id'] === context.productId,
              'x-product-id-omitted': headers['x-product-id'] === undefined,
              // 请求 ID 每次都变：核验头名、格式，以及头与 BaseReq.requestId 同值（PC-05）。
              'x-request-id-header':
                headers.request_id === undefined && typeof headers['x-request-id'] === 'string',
              'x-request-id-format':
                typeof headers['x-request-id'] === 'string' &&
                requestIdPattern.test(headers['x-request-id']),
              'base-req-request-id':
                wireAt(body, 'base_req.request_id') === headers['x-request-id'],
              'base-req-product-id-configured':
                wireAt(body, 'base_req.product_id') === context.productId,
              'base-req-product-id-omitted': wireAt(body, 'base_req.product_id') === undefined,
              'lane-configured': headers.lane === context.lane,
              'lane-omitted': headers.lane === undefined,
              'app-version-configured': headers.app_version === context.appVersion,
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
            const evidence = responseEvidence(caseKey, responsePath, responseSamples);
            if (evidence.kind === 'missing') {
              missingEvidence.push(`${obligation.id}/${caseKey}`);
              return;
            }
            const result = evidence.kind === 'absent' ? emptyResult : responses[evidence.index]!;
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            if (evidence.kind === 'absent') {
              if (caseKey === 'decoded-absence')
                expect(decodedAt(result.value.data, responsePath)).toBeUndefined();
              else if (caseKey === 'decoded-default')
                expect(decodedAt(result.value.data, responsePath)).toEqual(
                  decodedAt(emptyDecoded, responsePath),
                );
              else expect(wireAt(result.value.wire, responsePath)).toBeUndefined();
              return;
            }
            if (caseKey.startsWith('response-')) {
              expect(encodingMatches(caseKey, wireAt(result.value.wire, responsePath))).toBe(true);
              return;
            }
            if (caseKey === 'decoded-value' || caseKey === 'decoded-branch') {
              // 解码值按取证响应比对：oneof 分支子字段由选中该分支的响应取证。
              expect(decodedAt(result.value.data, responsePath)).toEqual(
                decodedAt(responseCodec.fromJSON(entry.responses[evidence.index]), responsePath),
              );
              expect(decodedAt(result.value.data, responsePath)).toBeDefined();
              return;
            }
            expect(wireAt(result.value.wire, responsePath)).toBeDefined();
            return;
          }
          if (category === 'encoding-boundary') {
            const requestPath = path.slice('request.'.length);
            const index = requestEvidence(caseKey, requestPath);
            if (index < 0) {
              missingEvidence.push(`${obligation.id}/${caseKey}`);
              return;
            }
            const actual = wireAt(records[index]!.rawBody, requestPath);
            if (requestAbsenceCase(caseKey)) expect(actual).toBeUndefined();
            else expect(encodingMatches(caseKey, actual)).toBe(true);
            return;
          }
          expect(shared[name]![`${category}/${caseKey}`], `${name}/${category}/${caseKey}`).toBe(
            true,
          );
        });
      }
    }
  }
  return { names, covered, missingEvidence, missingSamples, runs, shared };
}
