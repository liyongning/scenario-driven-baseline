export { default as idlAdapter } from './adapter.ts';
// template-example:begin
export { discoverExampleRoutes } from './shadow/example/routes.ts';
// template-example:end
export { discoverDeclaredRoutes } from './shadow/declared-routes.ts';
export { routesFromRpcMethods } from './shadow/idl-routes.ts';
export type { ShadowRoute } from './shadow/routes.ts';
export * from './browser-runner.ts';
