/** 跨模块平台适配器统一从装配层平台入口导出。 */
// web-example:begin
export {
  applicationContext,
  browserApplicationContext,
  resolveGatewayBaseUrl,
  type ApplicationContext,
} from './url-context';
export { createOpenApiPorts } from './openapi-ports';
export { browserClock, browserVisibility, createBrowserCancellation } from './runtime';
// web-example:end
