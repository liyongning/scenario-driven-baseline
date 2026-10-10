// @SCN-PROTOCOL-CONTRACT-002: 声明的协议义务在真实 wx.request 上逐项取证。
import automator from 'miniprogram-automator';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
// 消费接口声明不经 SDK 根入口导出：按源码读取（清单登记该模块路径，门禁同样读源码）。
import { consumedOperations } from '../../../../packages/sdk/src/consumed-operations.ts';
import {
  compareJsonPresence,
  createShadowServer,
  discoverDeclaredRoutes,
  type RunningShadowServer,
} from '@template-test/protocol';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { runWeappFunction } from '../../src/drivers/weapp.ts';

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

type MatrixEntry = Readonly<{
  request: Record<string, unknown>;
  responses: Record<string, unknown>[];
}>;
type MatrixFixture = Readonly<Record<string, MatrixEntry>>;
type ProtocolResult = Readonly<{
  ok: boolean;
  httpStatus?: number;
  wire?: Record<string, unknown>;
  decodedProjection?: Record<string, unknown>;
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

const camel = (value: string) =>
  value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const inputBody = (fixture: MatrixFixture, name: string) => {
  const value = structuredClone(entryOf(fixture, name).request);
  delete value.baseReq;
  return value;
};
const expectedBody = (fixture: MatrixFixture, name: string, sparse = false) => {
  const value = structuredClone(entryOf(fixture, name).request);
  if (sparse) delete (value.baseReq as Record<string, unknown>).productId;
  return value;
};

/** 请求 ID 每次都变：核验请求体其余字段前先去掉它，只由格式与请求头相等核验（PC-05）。 */
function withoutDynamicRequestId(body: unknown): unknown {
  const clone = structuredClone(body) as { baseReq?: Record<string, unknown> } | undefined;
  if (clone?.baseReq) delete clone.baseReq.requestId;
  return clone;
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
function serializable(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serializable(child)]),
    );
  return value;
}
const decodedAt = (root: unknown, path: string) => serializable(valueAt(root, path));
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

const success = { baseResp: { success: true, statusCode: '0' } };
const business = { baseResp: { success: false, statusCode: '123', statusMsg: 'matrix-business' } };

defineCase(
  {
    ownerId: 'SCN-PROTOCOL-CONTRACT-002',
    caseId: 'protocol-matrix',
    fixtureCase: 'protocol-matrix',
    environment: 'weapp',
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
    const planned = operations.map((operation) => {
      const name = nameOf(operation);
      const responses = entryOf(fixture, name).responses;
      return {
        name,
        request: inputBody(fixture, name),
        sparseRequest: inputBody(fixture, name),
        responseCount: responses.length,
        responsePaths: inventory.discoveries
          .filter(
            (item) =>
              item.method === name &&
              item.direction === 'response' &&
              item.applicability === 'applicable',
          )
          .map((item) => item.path),
        // 请求 ID 每次都变，请求只记录不比对；随后由本用例逐字段核验请求体（PC-05）。
        expectedRequests: [
          ...responses.map(() => ({ recordOnly: true as const })),
          { recordOnly: true as const },
          ...Array.from({ length: 6 }, () => ({ recordOnly: true as const })),
        ],
        // 与 expectedRequests 一一对应的请求体期望，逐字段核验时使用（去掉动态请求 ID）。
        bodyExpectations: [
          ...responses.map(() => expectedBody(fixture, name)),
          expectedBody(fixture, name, true),
          ...Array.from({ length: 6 }, () => expectedBody(fixture, name)),
        ],
        steps: [
          ...responses.map((body) => ({ body })),
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
        productId: 'matrix-product',
        timeoutMs: 10_000,
        methods: planned.map((item) => ({
          name: item.name,
          request: item.request,
          sparseRequest: item.sparseRequest,
          responseCount: item.responseCount,
          responsePaths: item.responsePaths,
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

    for (const operation of operations) {
      const name = nameOf(operation);
      const meta = operation.method.meta;
      const suite = result.suites[name]!;
      const responses = entryOf(fixture, name).responses;
      const methodRecords = records.filter((record) => record.methodName === name);
      const richRecord = methodRecords[0]!;
      const sparseRecord = methodRecords[responses.length]!;
      const responseCodec = meta.responseCodec;
      const emptyDecoded = responseCodec.fromJSON({});

      for (const obligation of obligationsOf(name)) {
        const match = obligation.id.match(/#([^#]+)#(.+)$/)!;
        const category = match[1]!;
        const path = match[2]!;
        for (const caseKey of obligation.cases) {
          covered.add(`${obligation.id}/${caseKey}`);
          await checkpoint(`${obligation.id}/${caseKey}`, () => {
            if (category === 'http-route') {
              expect(methodRecords.every((record) => record.methodName === name)).toBe(true);
              return;
            }
            if (category === 'request-mapping') {
              const actual = valueAt(
                caseKey === 'omitted' ? sparseRecord.rawBody : richRecord.rawBody,
                path,
              );
              if (caseKey === 'omitted') expect(actual).toBeUndefined();
              else expect(actual).toBeDefined();
              return;
            }
            if (category === 'header-base-req') {
              const omitted = caseKey.endsWith('omitted');
              const record = omitted ? sparseRecord : richRecord;
              const facts: Record<string, boolean> = {
                authorization: record.headers.authorization === 'Bearer fixture-token',
                'content-type': String(record.headers['content-type']).startsWith(
                  'application/json',
                ),
                'x-product-id-configured': record.headers['x-product-id'] === 'matrix-product',
                'x-product-id-omitted': record.headers['x-product-id'] === undefined,
                // 请求 ID 每次都变：核验头名、格式，以及头与 BaseReq.requestId 同值（PC-05）。
                'x-request-id-header':
                  record.headers.request_id === undefined &&
                  typeof record.headers['x-request-id'] === 'string',
                'x-request-id-format':
                  typeof record.headers['x-request-id'] === 'string' &&
                  requestIdPattern.test(record.headers['x-request-id']),
                'base-req-request-id':
                  valueAt(record.rawBody, 'base_req.request_id') === record.headers['x-request-id'],
                'base-req-product-id-configured':
                  valueAt(record.rawBody, 'base_req.product_id') === 'matrix-product',
                'base-req-product-id-omitted':
                  valueAt(record.rawBody, 'base_req.product_id') === undefined,
                'lane-configured': record.headers.lane === 'matrix-lane',
                'lane-omitted': record.headers.lane === undefined,
                'app-version-configured': record.headers.app_version === '1.2.3',
                'app-version-omitted': record.headers.app_version === undefined,
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
              const rich = suite.matrix[0]!;
              const absent = suite.matrix.at(-1)!;
              if (
                caseKey === 'wire-absent' ||
                caseKey.endsWith('optional-absence') ||
                caseKey.endsWith('oneof-absence')
              ) {
                expect(valueAt(absent.wire, responsePath)).toBeUndefined();
              } else if (caseKey === 'decoded-absence') {
                expect(absent.decodedProjection?.[responsePath]).toBeUndefined();
              } else if (caseKey === 'decoded-default') {
                expect(absent.decodedProjection?.[responsePath]).toEqual(
                  decodedAt(emptyDecoded, responsePath),
                );
              } else if (caseKey.startsWith('response-')) {
                expect(encodingMatches(caseKey, valueAt(rich.wire, responsePath))).toBe(true);
              } else if (caseKey === 'decoded-value' || caseKey === 'decoded-branch') {
                expect(rich.decodedProjection?.[responsePath]).toEqual(
                  decodedAt(responseCodec.fromJSON(responses[0]), responsePath),
                );
                expect(rich.decodedProjection?.[responsePath]).toBeDefined();
              } else {
                expect(valueAt(rich.wire, responsePath)).toBeDefined();
              }
              return;
            }
            if (category === 'encoding-boundary') {
              const requestPath = path.slice('request.'.length);
              const actual = valueAt(
                caseKey.endsWith('absent') ? sparseRecord.rawBody : richRecord.rawBody,
                requestPath,
              );
              if (caseKey.endsWith('absent')) expect(actual).toBeUndefined();
              else expect(encodingMatches(caseKey, actual)).toBe(true);
              return;
            }
            const map: Record<string, boolean> = {
              'response-handling/success': Boolean(
                suite.response.success.ok && suite.response.success.httpStatus === 200,
              ),
              'response-handling/business-error': Boolean(
                suite.response.business.ok &&
                valueAt(suite.response.business.wire, 'base_resp.status_code') === '123',
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
    });

    await checkpoint('real-client-path', () => {
      for (const name of declaredNames) {
        expect(records.filter((record) => record.methodName === name).length).toBe(
          entryOf(fixture, name).responses.length + 7,
        );
        expect(result.suites[name]!.matrix.every((item) => item.ok)).toBe(true);
      }
    });
  },
  { fixtureRoot },
);
