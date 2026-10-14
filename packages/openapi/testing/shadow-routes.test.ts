import { expect, test, vi } from 'vitest';
import { createTrade, getTrade } from './engine/generated/operations.ts';
import adapter from './adapter';
import { discoverOpenApiRoutes, routesFromOpenApiOperations } from './shadow-routes';

test('OpenAPI routes are derived from generated descriptions and inject validators', () => {
  const routes = discoverOpenApiRoutes([createTrade, getTrade], { contractCarrier: 'engine' });
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
      { contractCarrier: 'engine' },
    ),
  ).toThrow(/does not match contract/);
  const responseValidator = vi.spyOn(adapter, 'responseValidator').mockReturnValueOnce(undefined);
  expect(() =>
    routesFromOpenApiOperations([createTrade], [createTrade], { contractCarrier: 'engine' }),
  ).toThrow(/no response validator/);
  responseValidator.mockRestore();
});

test('OpenAPI routes preserve an empty declaration', () => {
  expect(discoverOpenApiRoutes([])).toEqual([]);
});

test('OpenAPI route helpers default to the product contract carrier', async () => {
  const [productOperation] = Object.values(await import('../src/generated/operations.ts'));
  if (!productOperation) throw new Error('the product contract has no generated operation');
  const responseValidator = vi.spyOn(adapter, 'responseValidator').mockReturnValue(() => []);
  expect(discoverOpenApiRoutes([productOperation])).toHaveLength(1);
  expect(routesFromOpenApiOperations([productOperation], [productOperation])).toHaveLength(1);
  expect(responseValidator).toHaveBeenCalledWith(expect.anything(), {
    manifest: { contractCarrier: 'product' },
  });
  responseValidator.mockRestore();
});
