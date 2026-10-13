import { createServer, request as httpRequest, type Server } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { afterEach, test } from 'vitest';
import { createSharedProxy } from './proxy.ts';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function listen(app: express.Express) {
  const server = createServer(app);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

function rawRequest(
  url: string,
  options: Readonly<{ method?: string; body?: string; headers?: Record<string, string> }> = {},
) {
  const target = new URL(url);
  return new Promise<{
    status: number | undefined;
    headers: Record<string, string | string[] | undefined>;
    body: string;
    error?: Error;
  }>((resolve) => {
    const request = httpRequest(
      target,
      { method: options.method ?? 'GET', headers: options.headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
        response.on('error', (error) =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
            error,
          }),
        );
        response.on('aborted', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
            error: new Error('response aborted'),
          }),
        );
      },
    );
    request.on('error', (error) => resolve({ status: undefined, headers: {}, body: '', error }));
    if (options.body) request.write(options.body);
    request.end();
  });
}

test(
  'SCN-BROWSER-PLATFORM-005 proxy-middleware',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-005',
        caseId: 'proxy-middleware',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-005',
            caseKey: 'proxy-middleware',
            checks: ['transparent-forward', 'early-disconnect-502', 'partial-incomplete'],
          },
        ],
      },
    },
  },
  async (context) => {
    let observed: Record<string, unknown> | undefined;
    const upstreamApp = express();
    upstreamApp.use(express.text({ type: '*/*' }));
    upstreamApp.post('/echo', (request, response) => {
      observed = {
        method: request.method,
        url: request.originalUrl,
        header: request.header('x-request-id'),
        body: request.body,
      };
      response.status(201).set('x-upstream', 'yes').send('forwarded');
    });
    upstreamApp.post('/__other/echo', (request, response) => {
      observed = { url: request.originalUrl };
      response.status(201).send('forwarded-without-strip');
    });
    upstreamApp.get('/', (_request, response) => response.status(200).send('root'));
    upstreamApp.get('/early', (_request, response) => response.socket?.destroy());
    upstreamApp.get('/partial', (_request, response) => {
      response.writeHead(200, { 'content-length': '50' });
      response.write('partial');
      response.socket?.destroy();
    });
    const upstream = await listen(upstreamApp);
    const proxyApp = express();
    proxyApp.use('/__shadow', createSharedProxy({ target: upstream, stripPrefix: '/__shadow' }));
    const proxy = await listen(proxyApp);

    const forwarded = await rawRequest(`${proxy}/__shadow/echo?name=中文`, {
      method: 'POST',
      body: '{"value":1}',
      headers: { 'content-type': 'text/plain', 'x-request-id': 'request-1' },
    });
    context.expect(forwarded.status).toBe(201);
    context.expect(forwarded.headers['x-upstream']).toBe('yes');
    context.expect(forwarded.body).toBe('forwarded');
    context.expect(observed).toEqual({
      method: 'POST',
      url: '/echo?name=%E4%B8%AD%E6%96%87',
      header: 'request-1',
      body: '{"value":1}',
    });

    const early = await rawRequest(`${proxy}/__shadow/early`);
    context.expect(early.status).toBe(502);
    context.expect(early.headers['content-length']).toBe('2');
    context.expect(early.error).toBeInstanceOf(Error);

    const partial = await rawRequest(`${proxy}/__shadow/partial`);
    context.expect(partial.error).toBeInstanceOf(Error);

    const withoutPrefix = express();
    withoutPrefix.use(createSharedProxy({ target: upstream }));
    const directProxy = await listen(withoutPrefix);
    const direct = await rawRequest(`${directProxy}/echo`, {
      method: 'POST',
      body: '{"value":2}',
      headers: { 'content-type': 'text/plain' },
    });
    context.expect(direct.status).toBe(201);
    context
      .expect(observed)
      .toEqual({ method: 'POST', url: '/echo', header: undefined, body: '{"value":2}' });

    const mismatched = express();
    mismatched.use(createSharedProxy({ target: upstream, stripPrefix: '/missing' }));
    const mismatchProxy = await listen(mismatched);
    const mismatch = await rawRequest(`${mismatchProxy}/__other/echo`, {
      method: 'POST',
      body: 'mismatch',
      headers: { 'content-type': 'text/plain' },
    });
    context.expect(mismatch.status).toBe(201);
    context.expect(observed).toEqual({ url: '/__other/echo' });

    const rootPath = await rawRequest(`${proxy}/__shadow`);
    context.expect(rootPath.status).toBe(200);
    context.expect(rootPath.body).toBe('root');

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: ['transparent-forward', 'early-disconnect-502', 'partial-incomplete'],
      }),
      'scenario-evidence',
    );
  },
);
