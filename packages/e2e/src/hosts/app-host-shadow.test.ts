import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';

const httpMocks = vi.hoisted(() => ({ createServer: vi.fn() }));
vi.mock('node:http', () => ({ createServer: httpMocks.createServer }));
vi.mock('./freshness.ts', () => ({ assertProductBundleFresh: vi.fn() }));

import { createAppHost } from './app-host.ts';

function child() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: () => true,
  });
}

function server(address: unknown, closeError?: Error) {
  return Object.assign(new EventEmitter(), {
    listen(_port: number, _host: string, callback: () => void) {
      queueMicrotask(callback);
      return this;
    },
    address: () => address,
    close(callback: (error?: Error) => void) {
      queueMicrotask(() => callback(closeError));
      return this;
    },
  });
}

test('shadow host rejects a server without a bound address and surfaces close errors', async () => {
  httpMocks.createServer.mockReturnValueOnce(server(null));
  const unboundChild = child();
  const unbound = createAppHost({
    root: '/repo',
    productDirectory: 'web',
    shadowUrl: 'http://shadow.example.test',
    spawn: () => unboundChild as never,
    verifyFreshness: () => undefined,
  });
  unboundChild.stdout.emit('data', Buffer.from('http://127.0.0.1:45123/\n'));
  await expect(unbound).rejects.toThrow('application host did not bind');

  httpMocks.createServer.mockReturnValueOnce(
    server({ address: '127.0.0.1', family: 'IPv4', port: 45124 }, new Error('close failed')),
  );
  const closingChild = child();
  const closing = createAppHost({
    root: '/repo',
    productDirectory: 'web',
    shadowUrl: 'http://shadow.example.test',
    spawn: () => closingChild as never,
    verifyFreshness: () => undefined,
  });
  closingChild.stdout.emit('data', Buffer.from('http://127.0.0.1:45123/\n'));
  const host = await closing;
  await expect(host.close()).rejects.toThrow('close failed');

  httpMocks.createServer.mockReturnValueOnce(
    server({ address: '127.0.0.1', family: 'IPv4', port: 45125 }),
  );
  const cleanChild = child();
  const clean = createAppHost({
    root: '/repo',
    productDirectory: 'web',
    shadowUrl: 'http://shadow.example.test',
    spawn: () => cleanChild as never,
    verifyFreshness: () => undefined,
  });
  cleanChild.stdout.emit('data', Buffer.from('http://127.0.0.1:45123/\n'));
  const cleanHost = await clean;
  await expect(cleanHost.close()).resolves.toBeUndefined();
});
