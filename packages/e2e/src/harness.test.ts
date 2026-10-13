import { describe, expect, it, test } from 'vitest';
import { createHarness, waitForCalls } from './harness.ts';

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

test(
  'SCN-BROWSER-PLATFORM-009 harness-wait-for-calls',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-009',
        caseId: 'harness-wait-for-calls',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-009',
            caseKey: 'harness-wait-for-calls',
            checks: ['resolves-on-condition', 'timeout-reports-records'],
          },
        ],
      },
    },
  },
  async (context) => {
    const records: string[] = [];
    const pending = waitForCalls(
      () => records,
      (items) => items.length === 2,
      {
        timeoutMs: 500,
        intervalMs: 10,
      },
    );
    setTimeout(() => records.push('first', 'second'), 25);
    await context.expect(pending).resolves.toEqual(['first', 'second']);

    await context
      .expect(
        waitForCalls(
          () => records,
          (items) => items.includes('third'),
          {
            timeoutMs: 40,
            intervalMs: 10,
          },
        ),
      )
      .rejects.toThrow(/\["first","second"\]/);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: ['resolves-on-condition', 'timeout-reports-records'],
      }),
      'scenario-evidence',
    );
  },
);

test('waitForCalls uses default timing when options are omitted', async () => {
  await expect(
    waitForCalls(
      () => ['ready'],
      (items) => items.length === 1,
    ),
  ).resolves.toEqual(['ready']);
});
