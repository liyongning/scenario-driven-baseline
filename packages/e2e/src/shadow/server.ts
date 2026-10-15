import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ShadowRoute } from './routes.ts';
import { toExpressRoutePath } from './routes.ts';
import { compareJsonPresence } from './requests.ts';
import { sendShadowStep, type ShadowStep } from './faults.ts';

/** 用例构造 Shadow 时传入的运行环境类别；只有平台类测试项目允许有界轮询（PC-06）。 */
export type ShadowEnvironmentClass = 'integration' | 'platform';

export type ShadowRouteScenario = Readonly<{
  expectedRequests: ReadonlyArray<
    Readonly<{
      body?: unknown;
      /** 生产客户端生成动态 X-Request-Id 时，仅记录原始请求，由场景断言逐字段核验。 */
      recordOnly?: true;
      headers?: Readonly<Record<string, string>>;
      /** 每次都变的请求头按正则校验（PC-05）：头名 → 正则，缺失或不匹配时由 verify() 报出。 */
      headerPatterns?: Readonly<Record<string, string>>;
    }>
  >;
  steps: ReadonlyArray<ShadowStep>;
  /** 有界轮询：`steps` 用完后重复最后一个 step，直到总请求数达到 `maxRequests`。 */
  poll?: Readonly<{ maxRequests: number }>;
}>;
export type ShadowScenario = Readonly<{
  id: string;
  routes: Partial<Record<ShadowRoute['methodName'], ShadowRouteScenario>>;
}>;
export type ShadowRequestRecord = Readonly<{
  scenarioId: string;
  /** 命中已注册路由时为该方法名；未注册路径的请求为 null。 */
  methodName: ShadowRoute['methodName'] | null;
  /** 实际请求路径，用于在 `verify()` 中指出未编排或未注册的请求。 */
  path: string;
  rawBody: unknown;
  headers: Readonly<Record<string, string | string[] | undefined>>;
}>;
export type RunningShadowServer = Readonly<{
  url: string;
  records(scenarioId?: string): ShadowRequestRecord[];
  verify(): string[];
  close(): Promise<void>;
}>;

export type RunningTestShadowServer = RunningShadowServer &
  Readonly<{
    /** 等待至少 count 条请求已写入记录；用于由客户端事件推进取消等确定性竞态。 */
    waitForRecords(count: number): Promise<void>;
  }>;

type RouteState = { cursor: number; issues: string[] };

/** 测试模式与预览模式共用的响应同形校验；位置信息由调用方提供。 */
export function validateShadowStep(route: ShadowRoute, step: ShadowStep, location: string): void {
  if (step.malformed !== undefined) {
    if (step.malformed.reason.trim() === '')
      throw new Error(`${location}: malformed reason must not be empty`);
    return;
  }
  // rawBody 原样发送、不做 JSON 序列化，结构校验无从进行：必须显式认领 malformed，
  // 否则会留下"不声明即不校验"的路径（PC-04）。
  if (Object.prototype.hasOwnProperty.call(step, 'rawBody'))
    throw new Error(`${location}: rawBody 必须显式声明 malformed（结构校验只覆盖 body）`);
  if (!Object.prototype.hasOwnProperty.call(step, 'body')) return;
  const issues = route.validateResponse?.(step.body, step.status ?? 200) ?? [];
  if (issues.length > 0) throw new Error(`${location}: 响应与协议不一致：${issues.join('; ')}`);
}

export function shadowUrl(address: string | AddressInfo | null): string {
  if (!address || typeof address === 'string')
    throw new Error('shadow server did not bind a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

export async function closeShadowListener(server: Pick<Server, 'close'>): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

export function createShadowServer(
  options: Readonly<{
    scenarios: ReadonlyArray<ShadowScenario>;
    routes: ReadonlyArray<ShadowRoute>;
    environmentClass: ShadowEnvironmentClass;
    mode?: 'test' | 'preview';
  }>,
) {
  if (options.mode === 'preview')
    throw new Error('createShadowServer only supports test mode; use createPreviewShadowServer');
  if (options.environmentClass === undefined)
    throw new Error('test shadow server requires environmentClass');
  if (options.scenarios.length !== 1) throw new Error('a shadow server owns exactly one scenario');
  const scenario = options.scenarios[0]!;
  const registeredPaths = new Map<string, string>();
  const states = new Map<string, RouteState>();
  const requestRecords: ShadowRequestRecord[] = [];
  const requestIssues: string[] = [];
  const recordWaiters = new Set<{
    count: number;
    resolve: () => void;
    reject: (error: Error) => void;
  }>();
  const notifyRecordWaiters = () => {
    for (const waiter of [...recordWaiters]) {
      if (requestRecords.length < waiter.count) continue;
      recordWaiters.delete(waiter);
      waiter.resolve();
    }
  };
  const recordRequest = (record: ShadowRequestRecord) => {
    requestRecords.push(record);
    notifyRecordWaiters();
  };
  for (const route of options.routes) {
    // 路径转换在构造期完成：残留花括号时立即抛错，不静默注册不可达路由。
    registeredPaths.set(route.methodName, toExpressRoutePath(route.path));
    const configured = scenario.routes[route.methodName];
    if (configured && configured.expectedRequests.length !== configured.steps.length) {
      throw new Error(
        `${scenario.id}/${route.methodName}: expectedRequests and steps must have the same length`,
      );
    }
    if (
      configured?.expectedRequests.some(
        (expected) =>
          expected.recordOnly !== true && !Object.prototype.hasOwnProperty.call(expected, 'body'),
      )
    ) {
      throw new Error(
        `${scenario.id}/${route.methodName}: each expected request needs body or recordOnly`,
      );
    }
    if (configured?.poll && configured.steps.length === 0) {
      throw new Error(`${scenario.id}/${route.methodName}: poll requires at least one step`);
    }
    // 期望请求头正则必须在构造期可编译：格式错误立即报错，不留到请求时才 500。
    configured?.expectedRequests.forEach((expected, index) => {
      for (const [header, source] of Object.entries(expected.headerPatterns ?? {})) {
        try {
          new RegExp(source);
        } catch {
          throw new Error(
            `${scenario.id}/${route.methodName}: expected request ${index + 1} headerPatterns.${header} is not a valid regex`,
          );
        }
      }
    });
    if (configured?.poll && options.environmentClass !== 'platform') {
      throw new Error(
        `${scenario.id}/${route.methodName}: poll is only available to platform test projects`,
      );
    }
    // 响应体结构校验（PC-04）：构造期完成，Fixture 与内联体走同一校验；malformed 必须显式认领。
    configured?.steps.forEach((step, index) =>
      validateShadowStep(route, step, `${scenario.id}/${route.methodName} step ${index + 1}`),
    );
    states.set(`${scenario.id}/${route.methodName}`, { cursor: 0, issues: [] });
  }

  return {
    async start(): Promise<RunningTestShadowServer> {
      const app = express();
      app.use(express.json({ strict: true }));
      for (const route of options.routes) {
        const register = route.httpMethod.toLowerCase() as 'post';
        app[register](registeredPaths.get(route.methodName)!, async (request, response) => {
          const scenarioId = scenario.id;
          const configured = scenario.routes[route.methodName];
          // 已注册但当前场景未编排：仍写入记录并由 verify() 报出未编排的请求。
          if (!configured) {
            requestIssues.push(`${scenarioId}/${route.methodName}: 未编排的请求 ${request.path}`);
            recordRequest({
              scenarioId,
              methodName: route.methodName,
              path: request.path,
              rawBody: request.body,
              headers: { ...request.headers },
            });
            response.status(404).json({ error: 'unscripted shadow scenario' });
            return;
          }
          const state = states.get(`${scenarioId}/${route.methodName}`)!;
          const index = state.cursor;
          state.cursor += 1;
          recordRequest({
            scenarioId,
            methodName: route.methodName,
            path: request.path,
            rawBody: request.body,
            headers: { ...request.headers },
          });
          const expectedTotal = configured.expectedRequests.length;
          const limit = configured.poll ? configured.poll.maxRequests : expectedTotal;
          if (index >= limit) {
            state.issues.push(
              configured.poll
                ? `${scenarioId}/${route.methodName}: 轮询超过上限 ${index + 1} > ${limit}`
                : `${scenarioId}/${route.methodName}: unexpected request ${index + 1}`,
            );
            response.status(409).json({ error: 'unexpected request' });
            return;
          }
          // steps 用完后重复最后一个期望请求，参数与请求头仍逐项校验。
          const expected = configured.expectedRequests[Math.min(index, expectedTotal - 1)]!;
          const mismatches = expected.recordOnly
            ? []
            : compareJsonPresence(expected.body, request.body);
          for (const [header, value] of Object.entries(expected.headers ?? {})) {
            const actual = request.header(header);
            if (actual !== value)
              mismatches.push(
                `$.headers.${header.toLowerCase()}: expected ${JSON.stringify(value)}, received ${JSON.stringify(actual)}`,
              );
          }
          for (const [header, source] of Object.entries(expected.headerPatterns ?? {})) {
            const actual = request.header(header);
            if (actual === undefined || !new RegExp(source).test(actual))
              mismatches.push(
                `$.headers.${header.toLowerCase()}: expected ${JSON.stringify(source)}, received ${JSON.stringify(actual)}`,
              );
          }
          if (mismatches.length > 0) {
            state.issues.push(
              ...mismatches.map(
                (issue) => `${scenarioId}/${route.methodName} request ${index + 1}: ${issue}`,
              ),
            );
            response.status(422).json({ error: 'request mismatch', mismatches });
            return;
          }
          const step = configured.steps[Math.min(index, configured.steps.length - 1)]!;
          await sendShadowStep(response, step);
        });
      }
      // 兜底处理器接住未注册路径：返回 404、写入记录，并由 verify() 报出未注册的请求。
      app.use((request, response) => {
        requestIssues.push(`${scenario.id}: 未注册的请求 ${request.method} ${request.path}`);
        recordRequest({
          scenarioId: scenario.id,
          methodName: null,
          path: request.path,
          rawBody: request.body,
          headers: { ...request.headers },
        });
        response.status(404).json({ error: 'unregistered shadow path' });
      });
      const server = await new Promise<Server>((resolve, reject) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        listener.once('error', reject);
      });
      const address = server.address();
      const url = shadowUrl(address);
      let closed = false;
      return {
        url,
        records(scenarioId) {
          return requestRecords.filter(
            (record) => scenarioId === undefined || record.scenarioId === scenarioId,
          );
        },
        waitForRecords(count) {
          if (requestRecords.length >= count) return Promise.resolve();
          return new Promise<void>((resolve, reject) => {
            recordWaiters.add({ count, resolve, reject });
          });
        },
        verify() {
          const issues: string[] = [];
          for (const route of options.routes) {
            const configured = scenario.routes[route.methodName];
            if (!configured) continue;
            const state = states.get(`${scenario.id}/${route.methodName}`)!;
            issues.push(...state.issues);
            const expectedTotal = configured.expectedRequests.length;
            if (state.cursor < expectedTotal)
              issues.push(
                `${scenario.id}/${route.methodName}: missing request ${state.cursor + 1} of ${expectedTotal}`,
              );
          }
          issues.push(...requestIssues);
          return issues;
        },
        async close() {
          if (closed) return;
          closed = true;
          for (const waiter of recordWaiters) {
            recordWaiters.delete(waiter);
            waiter.reject(new Error('shadow server closed before expected requests were recorded'));
          }
          await closeShadowListener(server);
        },
      };
    },
  };
}
