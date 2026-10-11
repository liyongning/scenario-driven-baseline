import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { CreateTrade } from '../src/generated/idl/infra/trade/v1/trade.ts';

afterEach(() => vi.unstubAllGlobals());

test(
  'SCN-PROTOCOL-CONTRACT-021 idl-browser-runner',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-021',
        caseId: 'idl-browser-runner',
        fixtureCase: null,
        environment: 'protocol-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-021',
            caseKey: 'idl-browser-runner',
            checks: [
              'plan-step-executed',
              'result-serializable',
              'unresolved-step-reported',
              'runner-generic-and-root-import',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const deliveries = [
      () => new Response('{"tradeNo":"trade-browser"}'),
      () => new Response('{}', { status: 500 }),
      () => Promise.reject(new Error('network down')),
    ];
    const calls: Array<Readonly<{ url: string; init: RequestInit }>> = [];
    const platform = vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return deliveries.shift()!();
    });
    vi.stubGlobal('fetch', platform);

    const { run } = await import('./browser-runner');
    const results = await run([
      { method: CreateTrade.meta.name, input: {} },
      { method: CreateTrade.meta.name, input: {} },
      { method: CreateTrade.meta.name, input: {} },
      { method: 'MissingTrade', input: {} },
    ]);

    context.expect(results[0]).toMatchObject({ ok: true, value: { http: { status: 200 } } });
    context.expect(results[1]).toMatchObject({ ok: true, value: { http: { status: 500 } } });
    context.expect(results[2]).toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });
    context.expect(results[3]).toEqual({
      ok: false,
      error: { code: 'UNRESOLVED_METHOD', method: 'MissingTrade' },
    });
    context.expect(platform).toHaveBeenCalledTimes(3);
    context.expect(calls.every((call) => call.url === CreateTrade.meta.path)).toBe(true);
    for (const result of results) context.expect(structuredClone(result)).toEqual(result);

    const source = readFileSync(new URL('./browser-runner.ts', import.meta.url), 'utf8');
    context.expect(source).not.toMatch(/\b(?:CreateTrade|QueryTrade)\b/);
    context.expect(source).toContain("from '@daqian/template-protocol'");
    context.expect(source).not.toMatch(/from ['"](?:\.{1,2}\/)+src\//);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: [
          'plan-step-executed',
          'result-serializable',
          'unresolved-step-reported',
          'runner-generic-and-root-import',
        ],
      }),
      'scenario-evidence',
    );
  },
);

test('浏览器执行器覆盖序列化、取消、超时与错误入参分支', async () => {
  const { browserSerializable, run } = await import('./browser-runner');
  expect(browserSerializable({ count: 1n })).toEqual({ count: '1' });

  const noFetch = vi.fn();
  vi.stubGlobal('fetch', noFetch);
  await expect(
    run([{ method: CreateTrade.meta.name, input: {}, cancel: 'before-send' }]),
  ).resolves.toEqual([{ ok: false, error: { code: 'CANCELLED' } }]);
  expect(noFetch).not.toHaveBeenCalled();

  let inFlightSignal: unknown;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: { signal: unknown }) => {
      inFlightSignal = init.signal;
      return new Promise(() => undefined);
    }),
  );
  await expect(
    run([{ method: CreateTrade.meta.name, input: {}, cancel: 'in-flight' }]),
  ).resolves.toEqual([{ ok: false, error: { code: 'CANCELLED' } }]);
  expect((inFlightSignal as { aborted: boolean }).aborted).toBe(true);

  const originalTimeout = CreateTrade.meta.timeoutMs;
  Object.assign(CreateTrade.meta, { timeoutMs: 5 });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => undefined)),
  );
  await expect(run([{ method: CreateTrade.meta.name, input: {} }])).resolves.toEqual([
    { ok: false, error: { code: 'TIMEOUT' } },
  ]);
  if (originalTimeout === undefined) delete CreateTrade.meta.timeoutMs;
  else CreateTrade.meta.timeoutMs = originalTimeout;

  const originalCodec = CreateTrade.meta.requestCodec;
  Object.assign(CreateTrade.meta, {
    requestCodec: {
      fromJSON() {
        throw new Error('invalid input');
      },
      toJSON: originalCodec!.toJSON,
    },
  });
  vi.stubGlobal('fetch', vi.fn());
  await expect(run([{ method: CreateTrade.meta.name, input: {} }])).resolves.toEqual([
    {
      ok: false,
      error: { code: 'CODEC_ERROR', method: CreateTrade.meta.name },
    },
  ]);
  Object.assign(CreateTrade.meta, { requestCodec: originalCodec });
});
