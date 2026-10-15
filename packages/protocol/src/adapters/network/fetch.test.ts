import { afterEach, expect, test, vi } from 'vitest';
import type { Cancellation } from '../../ports/context';
import type { HttpRequest } from '../../ports/http';

type FetchCall = Readonly<{ url: string; init: RequestInit }>;
type FetchResponse = Readonly<{
  status: number;
  headers: { forEach(callback: (value: string, key: string) => void): void };
  text(): Promise<unknown>;
}>;
type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponse> | FetchResponse;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installation(handler: FetchLike) {
  const calls: FetchCall[] = [];
  const platform = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  });
  vi.stubGlobal('fetch', platform);
  return { calls, platform };
}

function cancellationSource() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const cancellation: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    cancellation,
    stop() {
      stopped = true;
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

const request: HttpRequest = {
  url: 'https://gateway.invalid/resource?unchanged=1',
  method: 'POST',
  headers: { lane: 'test-lane', 'Content-Type': 'application/json' },
  body: '{ "signData": "  raw " }',
  timeoutMs: 125,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test(
  'SCN-PROTOCOL-CONTRACT-017 fetch-adapter-rules',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-017',
        caseId: 'fetch-adapter-rules',
        fixtureCase: null,
        environment: 'protocol-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-017',
            caseKey: 'fetch-adapter-rules',
            checks: [
              'lazy-global',
              'pre-send-short-circuit',
              'single-delivery',
              'timeout-cancel-distinct',
              'http-and-network-results',
              'no-replay-and-options',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    vi.useFakeTimers();
    vi.resetModules();

    // lazy-global：动态导入与工厂创建都不能读取 fetch。
    const priorFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      get() {
        throw new Error('fetch read during import or creation');
      },
    });
    let createFetchHttp!: typeof import('./fetch').createFetchHttp;
    try {
      const module = await import('./fetch');
      createFetchHttp = module.createFetchHttp;
      context.expect(createFetchHttp().send).toBeTypeOf('function');
    } finally {
      if (priorFetch) Object.defineProperty(globalThis, 'fetch', priorFetch);
      else Reflect.deleteProperty(globalThis, 'fetch');
    }

    // pre-send-short-circuit：停止或零/负预算均不访问平台。
    const neverCalled = installation(() => Promise.reject(new Error('must not fetch')));
    const stopped = cancellationSource();
    stopped.stop();
    await context
      .expect(createFetchHttp().send({ ...request, cancellation: stopped.cancellation }))
      .resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
    for (const timeoutMs of [0, -1])
      await context
        .expect(createFetchHttp().send({ ...request, timeoutMs }))
        .resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });
    context.expect(neverCalled.calls).toEqual([]);
    context.expect(vi.getTimerCount()).toBe(0);

    // HTTP 非 2xx 原样作为有效响应，选项固定且每次只调用一次 fetch。
    for (const status of [200, 500]) {
      const installed = installation(
        () =>
          new Response('{ "baseResp": {"statusCode": 401} }', {
            status,
            headers: { 'X-Response': ' unchanged ' },
          }),
      );
      await context.expect(createFetchHttp().send(request)).resolves.toMatchObject({
        ok: true,
        value: {
          status,
          headers: { 'x-response': 'unchanged' },
          body: '{ "baseResp": {"statusCode": 401} }',
        },
      });
      context.expect(installed.platform).toHaveBeenCalledTimes(1);
      context.expect(installed.calls[0]!.url).toBe(request.url);
      context.expect(installed.calls[0]!.init).toMatchObject({
        method: 'POST',
        headers: request.headers,
        body: request.body,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      context
        .expect(Object.keys(installed.calls[0]!.init).sort())
        .toEqual(['body', 'cache', 'credentials', 'headers', 'method', 'signal']);
    }

    // GET 无 body 时保持省略，不能制造空请求体。
    const get = installation(() => new Response('{}'));
    await createFetchHttp().send({
      url: 'https://gateway.invalid/query',
      method: 'GET',
      headers: {},
      timeoutMs: 25,
    });
    context.expect(get.calls[0]!.init).not.toHaveProperty('body');

    // 超时与取消分别覆盖 fetch 返回前、响应体读取中；两者都 abort 且结果不同。
    const timeoutHeaders = deferred<FetchResponse>();
    let timeoutHeadersSignal: AbortSignal | undefined;
    installation((_url, init) => {
      timeoutHeadersSignal = init.signal ?? undefined;
      return timeoutHeaders.promise;
    });
    const pendingTimeoutHeaders = createFetchHttp().send({ ...request, timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    context.expect(timeoutHeadersSignal?.aborted).toBe(true);
    await context
      .expect(pendingTimeoutHeaders)
      .resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });

    const timeoutBody = deferred<string>();
    let timeoutBodySignal: AbortSignal | undefined;
    installation((_url, init) => {
      timeoutBodySignal = init.signal ?? undefined;
      return { status: 200, headers: new Headers(), text: () => timeoutBody.promise };
    });
    const pendingTimeoutBody = createFetchHttp().send({ ...request, timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    context.expect(timeoutBodySignal?.aborted).toBe(true);
    await context
      .expect(pendingTimeoutBody)
      .resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });

    const cancelHeaders = cancellationSource();
    const cancelHeadersResponse = deferred<FetchResponse>();
    let cancelHeadersSignal: AbortSignal | undefined;
    installation((_url, init) => {
      cancelHeadersSignal = init.signal ?? undefined;
      return cancelHeadersResponse.promise;
    });
    const pendingCancelHeaders = createFetchHttp().send({
      ...request,
      cancellation: cancelHeaders.cancellation,
    });
    cancelHeaders.stop();
    context.expect(cancelHeadersSignal?.aborted).toBe(true);
    await context
      .expect(pendingCancelHeaders)
      .resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });

    const cancelBody = cancellationSource();
    const cancelBodyText = deferred<string>();
    let cancelBodySignal: AbortSignal | undefined;
    installation((_url, init) => {
      cancelBodySignal = init.signal ?? undefined;
      return { status: 200, headers: new Headers(), text: () => cancelBodyText.promise };
    });
    const pendingCancelBody = createFetchHttp().send({
      ...request,
      cancellation: cancelBody.cancellation,
    });
    cancelBody.stop();
    context.expect(cancelBodySignal?.aborted).toBe(true);
    await context
      .expect(pendingCancelBody)
      .resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });

    // 平台拒绝与平台缺失都映射为 NETWORK_ERROR。
    const rejected = installation(() => Promise.reject(new Error('offline')));
    await context
      .expect(createFetchHttp().send(request))
      .resolves.toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });
    context.expect(rejected.platform).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', undefined);
    await context
      .expect(createFetchHttp().send(request))
      .resolves.toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });

    // single-delivery：超时先锁定结果，迟到的成功响应不得覆盖或二次交付。
    const late = deferred<FetchResponse>();
    installation(() => late.promise);
    const pendingLate = createFetchHttp().send({ ...request, timeoutMs: 10 });
    const delivered = vi.fn();
    void pendingLate.then(delivered);
    await vi.advanceTimersByTimeAsync(10);
    late.resolve(new Response('{}'));
    await vi.runAllTimersAsync();
    await context.expect(pendingLate).resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });
    context.expect(delivered).toHaveBeenCalledTimes(1);
    context.expect(stopped.listenerCount).toBe(0);
    context.expect(cancelHeaders.listenerCount).toBe(0);
    context.expect(cancelBody.listenerCount).toBe(0);
    context.expect(vi.getTimerCount()).toBe(0);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: [
          'lazy-global',
          'pre-send-short-circuit',
          'single-delivery',
          'timeout-cancel-distinct',
          'http-and-network-results',
          'no-replay-and-options',
        ],
      }),
      'scenario-evidence',
    );
  },
);

test('fetch 适配器边界分支保持一次交付与清理', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const { createFetchHttp } = await import('./fetch');

  const synchronousStop = installation(() => Promise.reject(new Error('must not fetch')));
  const unsubscribe = vi.fn();
  await expect(
    createFetchHttp().send({
      ...request,
      cancellation: {
        isStopped: () => false,
        subscribe(listener) {
          listener();
          return unsubscribe;
        },
      },
    }),
  ).resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(synchronousStop.calls).toEqual([]);

  const duplicateStop = installation(() => Promise.reject(new Error('must not fetch')));
  await expect(
    createFetchHttp().send({
      ...request,
      cancellation: {
        isStopped: () => false,
        subscribe(listener) {
          listener();
          listener();
          return () => undefined;
        },
      },
    }),
  ).resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
  expect(duplicateStop.calls).toEqual([]);

  const priorFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    get() {
      throw new Error('global getter failed');
    },
  });
  await expect(createFetchHttp().send(request)).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });
  if (priorFetch) Object.defineProperty(globalThis, 'fetch', priorFetch);
  else Reflect.deleteProperty(globalThis, 'fetch');

  vi.stubGlobal('fetch', undefined);
  await expect(createFetchHttp().send(request)).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  installation(() => {
    throw new Error('fetch threw synchronously');
  });
  await expect(createFetchHttp().send(request)).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  installation(() => ({
    status: 200,
    headers: new Headers(),
    text() {
      throw new Error('text threw synchronously');
    },
  }));
  await expect(createFetchHttp().send(request)).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  installation(() => ({
    status: 200,
    headers: {
      forEach() {
        throw new Error('headers threw');
      },
    },
    text: async () => '{}',
  }));
  await expect(createFetchHttp().send(request)).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  installation(() => ({
    status: 200,
    headers: new Headers(),
    text: async () => Promise.reject(new Error('body failed')),
  }));
  await expect(createFetchHttp().send(request)).resolves.toEqual({
    ok: false,
    error: { code: 'NETWORK_ERROR' },
  });

  const lateBody = deferred<string>();
  installation(() => ({
    status: 200,
    headers: new Headers(),
    text: () => lateBody.promise,
  }));
  const timedOut = createFetchHttp().send({ ...request, timeoutMs: 10 });
  await vi.advanceTimersByTimeAsync(10);
  lateBody.resolve('{}');
  await expect(timedOut).resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });

  class ThrowingAbortController {
    readonly signal = {};
    abort() {
      throw new Error('abort failed');
    }
  }
  vi.stubGlobal('AbortController', ThrowingAbortController);
  installation(() => new Promise(() => undefined));
  const abortThrows = createFetchHttp().send({ ...request, timeoutMs: 10 });
  await vi.advanceTimersByTimeAsync(10);
  await expect(abortThrows).resolves.toEqual({ ok: false, error: { code: 'TIMEOUT' } });

  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals();
});
