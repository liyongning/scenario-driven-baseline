import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { discoverPaymentRoutes, type ShadowRoute } from './routes.ts';
import { compareJsonPresence } from './requests.ts';
import { sendShadowStep, type ShadowStep } from './faults.ts';

export type ShadowRouteScenario = Readonly<{
  expectedRequests: ReadonlyArray<Readonly<{
    body?: unknown;
    /** 生产客户端生成动态 request_id 时，仅记录原始请求，由场景断言逐字段核验。 */
    recordOnly?: true;
    headers?: Readonly<Record<string, string>>;
  }>>;
  steps: ReadonlyArray<ShadowStep>;
}>;
export type ShadowScenario = Readonly<{
  id: string;
  routes: Partial<Record<ShadowRoute['methodName'], ShadowRouteScenario>>;
}>;
export type ShadowRequestRecord = Readonly<{
  scenarioId: string;
  methodName: ShadowRoute['methodName'];
  rawBody: unknown;
  headers: Readonly<Record<string, string | string[] | undefined>>;
}>;
export type RunningShadowServer = Readonly<{
  url: string;
  records(scenarioId?: string): ShadowRequestRecord[];
  verify(): string[];
  close(): Promise<void>;
}>;

type RouteState = { cursor: number; issues: string[] };

export function shadowUrl(address: string | AddressInfo | null): string {
  if (!address || typeof address === 'string') throw new Error('shadow server did not bind a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

export async function closeShadowListener(server: Pick<Server, 'close'>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

export function createShadowServer(options: Readonly<{ scenarios: ReadonlyArray<ShadowScenario> }>) {
  const routes = discoverPaymentRoutes();
  if (options.scenarios.length !== 1) throw new Error('a shadow server owns exactly one scenario');
  const scenario = options.scenarios[0]!;
  const states = new Map<string, RouteState>();
  const requestRecords: ShadowRequestRecord[] = [];
  for (const route of routes) {
    const configured = scenario.routes[route.methodName];
    if (configured && configured.expectedRequests.length !== configured.steps.length) {
      throw new Error(`${scenario.id}/${route.methodName}: expectedRequests and steps must have the same length`);
    }
    if (configured?.expectedRequests.some(expected => expected.recordOnly !== true && !Object.prototype.hasOwnProperty.call(expected, 'body'))) {
      throw new Error(`${scenario.id}/${route.methodName}: each expected request needs body or recordOnly`);
    }
    states.set(`${scenario.id}/${route.methodName}`, { cursor: 0, issues: [] });
  }

  return {
    async start(): Promise<RunningShadowServer> {
      const app = express();
      app.use(express.json({ strict: true }));
      for (const route of routes) {
        const register = route.httpMethod.toLowerCase() as 'post';
        app[register](route.path, async (request, response) => {
          const scenarioId = scenario.id;
          const configured = scenario.routes[route.methodName];
          if (!configured) {
            response.status(404).json({ error: 'unmatched shadow scenario' });
            return;
          }
          const state = states.get(`${scenarioId}/${route.methodName}`)!;
          const index = state.cursor;
          state.cursor += 1;
          requestRecords.push({ scenarioId, methodName: route.methodName, rawBody: request.body, headers: { ...request.headers } });
          const expectedTotal = configured.expectedRequests.length;
          if (index >= expectedTotal) {
            state.issues.push(`${scenarioId}/${route.methodName}: unexpected request ${index + 1}`);
            response.status(409).json({ error: 'unexpected request' });
            return;
          }
          const expected = configured.expectedRequests[index]!;
          const mismatches = expected.recordOnly ? [] : compareJsonPresence(expected.body, request.body);
          for (const [header, value] of Object.entries(expected.headers ?? {})) {
            const actual = request.header(header);
            if (actual !== value) mismatches.push(`$.headers.${header.toLowerCase()}: expected ${JSON.stringify(value)}, received ${JSON.stringify(actual)}`);
          }
          if (mismatches.length > 0) {
            state.issues.push(...mismatches.map(issue => `${scenarioId}/${route.methodName} request ${index + 1}: ${issue}`));
            response.status(422).json({ error: 'request mismatch', mismatches });
            return;
          }
          const step = configured.steps[index]!;
          await sendShadowStep(response, step);
        });
      }
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
          return requestRecords.filter(record => scenarioId === undefined || record.scenarioId === scenarioId);
        },
        verify() {
          const issues: string[] = [];
          for (const route of routes) {
            const configured = scenario.routes[route.methodName];
            if (!configured) continue;
            const state = states.get(`${scenario.id}/${route.methodName}`)!;
            issues.push(...state.issues);
            const expectedTotal = configured.expectedRequests.length;
            if (state.cursor < expectedTotal) issues.push(`${scenario.id}/${route.methodName}: missing request ${state.cursor + 1} of ${expectedTotal}`);
          }
          return issues;
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
