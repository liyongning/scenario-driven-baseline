import { expect, test, vi } from 'vitest';
import { createTrade, getTrade } from './engine/generated/operations.ts';
import adapter from './adapter';
import { discoverOpenApiRoutes, routesFromOpenApiOperations } from './shadow-routes';

test('OpenAPI routes are derived from generated descriptions and inject validators', () => {
  const routes = discoverOpenApiRoutes([createTrade, getTrade]);
  expect(
    routes.map(({ methodName, httpMethod, path }) => ({ methodName, httpMethod, path })),
  ).toEqual([
    { methodName: 'createTrade', httpMethod: 'post', path: '/api/v1/trades' },
    { methodName: 'getTrade', httpMethod: 'get', path: '/api/v1/trades/{trade_no}' },
  ]);
  expect(routes.every((route) => typeof route.validateResponse === 'function')).toBe(true);
  expect(
    routes[0]!.validateResponse!(
      {
        code: 0,
        message: 'ok',
        data: { trade_no: 'T', status: 'CREATED', amount: 1, merchant_id: 1 },
      },
      200,
    ),
  ).toEqual([]);
});

test('OpenAPI routes reject missing and inconsistent generated metadata', () => {
  expect(() =>
    routesFromOpenApiOperations([{ meta: { id: 'missing', method: 'get', path: '/missing' } }], []),
  ).toThrow(/missing/);
  expect(() =>
    routesFromOpenApiOperations(
      [{ meta: { id: 'createTrade', method: 'get', path: '/wrong' } }],
      [{ meta: { id: 'createTrade', method: 'get', path: '/wrong' } }],
    ),
  ).toThrow(/does not match contract/);
  const responseValidator = vi.spyOn(adapter, 'responseValidator').mockReturnValueOnce(undefined);
  expect(() => routesFromOpenApiOperations([createTrade], [createTrade])).toThrow(
    /no response validator/,
  );
  responseValidator.mockRestore();
});

test('OpenAPI routes preserve an empty declaration', () => {
  expect(discoverOpenApiRoutes([])).toEqual([]);
});
