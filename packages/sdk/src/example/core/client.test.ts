import { expect, test, vi, type TestContext } from 'vitest';
import type { Cancellation } from '@daqian/template-protocol';
import type { ExampleBackend, ExampleRuntimePort } from '../ports/backend';
import type { ExampleCreateInput, ExampleResourceRef } from '../contracts';
import { createExampleCore, exampleError } from './client';

const input: ExampleCreateInput = { ownerId: '42', externalRef: 'ref-1', units: 2 };
const reference: ExampleResourceRef = { id: 'trade-1', externalRef: 'ref-1' };
function source() {
  let now = 0;
  const runtime: ExampleRuntimePort = {
    nowMs: () => now,
    sleepMs: async (duration) => {
      now += duration;
    },
  };
  return runtime;
}
function stopSource(): { signal: Cancellation; stop: () => void } {
  let stopped = false;
  let listener: (() => void) | undefined;
  return {
    signal: {
      isStopped: () => stopped,
      subscribe: (callback) => {
        listener = callback;
        return () => {
          listener = undefined;
        };
      },
    },
    stop: () => {
      stopped = true;
      listener?.();
    },
  };
}
function backend(overrides: Partial<ExampleBackend> = {}): ExampleBackend {
  return {
    create: async () => ({ ok: true, value: { reference } }),
    query: async () => ({ ok: true, value: { reference, state: 'completed' } }),
    ...overrides,
  };
}
async function annotate(context: TestContext, before: number, checkpoints: string[]) {
  await context.annotate(
    JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints }),
    'scenario-evidence',
  );
}

test(
  'SCN-TEMPLATE-EXAMPLE-002 core-create-mapping',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-002',
        caseId: 'core-create-mapping',
        environment: 'sdk-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-TEMPLATE-EXAMPLE-002',
            caseKey: 'create-mapping',
            checks: ['neutral-reference'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const result = await createExampleCore({ backend: backend(), runtime: source() }).create(input);
    context.expect(result).toEqual({ ok: true, reference });
    await annotate(context, before, ['neutral-reference']);
  },
);

test(
  'SCN-TEMPLATE-EXAMPLE-003 core-create-error-mapping',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-003',
        caseId: 'core-create-error-mapping',
        environment: 'sdk-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-TEMPLATE-EXAMPLE-003',
            caseKey: 'create-error-mapping',
            checks: ['error-category', 'server-code-preserved'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const invalid = await createExampleCore({ backend: backend(), runtime: source() }).create({
      ...input,
      ownerId: '0',
    });
    context.expect(invalid).toMatchObject({ ok: false, error: { category: 'invalid_input' } });
    context.expect(invalid).toEqual({
      ok: false,
      error: context.expect.objectContaining({ category: 'invalid_input' }),
    });
    const failure = await createExampleCore({
      backend: backend({
        create: async () => ({
          ok: false,
          error: { category: 'server', message: '服务端处理失败', serverCode: '123' },
        }),
      }),
      runtime: source(),
    }).create(input);
    context
      .expect(failure)
      .toMatchObject({ ok: false, error: { category: 'server', serverCode: '123' } });
    await annotate(context, before, ['error-category', 'server-code-preserved']);
  },
);

test(
  'SCN-TEMPLATE-EXAMPLE-005 observation-budget',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-005',
        caseId: 'observation-budget',
        environment: 'sdk-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-TEMPLATE-EXAMPLE-005',
            caseKey: 'observation-budget',
            checks: ['request-timeout-local', 'window-elapsed', 'no-request-after-end'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    let calls = 0;
    const runtime = source();
    const result = await createExampleCore({
      runtime,
      policy: { requestTimeoutMs: 1, intervalMs: 1, windowMs: 3 },
      backend: backend({
        query: async () => {
          calls += 1;
          return {
            ok: false,
            error: { category: 'timeout', message: '请求超时' },
            retryable: true,
          };
        },
      }),
    }).observe(reference);
    context.expect(result).toMatchObject({ end: 'window_elapsed', lastState: 'unknown' });
    context.expect(calls).toBeGreaterThan(0);
    await annotate(context, before, [
      'request-timeout-local',
      'window-elapsed',
      'no-request-after-end',
    ]);
  },
);

test(
  'SCN-TEMPLATE-EXAMPLE-006 cancellation-rules',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-006',
        caseId: 'cancellation-rules',
        environment: 'sdk-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-TEMPLATE-EXAMPLE-006',
            caseKey: 'cancellation-rules',
            checks: ['cancel-while-waiting', 'cancel-in-flight', 'no-request-after-cancel'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const host = stopSource();
    const query = vi.fn(async () => new Promise<never>(() => undefined));
    const pending = createExampleCore({ runtime: source(), backend: backend({ query }) }).observe(
      reference,
      { cancellation: host.signal },
    );
    host.stop();
    await context.expect(pending).resolves.toMatchObject({ end: 'cancelled' });
    context.expect(query).toHaveBeenCalledTimes(1);
    await annotate(context, before, [
      'cancel-while-waiting',
      'cancel-in-flight',
      'no-request-after-cancel',
    ]);
  },
);

test('neutral core maps terminal and protocol failures', async () => {
  const completed = await createExampleCore({ runtime: source(), backend: backend() }).observe(
    reference,
  );
  expect(completed).toMatchObject({ end: 'completed', lastState: 'completed' });
  const mismatch = await createExampleCore({
    runtime: source(),
    backend: backend({
      query: async () => ({ ok: false, error: { category: 'protocol', message: '协议响应无效' } }),
    }),
  }).observe(reference);
  expect(mismatch).toMatchObject({ end: 'failed', error: { category: 'protocol' } });
  const closed = await createExampleCore({
    runtime: source(),
    backend: backend({ query: async () => ({ ok: true, value: { reference, state: 'closed' } }) }),
  }).observe(reference);
  expect(closed).toMatchObject({ end: 'closed' });
});

test('observation turns an in-flight request timeout into a local window result', async () => {
  const pending = createExampleCore({
    runtime: source(),
    policy: { requestTimeoutMs: 1, intervalMs: 1, windowMs: 2 },
    backend: backend({ query: async () => new Promise(() => undefined) }),
  });
  await expect(pending.observe(reference)).resolves.toMatchObject({ end: 'window_elapsed' });
});

test('invalid per-call policy fails before querying', async () => {
  const query = vi.fn<ExampleBackend['query']>();
  const result = await createExampleCore({
    runtime: source(),
    backend: backend({ query }),
  }).observe(reference, { policy: { intervalMs: 0 } });
  expect(result).toMatchObject({ end: 'failed', error: { category: 'invalid_input' } });
  expect(query).not.toHaveBeenCalled();
});

test('invalid create and observe inputs stop before backend calls', async () => {
  const create = vi.fn<ExampleBackend['create']>();
  const query = vi.fn<ExampleBackend['query']>();
  const client = createExampleCore({ runtime: source(), backend: backend({ create, query }) });
  for (const value of [
    null,
    { ...input, ownerId: 42 },
    { ...input, ownerId: '9223372036854775808' },
    { ...input, externalRef: '' },
    { ...input, units: 0 },
  ] as unknown as ExampleCreateInput[]) {
    await expect(client.create(value)).resolves.toMatchObject({
      ok: false,
      error: { category: 'invalid_input' },
    });
  }
  for (const value of [
    null,
    { ...reference, id: '' },
    { ...reference, externalRef: '' },
  ] as unknown as ExampleResourceRef[]) {
    await expect(client.observe(value)).resolves.toMatchObject({
      end: 'failed',
      error: { category: 'invalid_input' },
    });
  }
  for (const value of [null, [], { windowMs: 0 }, { requestTimeoutMs: Number.NaN }] as never[]) {
    await expect(client.observe(reference, { policy: value })).resolves.toMatchObject({
      end: 'failed',
      error: { category: 'invalid_input' },
    });
  }
  expect(create).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});

test('create maps transport cancellation, rejection, and local timeout', async () => {
  const runtime = source();
  const cancelled = createExampleCore({
    runtime,
    backend: backend({ create: async () => ({ ok: false, cancelled: true }) }),
  });
  await expect(cancelled.create(input)).resolves.toMatchObject({
    ok: false,
    error: { category: 'network' },
  });
  const rejected = createExampleCore({
    runtime,
    backend: backend({
      create: async () => {
        throw new Error('transport');
      },
    }),
  });
  await expect(rejected.create(input)).resolves.toMatchObject({
    ok: false,
    error: { category: 'network' },
  });
  const timeout = createExampleCore({
    runtime,
    policy: { requestTimeoutMs: 1 },
    backend: backend({ create: async () => new Promise(() => undefined) }),
  });
  await expect(timeout.create(input)).resolves.toMatchObject({
    ok: false,
    error: { category: 'timeout' },
  });
});

test('observe preserves last state across pending, retryable errors, and window expiry', async () => {
  let calls = 0;
  const query = vi.fn<ExampleBackend['query']>(async () => {
    calls += 1;
    if (calls === 1) return { ok: true, value: { reference, state: 'pending' } };
    if (calls === 2)
      return { ok: false, error: { category: 'network', message: 'temporary' }, retryable: true };
    return { ok: true, value: { reference, state: 'unknown' } };
  });
  const result = await createExampleCore({
    runtime: source(),
    policy: { intervalMs: 1, windowMs: 3 },
    backend: backend({ query }),
  }).observe(reference);
  expect(result).toMatchObject({ end: 'window_elapsed', lastState: 'unknown' });
  expect(query).toHaveBeenCalledTimes(3);
  const fatal = createExampleCore({
    runtime: source(),
    backend: backend({
      query: async () => ({
        ok: false,
        error: { category: 'server', message: 'fatal' },
        retryable: false,
      }),
    }),
  });
  await expect(fatal.observe(reference)).resolves.toMatchObject({
    end: 'failed',
    error: { category: 'server' },
  });
});

test('observe stops before request, on backend cancellation, and after sleep cancellation', async () => {
  const stopped: Cancellation = { isStopped: () => true, subscribe: () => () => undefined };
  const query = vi.fn<ExampleBackend['query']>();
  const client = createExampleCore({ runtime: source(), backend: backend({ query }) });
  await expect(client.observe(reference, { cancellation: stopped })).resolves.toMatchObject({
    end: 'cancelled',
  });
  expect(query).not.toHaveBeenCalled();
  const cancelled = createExampleCore({
    runtime: source(),
    backend: backend({ query: async () => ({ ok: false, cancelled: true }) }),
  });
  await expect(cancelled.observe(reference)).resolves.toMatchObject({ end: 'cancelled' });
  let now = 0;
  let stop = false;
  const parent: Cancellation = { isStopped: () => stop, subscribe: () => () => undefined };
  const runtime: ExampleRuntimePort = {
    nowMs: () => now,
    sleepMs: async (duration) => {
      now += duration;
      stop = true;
    },
  };
  const waiting = createExampleCore({
    runtime,
    backend: backend({ query: async () => ({ ok: true, value: { reference, state: 'pending' } }) }),
  });
  await expect(waiting.observe(reference, { cancellation: parent })).resolves.toMatchObject({
    end: 'cancelled',
    lastState: 'pending',
  });
});

test('error projection includes known server details only when present', () => {
  expect(exampleError('server', { serverCode: '123', serverDescription: 'known' })).toEqual({
    category: 'server',
    message: '服务端处理失败',
    serverCode: '123',
    serverDescription: 'known',
  });
});

test('observe closes the window before querying and after a pending query', async () => {
  const query = vi.fn<ExampleBackend['query']>(async () => ({
    ok: true,
    value: { reference, state: 'pending' },
  }));
  const earlyNow = vi.fn().mockReturnValueOnce(0).mockReturnValue(2);
  const early = createExampleCore({
    runtime: { nowMs: earlyNow, sleepMs: vi.fn() },
    policy: { windowMs: 1 },
    backend: backend({ query }),
  });
  await expect(early.observe(reference)).resolves.toMatchObject({ end: 'window_elapsed' });
  expect(query).not.toHaveBeenCalled();
  const lateNow = vi
    .fn()
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValue(1);
  const late = createExampleCore({
    runtime: { nowMs: lateNow, sleepMs: vi.fn() },
    policy: { windowMs: 1 },
    backend: backend({ query }),
  });
  await expect(late.observe(reference)).resolves.toMatchObject({
    end: 'window_elapsed',
    lastState: 'pending',
  });
  expect(query).toHaveBeenCalledTimes(1);
});

test('observe closes the window after an in-flight timeout', async () => {
  const nowMs = vi
    .fn()
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValue(1);
  const pending = createExampleCore({
    runtime: { nowMs, sleepMs: vi.fn() },
    policy: { requestTimeoutMs: 1, windowMs: 1 },
    backend: backend({ query: async () => new Promise(() => undefined) }),
  });
  await expect(pending.observe(reference)).resolves.toMatchObject({ end: 'window_elapsed' });
});

test('local request cancellation isolates listener failures', async () => {
  const notified = vi.fn();
  let signal!: Cancellation;
  const create = createExampleCore({
    runtime: source(),
    backend: backend({
      create: async (_input, operation) => {
        signal = operation.cancellation!;
        operation.cancellation?.subscribe(() => {
          throw new Error('listener');
        });
        operation.cancellation?.subscribe(notified);
        return { ok: true, value: { reference } };
      },
    }),
  });
  await expect(create.create(input)).resolves.toMatchObject({ ok: true });
  expect(notified).toHaveBeenCalledTimes(1);
  expect(signal.isStopped()).toBe(true);
  const late = vi.fn();
  signal.subscribe(late);
  expect(late).toHaveBeenCalledTimes(1);
});

test('observe handles a malformed backend failure and a stop between loop iterations', async () => {
  const malformed = createExampleCore({
    runtime: source(),
    backend: backend({ query: async () => ({ ok: false }) as never }),
  });
  await expect(malformed.observe(reference)).resolves.toMatchObject({
    end: 'failed',
    error: { category: 'network' },
  });
  let afterSleep = false;
  let checks = 0;
  const parent: Cancellation = {
    isStopped: () => afterSleep && ++checks >= 2,
    subscribe: () => () => undefined,
  };
  let now = 0;
  const runtime: ExampleRuntimePort = {
    nowMs: () => now,
    sleepMs: async (duration) => {
      now += duration;
      afterSleep = true;
    },
  };
  const client = createExampleCore({
    runtime,
    backend: backend({ query: async () => ({ ok: true, value: { reference, state: 'pending' } }) }),
  });
  await expect(client.observe(reference, { cancellation: parent })).resolves.toMatchObject({
    end: 'cancelled',
    lastState: 'pending',
  });
});
