import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  registered: undefined as undefined | ((context: unknown) => Promise<void>),
  fixtureRoots: [] as string[],
}));

vi.mock('vitest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vitest')>();
  return {
    ...actual,
    test: vi.fn((_name: string, _options: unknown, body: (context: unknown) => Promise<void>) => {
      state.registered = body;
    }),
  };
});
vi.mock('./fixture-loader.ts', () => ({
  loadFixtureCase: vi.fn(async ({ root }: { root: string }) => {
    state.fixtureRoots.push(root);
    return { data: { value: 1 } };
  }),
}));

import { defineCase } from './define-case.ts';

const binding = {
  ownerId: 'SCN-SAMPLE-CONTRACT-023',
  caseId: 'execute',
  environment: 'integration' as const,
  fixtureCase: 'omitted',
  covers: [{ id: 'SCN-SAMPLE-CONTRACT-023', caseKey: 'omitted', checks: ['wire'] }],
};

function context() {
  let assertionCalls = 0;
  const localExpect = Object.assign(
    (received: unknown) => ({
      toBe(expected: unknown) {
        assertionCalls += 1;
        expect(received).toBe(expected);
      },
    }),
    { getState: () => ({ assertionCalls }) },
  );
  return { expect: localExpect, annotate: vi.fn(async () => undefined) };
}

describe('defineCase execution', () => {
  beforeEach(() => {
    state.registered = undefined;
    state.fixtureRoots.length = 0;
  });

  it('loads the fixture, records assertions, and annotates executed checkpoints', async () => {
    defineCase(
      binding,
      async ({ fixture, expect: localExpect, checkpoint }) => {
        await checkpoint('wire', () => localExpect((fixture as { value: number }).value).toBe(1));
      },
      { fixtureRoot: '/fixtures' },
    );
    const testContext = context();
    await state.registered!(testContext);
    expect(state.fixtureRoots).toEqual(['/fixtures']);
    expect(testContext.annotate).toHaveBeenCalledWith(
      JSON.stringify({ assertions: 1, checkpoints: ['wire'] }),
      'scenario-evidence',
    );
  });

  it('records continuous FLOW stages only for a FLOW binding', async () => {
    defineCase(
      { ...binding, flowId: 'FLOW-SAMPLE-001', flowCase: 'normal' },
      async ({ flow, expect: localExpect, checkpoint }) => {
        await checkpoint('wire', () => localExpect(true).toBe(true));
        await flow('attempt-one', ['prepare', 'invoke', 'result']);
      },
    );
    const testContext = context();
    await state.registered!(testContext);
    expect(testContext.annotate).toHaveBeenCalledWith(
      JSON.stringify({
        id: 'FLOW-SAMPLE-001',
        caseKey: 'normal',
        continuityId: 'attempt-one',
        stages: ['prepare', 'invoke', 'result'],
      }),
      'scenario-flow',
    );

    defineCase(binding, async ({ flow, expect: localExpect, checkpoint }) => {
      await checkpoint('wire', () => localExpect(true).toBe(true));
      await expect(flow('attempt-two', ['prepare'])).rejects.toThrow(/FLOW binding/);
    });
    await state.registered!(context());
  });

  it('rejects bodies without assertions or required checkpoints and uses the default fixture root', async () => {
    defineCase(binding, () => undefined);
    await expect(state.registered!(context())).rejects.toThrow(/executed no assertions/);
    expect(state.fixtureRoots[0]).toContain('packages/e2e/tests/fixtures');

    defineCase(binding, ({ expect: localExpect }) => {
      localExpect(true).toBe(true);
    });
    await expect(state.registered!(context())).rejects.toThrow(/did not execute checkpoint wire/);
  });

  it('rejects invalid bindings before registering a test', () => {
    expect(() => defineCase({ ...binding, caseId: '' }, () => undefined)).toThrow(/caseId/);
  });
});
