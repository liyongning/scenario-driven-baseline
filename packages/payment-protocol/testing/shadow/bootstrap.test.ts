import { describe, expect, it } from 'vitest';

describe('payment shadow gateway contract', () => {
  it('exposes generated route discovery and an isolated HTTP server', async () => {
    const shadow = await import('../index.ts');

    expect(shadow).toMatchObject({
      discoverPaymentRoutes: expect.any(Function),
      createShadowServer: expect.any(Function),
      compareJsonPresence: expect.any(Function),
    });
  });
});
