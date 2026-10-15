import { describe, expect, it } from 'vitest';

describe('template shadow gateway contract', () => {
  it('exposes only protocol-side routes and adapters', async () => {
    const shadow = await import('../index.ts');
    const protocolExports = [
      'browserSerializable',
      'discoverDeclaredRoutes',
      'idlAdapter',
      'routesFromRpcMethods',
      'run',
    ];
    // 示例出口只在标记内登记：删除示例后这个数组为空，断言仍然成立，且继续拦住多余出口。
    const exampleExports: string[] = [
      // template-example:begin
      'discoverExampleRoutes',
      // template-example:end
    ];
    const names = Object.keys(shadow).sort();
    expect(names).toEqual([...protocolExports, ...exampleExports].sort());
    // template-example:begin
    expect(shadow.discoverExampleRoutes).toEqual(expect.any(Function));
    // template-example:end
    expect(shadow.discoverDeclaredRoutes).toEqual(expect.any(Function));
    expect(shadow.routesFromRpcMethods).toEqual(expect.any(Function));
    expect(shadow.run).toEqual(expect.any(Function));
    expect(shadow.browserSerializable).toEqual(expect.any(Function));
    expect(shadow.idlAdapter).toMatchObject({
      resolveDeclaration: expect.any(Function),
      deriveObligations: expect.any(Function),
      responseValidator: expect.any(Function),
      checkFixture: expect.any(Function),
      scanCalls: expect.any(Function),
    });
    expect(names).not.toContain('createShadowServer');
    expect(names).not.toContain('compareJsonPresence');
  });
});
