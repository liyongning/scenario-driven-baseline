import { createShadowServer, type RunningShadowServer } from '@template-test/shadow';
import { createProtocolHost, type ProtocolHost } from '../../src/hosts/protocol-host.ts';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';

export type ShadowRoutes = Readonly<
  Record<
    string,
    Readonly<{ expectedRequests: ReadonlyArray<unknown>; steps: ReadonlyArray<unknown> }>
  >
>;

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
