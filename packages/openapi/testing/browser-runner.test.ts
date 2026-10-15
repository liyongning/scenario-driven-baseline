import { expect, test, vi } from 'vitest';
import * as openapi from '../src/index';
import { browserCancelEvent, browserSerializable, run } from './browser-runner';
import { getTrade, listTrades } from './engine/generated/operations.ts';

test('OpenAPI browser runner executes serializable plans without hardcoded operation names', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('{"code":0,"message":"ok","data":{"trade_no":"T","status":"CREATED"}}');
  try {
    const [result] = await run(
      [
        {
          method: 'getTrade',
          input: { path: { trade_no: 'T' } },
        },
      ],
      {
        operations: { getTrade },
        gatewayBaseUrl: 'https://api.example.invalid',
        securitySchemes: {
          accessToken: { type: 'apiKey', in: 'header', name: 'X-Access-Token' },
        },
        identity: { scheme: 'accessToken', token: 'fixture-token' },
      },
    );
    expect(result).toEqual({
      kind: 'success',
      data: { trade_no: 'T', status: 'CREATED' },
    });
    expect(typeof openapi.createFetchHttp).toBe('function');
    expect(typeof openapi.createRestClient).toBe('function');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAPI browser runner reports unknown operations and cancellation without throwing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise(() => undefined);
  await expect(run([{ method: 'unknown', input: {} }])).resolves.toEqual([
    { kind: 'transport-failure', reason: 'CODEC_ERROR', method: 'unknown' },
  ]);
  try {
    const results = await run(
      [
        { method: 'getTrade', input: { path: { trade_no: 'T' } }, cancel: 'before-send' },
        { method: 'getTrade', input: { path: { trade_no: 'T' } }, cancel: 'in-flight' },
      ],
      {
        operations: { getTrade },
        gatewayBaseUrl: 'https://api.example.invalid',
        securitySchemes: {
          accessToken: { type: 'apiKey', in: 'header', name: 'X-Access-Token' },
        },
        identity: { scheme: 'accessToken', token: 'fixture-token' },
      },
    );
    expect(results[0]).toEqual({ kind: 'transport-failure', reason: 'CANCELLED' });
    expect(results[1]).toMatchObject({ kind: 'transport-failure' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAPI browser runner prefers explicitly supplied operations', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"code":0,"message":"ok","data":{"ok":true}}');
  try {
    const operation = {
      meta: { id: 'fixtureOperation', method: 'get', path: '/fixture', security: [], codes: [] },
    };
    await expect(
      run([{ method: 'fixtureOperation', input: {} }], {
        gatewayBaseUrl: 'https://api.example.invalid',
        operations: { fixtureOperation: operation },
      }),
    ).resolves.toEqual([{ kind: 'success', data: { ok: true } }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser serialization handles bigint and rejects circular values', () => {
  expect(browserSerializable({ value: 1n })).toEqual({ value: '1' });
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(() => browserSerializable(circular)).toThrow();
});

test('OpenAPI browser runner applies defaults when options are omitted', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = globalThis.URL;
  class RelativeUrl {
    readonly searchParams = new URLSearchParams();
    constructor(readonly value: string) {}
    toString() {
      return this.value;
    }
  }
  globalThis.URL = RelativeUrl as unknown as typeof URL;
  globalThis.fetch = async () => new Response('{"code":0,"message":"ok","data":{"trade_no":"T"}}');
  try {
    await expect(
      run([{ method: 'listTrades', input: { path: { merchant_id: 1 } } }], {
        operations: { listTrades },
      }),
    ).resolves.toEqual([{ kind: 'success', data: { trade_no: 'T' } }]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.URL = originalUrl;
  }
});

test('OpenAPI browser runner installs and removes the browser cancellation listener', async () => {
  const listeners = new Map<string, EventListener>();
  const windowLike = {
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners.set(event, listener);
    }),
    removeEventListener: vi.fn((event: string) => listeners.delete(event)),
  };
  vi.stubGlobal('window', windowLike);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise(() => undefined);
  try {
    const pending = run(
      [{ method: 'getTrade', input: { path: { trade_no: 'T' } }, cancel: 'in-flight' }],
      {
        operations: { getTrade },
        gatewayBaseUrl: 'https://api.example.invalid',
        securitySchemes: {
          accessToken: { type: 'apiKey', in: 'header', name: 'X-Access-Token' },
        },
        identity: { scheme: 'accessToken', token: 'fixture-token' },
      },
    );
    await vi.waitFor(() => expect(listeners.has(browserCancelEvent)).toBe(true));
    listeners.get(browserCancelEvent)!(new Event('cancel'));
    await expect(pending).resolves.toEqual([{ kind: 'transport-failure', reason: 'CANCELLED' }]);
    expect(windowLike.removeEventListener).toHaveBeenCalledWith(
      browserCancelEvent,
      expect.any(Function),
    );
  } finally {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  }
});
