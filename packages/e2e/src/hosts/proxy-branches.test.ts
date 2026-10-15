import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:http', () => ({ request: mocks.request }));

import { createSharedProxy } from './proxy.ts';

type FakeRequest = EventEmitter & {
  originalUrl: string;
  method: string;
  headers: Record<string, string>;
  pipe: ReturnType<typeof vi.fn>;
};

type FakeResponse = EventEmitter & {
  headersSent: boolean;
  writeHead: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  socket: { end: ReturnType<typeof vi.fn> };
  destroy: ReturnType<typeof vi.fn>;
};

function request(): FakeRequest {
  return Object.assign(new EventEmitter(), {
    originalUrl: '/fixture',
    method: 'GET',
    headers: {},
    pipe: vi.fn(),
  });
}

function response(): FakeResponse {
  return Object.assign(new EventEmitter(), {
    headersSent: false,
    writeHead: vi.fn(function (this: FakeResponse) {
      this.headersSent = true;
    }),
    flushHeaders: vi.fn(),
    socket: { end: vi.fn() },
    destroy: vi.fn(),
  });
}

test('shared proxy defaults a missing upstream status and destroys after a late request error', async () => {
  const upstreamRequest = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const upstreamResponse = Object.assign(new EventEmitter(), {
    statusCode: undefined,
    headers: {},
    pipe: vi.fn(),
    destroy: vi.fn(),
  });
  mocks.request.mockImplementationOnce((_options, callback: (value: unknown) => void) => {
    queueMicrotask(() => {
      upstreamRequest.emit('response', upstreamResponse);
      callback(upstreamResponse);
      queueMicrotask(() => upstreamRequest.emit('error', new Error('late failure')));
    });
    return upstreamRequest;
  });

  const incoming = request();
  const outgoing = response();
  createSharedProxy({ target: 'http://upstream.invalid' })(
    incoming as never,
    outgoing as never,
    vi.fn(),
  );
  await vi.waitFor(() => expect(upstreamResponse.listenerCount('aborted')).toBe(1));
  upstreamResponse.emit('aborted');
  expect(outgoing.destroy).toHaveBeenCalled();
  await vi.waitFor(() => expect(outgoing.destroy).toHaveBeenCalledTimes(2));
  expect(outgoing.writeHead).toHaveBeenCalledWith(502, {});
});

test('shared proxy destroys the upstream request when the incoming request aborts', () => {
  const upstreamRequest = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  mocks.request.mockImplementationOnce(() => upstreamRequest);
  const incoming = request();
  const outgoing = response();
  createSharedProxy({ target: 'http://upstream.invalid' })(
    incoming as never,
    outgoing as never,
    vi.fn(),
  );
  incoming.emit('aborted');
  expect(upstreamRequest.destroy).toHaveBeenCalledOnce();
});
