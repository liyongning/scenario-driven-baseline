import { describe, expect, it } from 'vitest';
import { createHarness } from './harness.ts';

describe('createHarness', () => {
  it('records the real boundary sequence and returns immutable snapshots', () => {
    const harness = createHarness('attempt-1');
    harness.record('provider', { tokenVersion: 1 });
    harness.record('http', { path: '/pay' });
    const first = harness.snapshot();
    harness.record('outcome', { kind: 'confirmed' });

    expect(first).toEqual({
      attemptId: 'attempt-1',
      events: [
        { sequence: 1, kind: 'provider', detail: { tokenVersion: 1 } },
        { sequence: 2, kind: 'http', detail: { path: '/pay' } },
      ],
    });
    expect(harness.snapshot().events).toHaveLength(3);
  });
});
