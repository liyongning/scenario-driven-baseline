import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { exampleClient, exampleServer, installWx, type ExampleServer } from './example-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let restore: (() => void) | undefined;
let server: ExampleServer | undefined;
afterEach(async () => {
  restore?.();
  restore = undefined;
  await server?.close();
  server = undefined;
});

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-EXAMPLE-005',
    caseId: 'window-and-timeout',
    fixtureCase: 'window-and-timeout',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-005',
        caseKey: 'window-and-timeout',
        checks: ['request-timeout-local', 'window-elapsed', 'no-request-after-end'],
      },
    ],
  },
  async ({ checkpoint, expect, environmentClass }) => {
    const pending = {
      body: {
        trade: { tradeNo: 'resource-005', status: 'TRADE_STATUS_CREATED' },
        baseResp: { statusCode: '0' },
      },
    };
    server = await exampleServer(
      'window-and-timeout',
      {
        QueryTrade: {
          // 步骤数必须覆盖窗口内可能发出的全部请求：超出 expectedRequests 的请求会被 Shadow 判为
          // unexpected request（409），所以这里按上限留足（每轮至少间隔 intervalMs，窗口内不超过 ~11 次）。
          expectedRequests: Array.from({ length: 24 }, () => ({ recordOnly: true })),
          steps: [{ ...pending, delayMs: 500 }, ...Array.from({ length: 23 }, () => pending)],
        },
      },
      environmentClass,
    );
    restore = installWx();
    // 窗口远大于"单次超时 + 间隔"（1500ms 对 200ms + 150ms）：计时抖动或 CPU 争用不会把轮询
    // 压到窗口结束前只发出一次请求；语义仍是"单次超时只结束该次请求、窗口内继续查询"。
    const requestTimeoutMs = 200;
    const intervalMs = 150;
    const result = await exampleClient(server.url, {
      requestTimeoutMs,
      intervalMs,
      windowMs: 1_500,
    }).observe({ id: 'resource-005', externalRef: 'example-005' });
    await checkpoint('request-timeout-local', () =>
      expect(server!.records().length).toBeGreaterThanOrEqual(2),
    );
    await checkpoint('window-elapsed', () =>
      expect(result).toMatchObject({ end: 'window_elapsed' }),
    );
    const count = server.records().length;
    // 观察等待必须长于一个轮询间隔：晚于窗口结束一个间隔才发出的轮询（迟到的定时器）才会被记到，
    // 否则窗口结束后多排一次轮询的缺陷在 30ms 的观察窗里恒真地"通过"。
    await new Promise((resolve) => setTimeout(resolve, intervalMs + 200));
    await checkpoint('no-request-after-end', () => expect(server!.records()).toHaveLength(count));
  },
  { fixtureRoot },
);
