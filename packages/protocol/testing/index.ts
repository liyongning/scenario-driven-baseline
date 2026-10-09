export { createShadowServer, type RunningShadowServer } from './shadow/server.ts';
export type { ShadowEnvironmentClass } from './shadow/server.ts';
// template-example:begin
export { discoverExampleRoutes } from './shadow/example/routes.ts';
// template-example:end
export { discoverDeclaredRoutes } from './shadow/declared-routes.ts';
export { routesFromRpcMethods } from './shadow/idl-routes.ts';
export type { ShadowRoute } from './shadow/routes.ts';
export { compareJsonPresence } from './shadow/requests.ts';
export type { ShadowStep } from './shadow/faults.ts';
