import express from 'express';
import type { Server } from 'node:http';
import { sendShadowStep, type ShadowStep } from './faults.ts';
import type { ShadowRoute } from './routes.ts';
import { toExpressRoutePath } from './routes.ts';
import {
  closeShadowListener,
  shadowUrl,
  validateShadowStep,
  type RunningShadowServer,
  type ShadowRequestRecord,
} from './server.ts';

export type PreviewResponse = Readonly<{ status?: number; body: unknown }>;

export type PreviewEntry = Readonly<{
  operationId: string;
  /** 缺省时匹配该接口的任意路径参数；声明时按参数名与值精确匹配。 */
  pathParams?: Readonly<Record<string, string | number | boolean>>;
  responses: ReadonlyArray<PreviewResponse>;
}>;

function samePathParams(
  expected: Readonly<Record<string, string | number | boolean>>,
  actual: Readonly<Record<string, string>>,
): boolean {
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
  return (
    expectedEntries.length === actualEntries.length &&
    expectedEntries.every(
      ([key, value], index) =>
        actualEntries[index]?.[0] === key && String(value) === actualEntries[index]?.[1],
    )
  );
}

function pathParamsKey(pathParams: Readonly<Record<string, string>>): string {
  return JSON.stringify(
    Object.entries(pathParams).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function previewStep(response: PreviewResponse): ShadowStep {
  return {
    ...(response.status === undefined ? {} : { status: response.status }),
    body: response.body,
  };
}

/**
 * 本地预览专用 Shadow：只按“条目 + 实际路径参数”推进响应序列，不做次数判定。
 * 入口独立于引擎入口，依赖规则只允许预览启动器导入本模块。
 */
export function createPreviewShadowServer(
  options: Readonly<{
    routes: ReadonlyArray<ShadowRoute>;
    entries: ReadonlyArray<PreviewEntry>;
    scenarioId?: string;
    mode?: 'preview';
  }>,
) {
  if (options.mode !== undefined && options.mode !== 'preview')
    throw new Error('createPreviewShadowServer only supports preview mode');
  const scenarioId = options.scenarioId ?? 'preview';
  const routesByOperation = new Map(options.routes.map((route) => [route.methodName, route]));
  const registeredPaths = new Map<string, string>();
  const states = new Map<string, number>();
  const requestRecords: ShadowRequestRecord[] = [];

  for (const route of options.routes) {
    if (registeredPaths.has(route.methodName))
      throw new Error(`duplicate preview route operationId ${route.methodName}`);
    registeredPaths.set(route.methodName, toExpressRoutePath(route.path));
  }
  options.entries.forEach((entry, entryIndex) => {
    const route = routesByOperation.get(entry.operationId);
    if (!route)
      throw new Error(`preview entry ${entryIndex + 1}: unknown operationId ${entry.operationId}`);
    if (entry.responses.length === 0)
      throw new Error(
        `preview ${entry.operationId} entry ${entryIndex + 1}: responses must not be empty`,
      );
    entry.responses.forEach((response, responseIndex) =>
      validateShadowStep(
        route,
        previewStep(response),
        `preview ${entry.operationId} entry ${entryIndex + 1} response ${responseIndex + 1}`,
      ),
    );
  });

  return {
    async start(): Promise<RunningShadowServer> {
      const app = express();
      app.use(express.json({ strict: true }));
      for (const route of options.routes) {
        const register = route.httpMethod.toLowerCase() as 'post';
        app[register](registeredPaths.get(route.methodName)!, async (request, response) => {
          const record = (methodName: ShadowRoute['methodName'] | null) =>
            requestRecords.push({
              scenarioId,
              methodName,
              path: request.path,
              rawBody: request.body,
              headers: { ...request.headers },
            });
          const matching = options.entries
            .map((entry, entryIndex) => ({ entry, entryIndex }))
            .filter(({ entry }) => entry.operationId === route.methodName);
          const pathParams = request.params as Readonly<Record<string, string>>;
          const exact = matching.find(
            ({ entry }) =>
              entry.pathParams !== undefined && samePathParams(entry.pathParams, pathParams),
          );
          const wildcard = matching.find(({ entry }) => entry.pathParams === undefined);
          const selected = exact ?? wildcard;

          if (!selected) {
            record(route.methodName);
            console.warn(`Shadow 预览：未编排的请求 ${request.method} ${request.path}`);
            response.status(404).json({ error: 'unscripted preview route' });
            return;
          }

          record(route.methodName);
          const stateKey = `${selected.entryIndex}:${pathParamsKey(pathParams)}`;
          const cursor = states.get(stateKey) ?? 0;
          states.set(stateKey, cursor + 1);
          const selectedResponse =
            selected.entry.responses[Math.min(cursor, selected.entry.responses.length - 1)]!;
          await sendShadowStep(response, previewStep(selectedResponse));
        });
      }
      app.use((request, response) => {
        requestRecords.push({
          scenarioId,
          methodName: null,
          path: request.path,
          rawBody: request.body,
          headers: { ...request.headers },
        });
        console.warn(`Shadow 预览：未注册的请求 ${request.method} ${request.path}`);
        response.status(404).json({ error: 'unregistered preview path' });
      });
      const server = await new Promise<Server>((resolve, reject) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        listener.once('error', reject);
      });
      const url = shadowUrl(server.address());
      let closed = false;
      return {
        url,
        records(filterScenarioId) {
          return requestRecords.filter(
            (record) => filterScenarioId === undefined || record.scenarioId === filterScenarioId,
          );
        },
        verify() {
          return [];
        },
        async close() {
          if (closed) return;
          closed = true;
          await closeShadowListener(server);
        },
      };
    },
  };
}
