import { describe, expect, it } from 'vitest';

describe('template shadow gateway contract', () => {
  it('exposes the generic shadow tools and declared route discovery', async () => {
    const shadow = await import('../index.ts');
    const generic = [
      'compareJsonPresence',
      'createShadowServer',
      'discoverDeclaredRoutes',
      'routesFromRpcMethods',
    ];
    const names = Object.keys(shadow).sort();
    // template-example:begin
    expect(names).toEqual([...generic, 'discoverExampleRoutes'].sort());
    expect(shadow.discoverExampleRoutes).toEqual(expect.any(Function));
    // template-example:end
    expect(names.filter((name) => !name.startsWith('discoverExample'))).toEqual(generic);
    expect(shadow.discoverDeclaredRoutes).toEqual(expect.any(Function));
    expect(shadow.routesFromRpcMethods).toEqual(expect.any(Function));
    expect(shadow.createShadowServer).toEqual(expect.any(Function));
    expect(shadow.compareJsonPresence).toEqual(expect.any(Function));
  });
});
