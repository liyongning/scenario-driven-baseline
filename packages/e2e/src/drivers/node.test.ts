import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeHttpDriver } from './node.ts';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))));

describe('createNodeHttpDriver', () => {
  it('bridges an HttpPort request to a real local HTTP server without rewriting body presence', async () => {
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', chunk => { body += String(chunk); });
      request.on('end', () => { response.setHeader('x-seen', 'yes'); response.end(body); });
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const driver = createNodeHttpDriver();
    const result = await driver.send({
      url: `http://127.0.0.1:${address.port}/`, method: 'POST', headers: { 'content-type': 'application/json' },
      body: '{"tradeNo":"t","xpayEnv":null}', timeoutMs: 1000,
    });
    expect(result).toEqual({ ok: true, value: { status: 200, headers: expect.objectContaining({ 'x-seen': 'yes' }), body: '{"tradeNo":"t","xpayEnv":null}' } });
  });

  it('maps timeout and host cancellation independently', async () => {
    const server = createServer(() => undefined);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const driver = createNodeHttpDriver();
    expect(await driver.send({ url: `http://127.0.0.1:${address.port}/`, method: 'GET', headers: {}, timeoutMs: 5 })).toEqual({ ok: false, error: { code: 'TIMEOUT' } });
    let stop!: () => void;
    const cancellation = { isStopped: () => false, subscribe(listener: () => void) { stop = listener; return () => undefined; } };
    const pending = driver.send({ url: `http://127.0.0.1:${address.port}/`, method: 'GET', headers: {}, timeoutMs: 1000, cancellation });
    stop();
    expect(await pending).toEqual({ ok: false, error: { code: 'CANCELLED' } });
  });

  it('reports a connection failure as NETWORK_ERROR rather than a timeout', async () => {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    await new Promise<void>(resolve => server.close(() => resolve()));

    await expect(createNodeHttpDriver().send({
      url: `http://127.0.0.1:${address.port}/`, method: 'GET', headers: {}, timeoutMs: 1000,
    })).resolves.toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });
  });

  it('returns CANCELLED before fetch when the request is already stopped', async () => {
    await expect(createNodeHttpDriver().send({
      url: 'http://127.0.0.1:1/', method: 'GET', headers: {}, timeoutMs: 1,
      cancellation: { isStopped: () => true, subscribe: () => () => undefined },
    })).resolves.toEqual({ ok: false, error: { code: 'CANCELLED' } });
  });
});
