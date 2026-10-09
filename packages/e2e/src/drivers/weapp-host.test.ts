import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runProtocolSuite } from '../../host/weapp/protocol-runner.ts';
import { runExampleCase } from '../../host/weapp/example-runner.ts';

const generatedRunner = new URL('../../host/weapp/.generated/protocol-runner.js', import.meta.url)
  .pathname;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  return rm(dirname(generatedRunner), { recursive: true, force: true });
});

describe('official minimal weapp host', () => {
  it('registers the protocol runner on the App instance', async () => {
    let definition:
      | {
          runProtocolCase(input: unknown): Promise<unknown>;
          runProtocolSuite(input: unknown): Promise<unknown>;
          runExampleCase(input: unknown): Promise<unknown>;
        }
      | undefined;
    const runProtocolCase = vi.fn(async (input: unknown) => ({ input }));
    const runProtocolSuite = vi.fn(async (input: unknown) => ({ suite: input }));
    const runExampleCase = vi.fn(async (input: unknown) => ({ example: input }));
    vi.stubGlobal('__TEMPLATE_TEST_RUNNER__', { runProtocolCase, runProtocolSuite });
    vi.stubGlobal('__EXAMPLE_TEST_RUNNER__', { runExampleCase });
    vi.stubGlobal('App', (value: typeof definition) => {
      definition = value;
    });

    // @ts-expect-error 官方小程序宿主使用无声明的 JavaScript 入口。
    await import('../../host/weapp/app.js');

    await expect(definition?.runProtocolCase({ caseKey: 'omitted' })).resolves.toEqual({
      input: { caseKey: 'omitted' },
    });
    await expect(definition?.runProtocolSuite('matrix')).resolves.toEqual({ suite: 'matrix' });
    await expect(definition?.runExampleCase('example')).resolves.toEqual({ example: 'example' });
    expect(runProtocolCase).toHaveBeenCalledOnce();
    expect(runProtocolSuite).toHaveBeenCalledOnce();
    expect(runExampleCase).toHaveBeenCalledOnce();
  });

  it('registers an interaction-free empty page', async () => {
    const page = vi.fn();
    vi.stubGlobal('Page', page);

    // @ts-expect-error 官方小程序宿主使用无声明的 JavaScript 页面。
    await import('../../host/weapp/pages/index/index.js');

    expect(page).toHaveBeenCalledWith({});
  });

  it('loads the built runner through CommonJS when no test injection exists', async () => {
    let definition: { runProtocolCase(input: unknown): Promise<unknown> } | undefined;
    await mkdir(dirname(generatedRunner), { recursive: true });
    await writeFile(generatedRunner, 'export const runProtocolCase = async input => input;\n');
    await writeFile(
      new URL('../../host/weapp/.generated/example-runner.js', import.meta.url),
      'export const runExampleCase = async input => input;\n',
    );
    vi.stubGlobal('__TEMPLATE_TEST_RUNNER__', undefined);
    vi.stubGlobal('__EXAMPLE_TEST_RUNNER__', undefined);
    vi.stubGlobal('App', (value: typeof definition) => {
      definition = value;
    });

    // @ts-expect-error 官方小程序宿主使用无声明的 JavaScript 入口。
    await import('../../host/weapp/app.js');

    await expect(definition?.runProtocolCase('case')).resolves.toBe('case');
  });

  it('runs the example create, observation, flow, and input-failure branches through the SDK', async () => {
    const requests: string[] = [];
    const request = vi.fn(
      (options: { url: string; success(value: unknown): void; complete?(): void }) => {
        requests.push(options.url);
        const response = options.url.endsWith('/create')
          ? { tradeNo: 'example-host-1', baseResp: { statusCode: '0' } }
          : {
              trade: { tradeNo: 'example-host-1', status: 'TRADE_STATUS_PAID' },
              baseResp: { statusCode: '0' },
            };
        void Promise.resolve().then(() => {
          options.success({ statusCode: 200, header: {}, data: JSON.stringify(response) });
          options.complete?.();
        });
        return { abort() {} };
      },
    );
    vi.stubGlobal('wx', { request });
    const base = {
      gatewayBaseUrl: 'https://fixture.invalid',
      accessToken: 'token',
      ownerId: '42',
      externalRef: 'host-ref',
      units: 1,
    };
    expect(await runExampleCase({ action: 'create-success', ...base })).toMatchObject({
      created: { ok: true, reference: { id: 'example-host-1' } },
    });
    expect(
      await runExampleCase({ action: 'observe-completed', ...base, resourceId: 'example-host-1' }),
    ).toMatchObject({ outcome: { end: 'completed' } });
    expect(await runExampleCase({ action: 'normal', ...base })).toMatchObject({
      created: { ok: true },
      outcome: { end: 'completed' },
    });
    expect(await runExampleCase({ action: 'normal', ...base, ownerId: '' })).toMatchObject({
      created: { ok: false, error: { category: 'invalid_input' } },
    });
    expect(requests.map((url) => (url.endsWith('/create') ? 'create' : 'query'))).toEqual([
      'create',
      'query',
      'create',
      'query',
    ]);
  });

  it('returns protocol projections without nested bigint values', async () => {
    const request = vi.fn((options: { success(value: unknown): void; complete?(): void }) => {
      void Promise.resolve().then(() => {
        options.success({
          statusCode: 200,
          header: {},
          data: JSON.stringify({ baseResp: { statusCode: '0', serverTimeMs: '1' } }),
        });
        options.complete?.();
      });
      return { abort() {} };
    });
    vi.stubGlobal('wx', { request });

    const result = await runProtocolSuite({
      gatewayBaseUrl: 'https://fixture.invalid',
      accessToken: 'fixture-token',
      requestId: 'request-projection',
      productId: 'product-projection',
      timeoutMs: 100,
      methods: [
        {
          method: 'CreateTrade',
          request: { bizType: 'projection' },
          sparseRequest: { bizType: 'projection' },
          responseCount: 1,
          responsePaths: ['base_resp', 'base_resp.status_code'],
        },
      ],
    });
    const containsBigint = (value: unknown): boolean =>
      typeof value === 'bigint' ||
      Boolean(value && typeof value === 'object' && Object.values(value).some(containsBigint));

    expect(containsBigint(result)).toBe(false);
  });
});
