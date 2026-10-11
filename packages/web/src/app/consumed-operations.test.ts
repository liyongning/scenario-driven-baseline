import { describe, expect, it } from 'vitest';
import { consumedOperations } from './consumed-operations';

describe('consumed operations skeleton', () => {
  it('starts empty until the example declares operations', () => {
    expect(consumedOperations).toEqual([]);
  });
});
