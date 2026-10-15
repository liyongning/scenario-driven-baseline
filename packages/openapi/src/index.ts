import { createFetchHttp as createFetchHttpImplementation } from './adapters/network/fetch';

export * from './generated/codes';
export * from './generated/operations';
export type { components, operations, paths } from './generated/schema';
export { createRestClient, defaultEnvelopeConvention } from './rest/client';
export type {
  EnvelopeConvention,
  Identity,
  RestClient,
  RestClientOptions,
  RestOperation,
  RestOperationContext,
  RestRequestInput,
  RestResult,
  RestTransportFailureReason,
  SecurityScheme,
} from './rest/client';
export type { Cancellation, HttpPort, HttpRequest, HttpResponse } from './ports/http';

/** 创建浏览器 HTTP 端口；只有发送时才读取平台全局。 */
export const createFetchHttp = createFetchHttpImplementation;
