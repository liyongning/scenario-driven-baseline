import { describe, expect, it } from 'vitest';
import { consumedOperations } from './consumed-operations';

describe('consumed operations skeleton', () => {
  it('declares only the implemented web example operations', () => {
    expect(Array.isArray(consumedOperations)).toBe(true);
    // web-example:begin
    const methods = consumedOperations.map(
      (item) => (item.method as { meta: { id: string } }).meta.id,
    );
    expect(methods).toEqual(['createTrade', 'getTrade', 'listTrades']);
    expect(methods).not.toContain('cancelTrade');
    // web-example:end
  });
});
