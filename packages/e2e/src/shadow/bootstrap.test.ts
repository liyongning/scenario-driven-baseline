import { describe, expect, it } from 'vitest';

describe('shadow engine entry', () => {
  it('exposes the neutral engine tools from the test package', async () => {
    const shadow = await import('./index.ts');
    const names = Object.keys(shadow).sort();
    expect(names).toEqual(
      [
        'closeShadowListener',
        'compareJsonPresence',
        'createShadowServer',
        'shadowUrl',
        'toExpressRoutePath',
      ].sort(),
    );
  });
});
