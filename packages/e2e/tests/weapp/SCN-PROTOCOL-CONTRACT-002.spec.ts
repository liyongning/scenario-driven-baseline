// @SCN-PROTOCOL-CONTRACT-002: 声明的协议义务在真实 wx.request 上逐项取证。
import automator from 'miniprogram-automator';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
// 消费接口声明不经 SDK 根入口导出：按源码读取（清单登记该模块路径，门禁同样读源码）。
import { consumedOperations } from '../../../../packages/sdk/src/consumed-operations.ts';
import {
  compareJsonPresence,
  createShadowServer,
  type RunningShadowServer,
} from '@template-test/shadow';
import { discoverDeclaredRoutes } from '@template-test/protocol';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { runWeappFunction } from '../../src/drivers/weapp.ts';
// 宿主把解码结果按同一份投影交回用例；期望侧必须用同一个投影，比较的才是真实解码值（I-1）。
import { decodedProjection } from '../../host/weapp/protocol-runner.ts';
import {
  decodedAt,
  encodingMatches,
  matrixContext,
  missingOmissionSamples,
  omittedSample,
  requestAbsenceCase,
  requestEvidenceIndex,
  responseEvidence,
  wireAt,
  type MatrixEntry,
  type MatrixFixture,
  type RequestContext,
} from '../protocol/matrix-support.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const projectPath = new URL('../../host/weapp', import.meta.url).pathname;
const cliPath =
  process.env.WECHAT_DEVTOOLS_CLI_PATH ?? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
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

type ProtocolResult = Readonly<{
  ok: boolean;
  httpStatus?: number;
  wire?: Record<string, unknown>;
  /** 解码结果的 JSON 投影（保留缺省值、oneof 已按选中分支展开）：期望侧用同一个投影核验。 */
  decoded?: unknown;
  code?: string;
}>;
type MethodSuite = Readonly<{
  matrix: ProtocolResult[];
  response: Record<'success' | 'business' | 'http' | 'malformed', ProtocolResult>;
  errors: Record<string, ProtocolResult>;
  timeouts: Record<string, ProtocolResult>;
}>;
type SuiteResult = Readonly<{ suites: Record<string, MethodSuite> }>;

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

/** Fixture 请求体去掉基请求（宿主客户端按公共上下文填充 BaseReq）。 */
const inputBody = (fixture: MatrixFixture, name: string) => {
  const value = structuredClone(entryOf(fixture, name).request) as Record<string, unknown>;
  delete value.baseReq;
  return value;
};

/** 期望请求体：样例请求体 + 公共客户端按上下文填充的 BaseReq（请求 ID 动态，稍后去掉）。 */
function expectedBody(request: Record<string, unknown>, context: RequestContext) {
  const body = structuredClone(request) as Record<string, unknown>;
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

const success = { baseResp: { success: true, statusCode: '0' } };
const business = { baseResp: { success: false, statusCode: '123', statusMsg: 'matrix-business' } };

defineCase(
  {
    ownerId: 'SCN-PROTOCOL-CONTRACT-002',
    caseId: 'protocol-matrix',
    fixtureCase: 'protocol-matrix',
    environment: 'weapp',
    binding: 'sdk-idl-weapp',
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
    const context = matrixContext();
    const planned = operations.map((operation) => {
      const name = nameOf(operation);
      const entry = entryOf(fixture, name);
      const base = inputBody(fixture, name);
      // 每条响应一条取证请求、每个声明 omitted 的字段一条逐字段省略样例，最后一条不配置上下文。
      const samples = [
        ...entry.responses.map(() => ({ request: base, context })),
        ...(entry.omitted ?? []).map((path) => {
          const sample = omittedSample(entry, path, context);
          return { request: sample.request, context: sample.context };
        }),
        { request: base, context: {} as RequestContext },
      ];
      return {
        name,
        request: base,
        samples,
        responseCount: entry.responses.length,
        // 请求 ID 每次都变，请求只记录不比对；随后由本用例逐字段核验请求体（PC-05）。
        expectedRequests: [
          ...samples.map(() => ({ recordOnly: true as const })),
          ...Array.from({ length: 6 }, () => ({ recordOnly: true as const })),
        ],
        // 与 expectedRequests 一一对应的请求体期望，逐字段核验时使用（去掉动态请求 ID）。
        bodyExpectations: [
          ...samples.map((sample) => expectedBody(sample.request, sample.context)),
          ...Array.from({ length: 6 }, () => expectedBody(base, context)),
        ],
        steps: [
          ...entry.responses.map((body) => ({ body })),
          ...(entry.omitted ?? []).map(() => ({ body: {} as Record<string, unknown> })),
          { body: {} },
          { body: success },
          { body: business },
          { status: 503, body: business },
          {
            rawBody: '{',
            contentType: 'application/json',
            malformed: { reason: '非法 JSON 响应体（解码错误义务）' },
          },
          { delayMs: 30, body: {} },
          { disconnect: true },
        ],
      };
    });
    const server = await createShadowServer({
      routes,
      environmentClass,
      scenarios: [
        {
          id: 'weapp-protocol-matrix',
          routes: Object.fromEntries(
            planned.map((item) => [
              item.name,
              { expectedRequests: item.expectedRequests, steps: item.steps },
            ]),
          ),
        },
      ],
    }).start();
    running.add(server);
    const result = (await runWeappFunction({
      automator,
      projectPath,
      cliPath,
      functionName: 'runProtocolSuite',
      args: {
        gatewayBaseUrl: server.url,
        accessToken: 'fixture-token',
        requestContext: context,
        timeoutMs: 10_000,
        methods: planned.map((item) => ({
          name: item.name,
          request: item.request,
          samples: item.samples,
        })),
      },
    })) as SuiteResult;
    const records = server.records();
    // 请求体去掉动态请求 ID 后与 Fixture 精确比较：字段缺失与多余字段都会被报出。
    const bodyIssues = planned.flatMap((item) => {
      const methodRecords = records.filter((record) => record.methodName === item.name);
      return item.bodyExpectations.flatMap((expected, index) =>
        compareJsonPresence(expected, withoutDynamicRequestId(methodRecords[index]!.rawBody)).map(
          (issue) => `${item.name} request ${index + 1}: ${issue}`,
        ),
      );
    });
    expect([...server.verify(), ...bodyIssues]).toEqual([]);

    const missingEvidence: string[] = [];
    const missingSamples: string[] = [];
    for (const operation of operations) {
      const name = nameOf(operation);
      const meta = operation.method.meta;
      const suite = result.suites[name]!;
      const entry = entryOf(fixture, name);
      const methodRecords = records.filter((record) => record.methodName === name);
      // 矩阵取证请求最先发出：逐义务核验只看这段记录，后面的故障、超时与取消请求不参与。
      const matrixRecords = methodRecords.slice(
        0,
        entry.responses.length + (entry.omitted ?? []).length + 1,
      );
      const richRecord = matrixRecords[0]!;
      // 最后一条矩阵请求不配置公共请求上下文：提供"上下文省略"的证据（PC-01）。
      const unconfiguredRecord = matrixRecords.at(-1)!;
      const omittedRecordIndex = new Map(
        (entry.omitted ?? []).map((path, index) => [path, entry.responses.length + index]),
      );
      const responseSamples = suite.matrix
        .slice(0, entry.responses.length)
        .map((item) => ({ decoded: item.decoded, wire: item.wire }));
      const responseCodec = meta.responseCodec;
      const emptyDecoded = decodedProjection(responseCodec.fromJSON({}));

      /** 请求侧取样：规则在 matrix-support.ts 中与 integration 用例共用（缺失类必须取字段缺失的请求）。 */
      const requestEvidence = (caseKey: string, path: string): number =>
        requestEvidenceIndex(caseKey, path, matrixRecords, omittedRecordIndex);

      // 声明了 omitted 却没有逐字段省略样例：按义务 ID 报出（反例）。
      const omittedFields = obligationsOf(name)
        .filter((item) => item.id.includes('#request-mapping#') && item.cases.includes('omitted'))
        .map((item) =>
          item.id.slice(item.id.indexOf('#request-mapping#') + '#request-mapping#'.length),
        );
      for (const path of missingOmissionSamples(omittedFields, entry))
        missingSamples.push(`${name}#request-mapping#${path}`);

      for (const obligation of obligationsOf(name)) {
        const match = obligation.id.match(/#([^#]+)#(.+)$/)!;
        const category = match[1]!;
        const path = match[2]!;
        for (const caseKey of obligation.cases) {
          covered.add(`${obligation.id}/${caseKey}`);
          await checkpoint(`${obligation.id}/${caseKey}`, () => {
            if (category === 'http-route') {
              expect(matrixRecords.every((record) => record.methodName === name)).toBe(true);
              return;
            }
            if (category === 'request-mapping') {
              const index = requestEvidence(caseKey, path);
              if (index < 0) {
                missingEvidence.push(`${obligation.id}/${caseKey}`);
                return;
              }
              const actual = wireAt(matrixRecords[index]!.rawBody, path);
              if (requestAbsenceCase(caseKey)) expect(actual).toBeUndefined();
              else expect(actual).toBeDefined();
              return;
            }
            if (category === 'header-base-req') {
              const record = caseKey.endsWith('omitted') ? unconfiguredRecord : richRecord;
              const facts: Record<string, boolean> = {
                authorization: record.headers.authorization === 'Bearer fixture-token',
                'content-type': String(record.headers['content-type']).startsWith(
                  'application/json',
                ),
                'x-product-id-configured': record.headers['x-product-id'] === context.productId,
                'x-product-id-omitted': record.headers['x-product-id'] === undefined,
                // 请求 ID 每次都变：核验头名、格式，以及头与 BaseReq.requestId 同值（PC-05）。
                'x-request-id-header':
                  record.headers.request_id === undefined &&
                  typeof record.headers['x-request-id'] === 'string',
                'x-request-id-format':
                  typeof record.headers['x-request-id'] === 'string' &&
                  requestIdPattern.test(record.headers['x-request-id']),
                'base-req-request-id':
                  wireAt(record.rawBody, 'base_req.request_id') === record.headers['x-request-id'],
                'base-req-product-id-configured':
                  wireAt(record.rawBody, 'base_req.product_id') === context.productId,
                'base-req-product-id-omitted':
                  wireAt(record.rawBody, 'base_req.product_id') === undefined,
                'lane-configured': record.headers.lane === context.lane,
                'lane-omitted': record.headers.lane === undefined,
                'app-version-configured': record.headers.app_version === context.appVersion,
                'app-version-omitted': record.headers.app_version === undefined,
              };
              expect(
                facts[caseKey],
                `${caseKey}：${JSON.stringify({ headers: record.headers, body: record.rawBody })}`,
              ).toBe(true);
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
              const rich =
                evidence.kind === 'absent' ? suite.matrix.at(-1)! : suite.matrix[evidence.index]!;
              expect(rich.ok).toBe(true);
              if (!rich.ok) return;
              if (evidence.kind === 'absent') {
                if (caseKey === 'decoded-absence')
                  expect(decodedAt(rich.decoded, responsePath)).toBeUndefined();
                else if (caseKey === 'decoded-default')
                  expect(decodedAt(rich.decoded, responsePath)).toEqual(
                    decodedAt(emptyDecoded, responsePath),
                  );
                else expect(wireAt(rich.wire, responsePath)).toBeUndefined();
                return;
              }
              if (caseKey.startsWith('response-')) {
                expect(encodingMatches(caseKey, wireAt(rich.wire, responsePath))).toBe(true);
                return;
              }
              if (caseKey === 'decoded-value' || caseKey === 'decoded-branch') {
                // 解码值按取证响应比对：oneof 分支子字段由选中该分支的响应取证。
                expect(decodedAt(rich.decoded, responsePath)).toEqual(
                  decodedAt(
                    decodedProjection(responseCodec.fromJSON(entry.responses[evidence.index])),
                    responsePath,
                  ),
                );
                expect(decodedAt(rich.decoded, responsePath)).toBeDefined();
                return;
              }
              expect(wireAt(rich.wire, responsePath)).toBeDefined();
              return;
            }
            if (category === 'encoding-boundary') {
              const requestPath = path.slice('request.'.length);
              const index = requestEvidence(caseKey, requestPath);
              if (index < 0) {
                missingEvidence.push(`${obligation.id}/${caseKey}`);
                return;
              }
              const actual = wireAt(methodRecords[index]!.rawBody, requestPath);
              if (requestAbsenceCase(caseKey)) expect(actual).toBeUndefined();
              else expect(encodingMatches(caseKey, actual)).toBe(true);
              return;
            }
            const map: Record<string, boolean> = {
              'response-handling/success': Boolean(
                suite.response.success.ok && suite.response.success.httpStatus === 200,
              ),
              'response-handling/business-error': Boolean(
                suite.response.business.ok &&
                wireAt(suite.response.business.wire, 'base_resp.status_code') === '123',
              ),
              'response-handling/http-error': Boolean(
                suite.response.http.ok && suite.response.http.httpStatus === 503,
              ),
              'response-handling/malformed-body': suite.response.malformed.code === 'CODEC_ERROR',
              'error-handling/empty-access-token':
                suite.errors.emptyToken?.code === 'EMPTY_ACCESS_TOKEN',
              'error-handling/host-context-error':
                suite.errors.hostError?.code === 'HOST_CONTEXT_ERROR',
              'error-handling/network-error': suite.errors.network?.code === 'NETWORK_ERROR',
              'error-handling/cancelled': suite.errors.cancelled?.code === 'CANCELLED',
              'error-handling/codec-error': suite.errors.codecError?.code === 'CODEC_ERROR',
              'timeout/deadline-before-context': suite.timeouts.beforeContext?.code === 'TIMEOUT',
              'timeout/provider-timeout': suite.timeouts.providerTimeout?.code === 'TIMEOUT',
              'timeout/deadline-before-send': suite.timeouts.beforeSend?.code === 'TIMEOUT',
              'timeout/in-flight-timeout': suite.timeouts.inFlight?.code === 'TIMEOUT',
              'timeout/late-result-isolated': suite.timeouts.late?.code === 'TIMEOUT',
            };
            expect(map[`${category}/${caseKey}`], `${name}/${category}/${caseKey}`).toBe(true);
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
          methodName: operation.method.meta.name,
          httpMethod: operation.method.meta.method,
          path: operation.method.meta.path,
        })),
      );
      expect(routes.every((route) => typeof route.validateResponse === 'function')).toBe(true);
      expect(routes.length).toBe(declaredNames.length);
    });

    await checkpoint('matrix-iterates-declaration', () => {
      expect(planned.map((item) => item.name)).toEqual([...declaredNames]);
      for (const name of declaredNames) {
        expect(Object.prototype.hasOwnProperty.call(fixture, name)).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(result.suites, name)).toBe(true);
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
      // 声明了 omitted 的字段必须有逐字段省略样例；每条派生义务都要有取证请求/响应。
      expect(missingSamples, '声明 omitted 却没有省略样例的字段').toEqual([]);
      expect(missingEvidence, '找不到取证响应的义务').toEqual([]);
    });

    await checkpoint('real-client-path', () => {
      for (const name of declaredNames) {
        const entry = entryOf(fixture, name);
        expect(records.filter((record) => record.methodName === name).length).toBe(
          entry.responses.length + (entry.omitted ?? []).length + 7,
        );
        expect(result.suites[name]!.matrix.every((item) => item.ok)).toBe(true);
      }
    });
  },
  { fixtureRoot, timeoutMs: 30_000 },
);
