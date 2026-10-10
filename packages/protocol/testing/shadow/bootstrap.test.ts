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
    // 示例出口只在标记内登记：删除示例后这个数组为空，断言仍然成立，且继续拦住多余出口。
    const exampleExports: string[] = [
      // template-example:begin
      'discoverExampleRoutes',
      // template-example:end
    ];
    const names = Object.keys(shadow).sort();
    expect(names).toEqual([...generic, ...exampleExports].sort());
    // template-example:begin
    expect(shadow.discoverExampleRoutes).toEqual(expect.any(Function));
    // template-example:end
    expect(shadow.discoverDeclaredRoutes).toEqual(expect.any(Function));
    expect(shadow.routesFromRpcMethods).toEqual(expect.any(Function));
    expect(shadow.createShadowServer).toEqual(expect.any(Function));
    expect(shadow.compareJsonPresence).toEqual(expect.any(Function));
  });
});
