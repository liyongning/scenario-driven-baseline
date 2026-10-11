import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createControlledRoot } from '../../tests/tooling/controlled-root.ts';

const state = vi.hoisted(() => ({
  registered: undefined as undefined | ((context: unknown) => Promise<void>),
  fixtureRoots: [] as string[],
  testOptions: [] as unknown[],
}));

vi.mock('vitest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vitest')>();
  return {
    ...actual,
    test: vi.fn((_name: string, options: unknown, body: (context: unknown) => Promise<void>) => {
      state.testOptions.push(options);
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

function context(filepath?: string) {
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
  return {
    expect: localExpect,
    annotate: vi.fn(async () => undefined),
    ...(filepath ? { task: { file: { filepath } } } : {}),
  };
}

describe('defineCase execution', () => {
  beforeEach(() => {
    state.registered = undefined;
    state.fixtureRoots.length = 0;
    state.testOptions.length = 0;
  });

  it('loads the fixture, records assertions, and annotates executed checkpoints', async () => {
    let environmentClass: string | undefined;
    defineCase(
      binding,
      async ({ fixture, environmentClass: resolvedClass, expect: localExpect, checkpoint }) => {
        environmentClass = resolvedClass;
        await checkpoint('wire', () => localExpect((fixture as { value: number }).value).toBe(1));
      },
      { fixtureRoot: '/fixtures' },
    );
    const testContext = context();
    await state.registered!(testContext);
    expect(state.fixtureRoots).toEqual(['/fixtures']);
    expect(environmentClass).toBe('integration');
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

  it('uses the requested timeout while keeping the default for existing cases', () => {
    defineCase(binding, () => undefined, { timeoutMs: 12_345 });
    expect(state.testOptions[0]).toMatchObject({ timeout: 12_345 });
    defineCase(binding, () => undefined);
    expect(state.testOptions[1]).toMatchObject({ timeout: 5_000 });
  });

  it('validates the runtime binding with the test file path when Vitest provides it', async () => {
    defineCase(binding, ({ expect: localExpect, checkpoint }) => {
      localExpect(true).toBe(true);
      return checkpoint('wire', () => localExpect(true).toBe(true));
    });
    await state.registered!(context('/repo/packages/e2e/tests/tooling/runtime-binding.spec.ts'));
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

  it('rejects binding drift before executing the test body', async () => {
    const fixture = createControlledRoot({ prefix: 'define-case-runtime-' });
    const repositoryRoot = process.cwd();
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(repositoryRoot);
    let executed = false;
    try {
      defineCase(
        { ...binding, binding: 'sdk-idl-weapp' },
        () => {
          executed = true;
        },
        { fixtureRoot: '/fixtures' },
      );
      cwd.mockReturnValue(fixture.root);
      await expect(state.registered!(context())).rejects.toThrow(/is not registered/);
      expect(executed).toBe(false);
    } finally {
      cwd.mockRestore();
      fixture.cleanup();
    }
  });
});
