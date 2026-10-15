import { afterEach, describe, expect, it } from 'vitest';
import {
  closeShadowListener,
  createShadowServer,
  shadowUrl,
  type RunningShadowServer,
} from './server.ts';
import type { ShadowRoute } from './routes.ts';

// Shadow 引擎只接收中立路由：这两个合成路由不属于任何协议来源，也不引用 generated。
const routes: ShadowRoute[] = [
  { methodName: 'NeutralTrade', httpMethod: 'POST', path: '/api/neutral/trade' },
  { methodName: 'NeutralQuery', httpMethod: 'POST', path: '/api/neutral/query' },
];
const pathOf = (methodName: string) => {
  const route = routes.find((candidate) => candidate.methodName === methodName);
  if (!route) throw new Error(`missing route ${methodName}`);
  return route.path;
};

const running: RunningShadowServer[] = [];
afterEach(async () => Promise.all(running.splice(0).map((server) => server.close())));

async function start(steps: ReadonlyArray<Record<string, unknown>>) {
  const server = createShadowServer({
    environmentClass: 'integration',
    routes,
    scenarios: [
      {
        id: 'case-a',
        routes: {
          NeutralTrade: {
            expectedRequests: steps.map(() => ({ body: { tradeNo: 'trade-1' } })),
            steps,
          },
        },
      },
    ],
  });
  const result = await server.start();
  running.push(result);
  return result;
}

describe('shadow server', () => {
  it('isolates each scenario by server instance, keeps request order, and reports missing and extra requests', async () => {
    const make = async (id: string, tradeNo: string, turns: number[]) => {
      const configured = createShadowServer({
        environmentClass: 'integration',
        routes,
        scenarios: [
          {
            id,
            routes: {
              NeutralQuery: {
                expectedRequests: turns.map(() => ({ body: { tradeNo } })),
                steps: turns.map((turn) => ({ body: { turn } })),
              },
            },
          },
        ],
      });
      const active = await configured.start();
      running.push(active);
      return active;
    };
    const first = await make('first', 't-1', [1, 2]);
    const second = await make('second', 't-2', [8]);
    const post = (server: RunningShadowServer, body: unknown) =>
      fetch(`${server.url}${pathOf('NeutralQuery')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    await first.waitForRecords(0);
    expect(await (await post(first, { tradeNo: 't-1' })).json()).toEqual({ turn: 1 });
    await first.waitForRecords(1);
    expect(await (await post(second, { tradeNo: 't-2' })).json()).toEqual({ turn: 8 });
    expect(first.verify()).toEqual(['first/NeutralQuery: missing request 2 of 2']);
    const secondRecorded = first.waitForRecords(2);
    const secondResponse = post(first, { tradeNo: 't-1' });
    await secondRecorded;
    expect(await (await secondResponse).json()).toEqual({ turn: 2 });
    const belowTarget = first.waitForRecords(4);
    expect((await post(first, { tradeNo: 't-1' })).status).toBe(409);
    expect(first.verify()).toEqual(['first/NeutralQuery: unexpected request 3']);
    expect(first.records()).toHaveLength(3);
    expect(second.records()).toHaveLength(1);

    await first.close();
    await expect(belowTarget).rejects.toThrow(/closed before expected requests/);
  });

  it('rejects an unmatched raw JSON request and preserves key presence in the record', async () => {
    const active = await start([{ body: { ok: true } }]);
    const response = await fetch(`${active.url}${pathOf('NeutralTrade')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tradeNo: 'trade-1', extra: 0 }),
    });

    expect(response.status).toBe(422);
    expect(active.records()[0]?.rawBody).toEqual({ tradeNo: 'trade-1', extra: 0 });
    expect(active.verify()).toContain('case-a/NeutralTrade request 1: $.extra: unexpected key');
  });

  it('replays status, delay, and disconnect faults in order and cleans up its listener', async () => {
    const active = await start([
      { status: 503, body: { error: 'busy' } },
      { delayMs: 20, body: { ok: true } },
      { disconnect: true },
    ]);
    const post = () =>
      fetch(`${active.url}${pathOf('NeutralTrade')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tradeNo: 'trade-1' }),
      });
    expect((await post()).status).toBe(503);
    const before = Date.now();
    expect(await (await post()).json()).toEqual({ ok: true });
    expect(Date.now() - before).toBeGreaterThanOrEqual(15);
    await expect(post()).rejects.toThrow();
    const url = active.url;
    await active.close();
    running.splice(running.indexOf(active), 1);
    await expect(fetch(url)).rejects.toThrow();
  });

  it('matches selected headers and preserves null and raw non-json responses', async () => {
    const server = createShadowServer({
      environmentClass: 'integration',
      routes,
      scenarios: [
        {
          id: 'raw',
          routes: {
            NeutralQuery: {
              expectedRequests: [
                { headers: { authorization: 'Bearer one' }, body: { tradeNo: 't' } },
                { headers: { authorization: 'Bearer two' }, body: { tradeNo: 't' } },
              ],
              steps: [
                { body: null },
                {
                  rawBody: 'not-json',
                  contentType: 'text/plain',
                  malformed: { reason: '非 JSON 的原样响应体（解码错误义务）' },
                },
              ],
            },
          },
        },
      ],
    });
    const active = await server.start();
    running.push(active);
    const send = (authorization: string) =>
      fetch(`${active.url}${pathOf('NeutralQuery')}`, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: '{"tradeNo":"t"}',
      });
    expect(await (await send('Bearer one')).text()).toBe('null');
    const raw = await send('Bearer two');
    expect(await raw.text()).toBe('not-json');
    expect(raw.headers.get('content-type')).toContain('text/plain');
    expect(active.verify()).toEqual([]);
  });

  it('records dynamic request ids for fieldwise scenario assertions without weakening header checks', async () => {
    const configured = createShadowServer({
      environmentClass: 'integration',
      routes,
      scenarios: [
        {
          id: 'dynamic',
          routes: {
            NeutralQuery: {
              expectedRequests: [{ recordOnly: true, headers: { authorization: 'Bearer token' } }],
              steps: [{ body: {} }],
            },
          },
        },
      ],
    });
    const server = await configured.start();
    running.push(server);
    const response = await fetch(`${server.url}${pathOf('NeutralQuery')}`, {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: '{"tradeNo":"trade-dynamic","baseReq":{"requestId":"generated-at-runtime"}}',
    });
    expect(response.status).toBe(200);
    expect(server.records()[0]?.rawBody).toEqual({
      tradeNo: 'trade-dynamic',
      baseReq: { requestId: 'generated-at-runtime' },
    });
    expect(server.verify()).toEqual([]);
  });

  it('rejects an unconfigured generated route and mismatched headers', async () => {
    const active = await start([{ body: {} }]);
    const unmatched = await fetch(`${active.url}${pathOf('NeutralQuery')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"tradeNo":"t"}',
    });
    expect(unmatched.status).toBe(404);

    const configured = createShadowServer({
      environmentClass: 'integration',
      routes,
      scenarios: [
        {
          id: 'headers',
          routes: {
            NeutralQuery: {
              expectedRequests: [
                { headers: { authorization: 'Bearer expected' }, body: { tradeNo: 't' } },
              ],
              steps: [{ body: {} }],
            },
          },
        },
      ],
    });
    const server = await configured.start();
    running.push(server);
    const mismatch = await fetch(`${server.url}${pathOf('NeutralQuery')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"tradeNo":"t"}',
    });
    expect(mismatch.status).toBe(422);
    expect(server.verify()).toContain(
      'headers/NeutralQuery request 1: $.headers.authorization: expected "Bearer expected", received undefined',
    );
    expect(server.records('other')).toEqual([]);
    await server.close();
    await server.close();
    running.splice(running.indexOf(server), 1);
  });

  it('rejects multiple scenario namespaces and unequal request/response sequences', () => {
    expect(() =>
      createShadowServer({
        environmentClass: 'integration',
        routes,
        scenarios: [
          { id: 'a', routes: {} },
          { id: 'b', routes: {} },
        ],
      }),
    ).toThrow(/one scenario/);
    expect(() =>
      createShadowServer({
        environmentClass: 'integration',
        routes,
        scenarios: [
          {
            id: 'a',
            routes: {
              NeutralQuery: {
                expectedRequests: [{ body: { tradeNo: 't' } }],
                steps: [{ body: {} }, { body: {} }],
              },
            },
          },
        ],
      }),
    ).toThrow(/same length/);
    expect(() =>
      createShadowServer({
        environmentClass: 'integration',
        routes,
        scenarios: [
          {
            id: 'a',
            routes: {
              NeutralQuery: {
                expectedRequests: [{}],
                steps: [{ body: {} }],
              },
            },
          },
        ],
      }),
    ).toThrow(/body or recordOnly/);
  });

  it('rejects non-TCP listener addresses and propagates close errors', async () => {
    expect(() => shadowUrl(null)).toThrow(/did not bind/);
    expect(() => shadowUrl('/tmp/socket')).toThrow(/did not bind/);
    expect(shadowUrl({ address: '127.0.0.1', family: 'IPv4', port: 1234 })).toBe(
      'http://127.0.0.1:1234',
    );
    await expect(
      closeShadowListener({
        close(callback: (error?: Error) => void) {
          callback(new Error('close failed'));
          return this as never;
        },
      } as never),
    ).rejects.toThrow(/close failed/);
    await expect(
      closeShadowListener({
        close(callback: (error?: Error) => void) {
          callback();
          return this as never;
        },
      } as never),
    ).resolves.toBeUndefined();
  });
});
