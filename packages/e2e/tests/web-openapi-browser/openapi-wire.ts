import {
  createFetchHttp,
  createRestClient,
  type EnvelopeConvention,
  type HttpPort,
  type Identity,
  type RestClient,
  type RestOperation,
} from '@daqian/template-openapi';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';
import type { OpenApiContract } from '../../../openapi/testing/contract.ts';

export const securitySchemes = {
  accessToken: { type: 'apiKey', in: 'header', name: 'X-Access-Token' },
  operatorToken: { type: 'apiKey', in: 'header', name: 'X-Operator-Token' },
} as const;

export const accessIdentity = { scheme: 'accessToken', token: 'fixture-token' } as const;
export const operatorIdentity = { scheme: 'operatorToken', token: 'operator-token' } as const;

export function clientFor(
  url: string,
  options: Readonly<{
    http?: HttpPort;
    identity?: Identity | null;
    envelope?: EnvelopeConvention;
  }> = {},
): RestClient {
  return createRestClient({
    gatewayBaseUrl: url,
    http: options.http ?? createFetchHttp(),
    securitySchemes,
    ...(options.identity === null ? {} : { identity: options.identity ?? accessIdentity }),
    ...(options.envelope ? { envelope: options.envelope } : {}),
  });
}

export function routesFor(
  required: ReadonlyArray<RestOperation>,
  candidates: ReadonlyArray<RestOperation> = required,
  contract?: OpenApiContract,
) {
  return routesFromOpenApiOperations(required, candidates, {
    ...(contract ? { contract } : {}),
  });
}
