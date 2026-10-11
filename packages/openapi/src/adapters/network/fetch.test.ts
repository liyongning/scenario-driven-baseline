import { afterEach, expect, test, vi, type TestContext } from 'vitest';
import type { Cancellation, HttpRequest } from '../../ports/http';
import { createFetchHttp } from './fetch';

type Checkpoint = (name: string, assertion: () => void | Promise<void>) => Promise<void>;

function evidence(
  name: string,
  checks: string[],
  body: (context: TestContext, checkpoint: Checkpoint) => Promise<void>,
) {
  test(
    name,
    {
      meta: {
        scenarioCase: {
          ownerId: 'SCN-OPENAPI-CONTRACT-028',
          caseId: 'fetch-adapter-unit',
          fixtureCase: null,
          environment: 'openapi-unit',
          covers: [{ id: 'SCN-OPENAPI-CONTRACT-028', caseKey: 'fetch-adapter-unit', checks }],
        },
      },
    },
    async (context) => {
      const executed: string[] = [];
      await body(context, async (checkpoint, assertion) => {
        await assertion();
        executed.push(checkpoint);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    url: 'https://example.invalid/api',
    method: 'PATCH',
    headers: { 'X-Request-Id': 'fixture' },
    timeoutMs: 100,
    ...overrides,
  };
}

function cancellation() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const source: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    stop() {
      stopped = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

evidence(
  'SCN-OPENAPI-CONTRACT-028 fetch-adapter-unit',
  [
    'lazy-global',
    'no-access-when-stopped',
    'timeout-vs-cancel',
    'body-in-budget',
    'single-delivery',
    'no-replay',
    'request-options',
  ],
  async (context, checkpoint) => {
    const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    let reads = 0;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      get() {
        reads += 1;
        return async (url: string, init: RequestInit) => {
          calls.push({ url, init });
          return new Response('{}', { status: 200 });
        };
      },
    });
    try {
      const http = createFetchHttp();
      await checkpoint('lazy-global', () => context.expect(reads).toBe(0));
      await checkpoint('request-options', async () => {
        await context.expect(http.send(request())).resolves.toMatchObject({
          ok: true,
          value: { status: 200, body: '{}' },
        });
        context.expect(calls[0]!.init).toMatchObject({
          method: 'PATCH',
          credentials: 'same-origin',
          cache: 'no-store',
        });
      });
      await checkpoint('no-replay', () => context.expect(calls).toHaveLength(1));
      await checkpoint('no-access-when-stopped', async () => {
        const source = cancellation();
        source.stop();
        await context
          .expect(http.send(request({ cancellation: source.source })))
          .resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
        await context
          .expect(http.send(request({ timeoutMs: 0 })))
          .resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });
        context.expect(calls).toHaveLength(1);
      });
      await checkpoint('timeout-vs-cancel', async () => {
        vi.useFakeTimers();
        let aborts = 0;
        vi.stubGlobal(
          'AbortController',
          class {
            readonly signal = {};
            abort() {
              aborts += 1;
            }
          },
        );
        vi.stubGlobal('fetch', () => new Promise(() => undefined));
        const timeout = http.send(request({ timeoutMs: 10 }));
        await vi.advanceTimersByTimeAsync(10);
        await context.expect(timeout).resolves.toEqual({
          ok: false,
          error: { code: 'TIMEOUT' },
        });
        expect(aborts).toBe(1);

        const source = cancellation();
        const cancelled = http.send(request({ timeoutMs: 10, cancellation: source.source }));
        source.stop();
        await context.expect(cancelled).resolves.toEqual({
          ok: false,
          error: { code: 'CANCELLED' },
        });
        expect(aborts).toBe(2);
      });
      await checkpoint('body-in-budget', async () => {
        vi.useFakeTimers();
        let resolveBody!: (value: string) => void;
        vi.stubGlobal('fetch', () => ({
          status: 200,
          headers: { forEach: () => undefined },
          text: () => new Promise<string>((resolve) => (resolveBody = resolve)),
        }));
        const pending = http.send(request({ timeoutMs: 10 }));
        await vi.advanceTimersByTimeAsync(10);
        await context.expect(pending).resolves.toEqual({
          ok: false,
          error: { code: 'TIMEOUT' },
        });
        resolveBody('{}');
        await Promise.resolve();
      });
      await checkpoint('single-delivery', async () => {
        vi.useFakeTimers();
        let resolveBody!: (value: string) => void;
        vi.stubGlobal('fetch', () => ({
          status: 200,
          headers: { forEach: () => undefined },
          text: () => new Promise<string>((resolve) => (resolveBody = resolve)),
        }));
        const source = cancellation();
        let deliveries = 0;
        const pending = http
          .send(request({ timeoutMs: 10, cancellation: source.source }))
          .then((value) => {
            deliveries += 1;
            return value;
          });
        await Promise.resolve();
        source.stop();
        resolveBody('{}');
        await vi.advanceTimersByTimeAsync(10);
        await context.expect(pending).resolves.toEqual({
          ok: false,
          error: { code: 'CANCELLED' },
        });
        context.expect(deliveries).toBe(1);
      });
    } finally {
      if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
      else delete (globalThis as { fetch?: unknown }).fetch;
    }
  },
);

test('fetch adapter maps transport and platform failures without rejecting', async () => {
  vi.useFakeTimers();
  const http = createFetchHttp();
  vi.stubGlobal('fetch', () => Promise.reject(new Error('disconnected')));
  await expect(http.send(request())).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  vi.stubGlobal('fetch', () => {
    throw new Error('throw synchronously');
  });
  await expect(http.send(request())).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  vi.stubGlobal('fetch', () => ({
    status: 200,
    headers: { forEach: () => undefined },
    text: () => Promise.reject(new Error('body failed')),
  }));
  await expect(http.send(request())).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  vi.stubGlobal('fetch', () => ({
    status: 200,
    headers: {
      forEach: () => {
        throw new Error('headers failed');
      },
    },
    text: () => Promise.resolve('{}'),
  }));
  await expect(http.send(request())).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  vi.stubGlobal('fetch', () => ({
    status: 200,
    headers: { forEach: () => undefined },
    text: () => {
      throw new Error('text threw');
    },
  }));
  await expect(http.send(request())).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });
});

test('fetch adapter rejects missing globals and failing cancellation subscriptions', async () => {
  vi.stubGlobal('fetch', undefined);
  await expect(createFetchHttp().send(request())).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  vi.stubGlobal(
    'AbortController',
    class {
      readonly signal = {};
      abort() {}
    },
  );
  vi.stubGlobal('fetch', async () => new Response('{}'));
  const throwingCancellation: Cancellation = {
    isStopped: () => false,
    subscribe: () => {
      throw new Error('subscription failed');
    },
  };
  await expect(
    createFetchHttp().send(request({ cancellation: throwingCancellation })),
  ).resolves.toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });

  vi.stubGlobal('AbortController', undefined);
  await expect(createFetchHttp().send(request())).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });
});

test('fetch adapter tolerates abort failures', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'AbortController',
    class {
      readonly signal = {};
      abort() {
        throw new Error('abort failed');
      }
    },
  );
  vi.stubGlobal('fetch', () => new Promise(() => undefined));
  const pending = createFetchHttp().send(request({ timeoutMs: 1 }));
  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });
});

test('fetch adapter maps AbortController constructor and global access failures', async () => {
  vi.stubGlobal(
    'AbortController',
    class {
      constructor() {
        throw new Error('constructor failed');
      }
    },
  );
  vi.stubGlobal('fetch', vi.fn());
  await expect(createFetchHttp().send(request())).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  vi.stubGlobal(
    'AbortController',
    class {
      readonly signal = {};
      abort() {}
    },
  );
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    get() {
      throw new Error('global access failed');
    },
  });
  try {
    await expect(createFetchHttp().send(request())).resolves.toEqual({
      ok: false,
      error: { code: 'NETWORK_ERROR' },
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'fetch', descriptor);
    else delete (globalThis as { fetch?: unknown }).fetch;
  }
});

test('fetch adapter includes a body and ignores a response delivered after timeout', async () => {
  vi.useFakeTimers();
  let init: RequestInit | undefined;
  let resolveResponse!: (response: Response) => void;
  vi.stubGlobal(
    'AbortController',
    class {
      readonly signal = {};
      abort() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    (_url: string, options: RequestInit) =>
      new Promise<Response>((resolve) => {
        init = options;
        resolveResponse = resolve;
      }),
  );

  const pending = createFetchHttp().send(request({ timeoutMs: 10, body: '{"fixture":true}' }));
  expect(init?.body).toBe('{"fixture":true}');
  await vi.advanceTimersByTimeAsync(10);
  await expect(pending).resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });
  resolveResponse(new Response('{}', { status: 200 }));
  await Promise.resolve();
});

test('fetch adapter settles once when cancellation emits synchronously twice', async () => {
  vi.stubGlobal(
    'AbortController',
    class {
      readonly signal = {};
      abort() {}
    },
  );
  vi.stubGlobal('fetch', () => new Promise(() => undefined));
  const duplicate: Cancellation = {
    isStopped: () => false,
    subscribe(listener) {
      listener();
      listener();
      return () => undefined;
    },
  };
  await expect(createFetchHttp().send(request({ cancellation: duplicate }))).resolves.toEqual({
    ok: false,
    error: { code: 'CANCELLED' },
  });
});
