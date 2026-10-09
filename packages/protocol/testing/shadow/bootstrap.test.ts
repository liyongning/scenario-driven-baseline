import { describe, expect, it } from 'vitest';

describe('template shadow gateway contract', () => {
  it('exposes example route discovery and the generic shadow tools only', async () => {
    const shadow = await import('../index.ts');

    expect(Object.keys(shadow).sort()).toEqual([
      'compareJsonPresence',
      'createShadowServer',
      'discoverExampleRoutes',
      'routesFromRpcMethods',
    ]);
    expect(shadow.discoverExampleRoutes).toEqual(expect.any(Function));
    expect(shadow.routesFromRpcMethods).toEqual(expect.any(Function));
    expect(shadow.createShadowServer).toEqual(expect.any(Function));
    expect(shadow.compareJsonPresence).toEqual(expect.any(Function));
  });
});
