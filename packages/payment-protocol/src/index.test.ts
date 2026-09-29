import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
import { createWechatMiniappHttp as createWechatMiniappHttpImplementation } from './adapters/network/wechat-miniapp';
import type { HttpPort } from './ports/http';
import { createWechatMiniappHttp } from './index';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('协议包生产根入口', () => {
  test('以具名函数导出微信网络工厂及 HttpPort 类型', () => {
    const factory: () => HttpPort = createWechatMiniappHttp;
    expect(factory).toBeTypeOf('function');
    expect(factory).toBe(createWechatMiniappHttpImplementation);
    expectTypeOf(factory).returns.toMatchTypeOf<HttpPort>();
    expect(factory()).toMatchObject({ send: expect.any(Function) });
  });

  test('根模块加载和工厂创建不读取平台全局', async () => {
    vi.resetModules();
    const prior = Object.getOwnPropertyDescriptor(globalThis, 'wx');
    Object.defineProperty(globalThis, 'wx', {
      configurable: true,
      get() { throw new Error('根入口加载或创建时读取了 wx'); },
    });
    try {
      const protocolRoot = await import('./index');
      expect(protocolRoot.createWechatMiniappHttp()).toMatchObject({ send: expect.any(Function) });
    } finally {
      if (prior) Object.defineProperty(globalThis, 'wx', prior);
      else Reflect.deleteProperty(globalThis, 'wx');
    }
  });

  test('只有实际 send 才读取 wx 并保持既有网络结果', async () => {
    vi.useFakeTimers();
    let platformReads = 0;
    Object.defineProperty(globalThis, 'wx', {
      configurable: true,
      get() {
        platformReads += 1;
        return {
          request(options: { success(response: { statusCode: number; header: Record<string, string>; data: string }): void }) {
            options.success({ statusCode: 202, header: { 'X-Root': 'yes' }, data: 'accepted' });
            return { abort() {} };
          },
        };
      },
    });

    try {
      const http = createWechatMiniappHttp();
      expect(platformReads).toBe(0);
      await expect(http.send({
        url: 'https://gateway.invalid/pay', method: 'POST', headers: {}, body: '{}', timeoutMs: 50,
      })).resolves.toEqual({ ok: true, value: { status: 202, headers: { 'X-Root': 'yes' }, body: 'accepted' } });
      expect(platformReads).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      Reflect.deleteProperty(globalThis, 'wx');
    }
  });

  test('不新增平台深层 package export，SDK 根也不转导出网络工厂', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      exports: Record<string, unknown>;
    };
    expect(Object.keys(manifest.exports)).toEqual(['.', './generated/*']);
    const sdkEntry = readFileSync(new URL('../../payment-sdk/src/index.ts', import.meta.url), 'utf8');
    expect(sdkEntry).not.toContain('createWechatMiniappHttp');
  });
});
