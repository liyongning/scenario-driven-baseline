import type { RestOperation } from '@daqian/template-openapi';
import * as productGeneratedOperations from '@daqian/template-openapi/generated/operations';
import { createShadowServer, type RunningShadowServer } from '@template-test/shadow';
import * as engineGeneratedOperations from '../../../openapi/testing/engine/generated/operations.ts';
import { createProtocolHost, type ProtocolHost } from '../../src/hosts/protocol-host.ts';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';
import { runBrowserPlan, useBrowserDriver, type BrowserPlan } from './browser-case-support.ts';
import { accessIdentity, securitySchemes } from './openapi-wire.ts';

export type ShadowRoutes = Readonly<
  Record<
    string,
    Readonly<{ expectedRequests: ReadonlyArray<unknown>; steps: ReadonlyArray<unknown> }>
  >
>;

export { engineGeneratedOperations as engineOperations };

const engineOperationMap = Object.fromEntries(
  Object.values(engineGeneratedOperations).map((operation) => [operation.meta.id, operation]),
) as Readonly<Record<string, RestOperation>>;

export const productOperations = Object.fromEntries(
  Object.values(productGeneratedOperations).map((operation) => [operation.meta.id, operation]),
) as Readonly<Record<string, RestOperation>>;

/** 绑定浏览器驱动，返回使用引擎操作定义的 OpenAPI 计划执行函数。 */
export function createOpenApiRunner(driver: ReturnType<typeof useBrowserDriver>) {
  return async (
    host: ProtocolHost,
    plan: BrowserPlan,
    options: Readonly<Record<string, unknown>> = {},
  ) =>
    driver.runCase({}, ({ page }) =>
      runBrowserPlan(page, host, plan, { ...browserOptions(host), ...options }),
    );
}

export function browserOptions(host: ProtocolHost) {
  return {
    gatewayBaseUrl: `${host.url.replace(/\/$/, '')}/__shadow`,
    securitySchemes,
    identity: accessIdentity,
    operations: engineOperationMap,
  };
}

/** 为浏览器 OpenAPI 用例启动隔离的 Shadow 与同源协议宿主。 */
export async function withProtocolHost(
  routes: ReturnType<typeof routesFromOpenApiOperations>,
  scenarios: ShadowRoutes,
  body: (host: ProtocolHost, server: RunningShadowServer) => Promise<void>,
) {
  const server = await createShadowServer({
    routes,
    environmentClass: 'platform',
    scenarios: [{ id: 'openapi-browser', routes: scenarios as never }],
  }).start();
  const host = await createProtocolHost({
    root: process.cwd(),
    bindingName: 'web-openapi-browser',
    shadowUrl: server.url,
  });
  try {
    await body(host, server);
  } finally {
    await host.close();
    await server.close();
  }
}
