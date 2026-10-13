import { afterAll, beforeAll } from 'vitest';
import { createBrowserDriver } from '../../src/drivers/browser.ts';
import type { BrowserStepResult } from '../../../openapi/testing/browser-runner.ts';

export function useBrowserDriver() {
  const driver = createBrowserDriver();
  beforeAll(() => driver.start());
  afterAll(() => driver.close());
  return driver;
}

export type BrowserPlan = ReadonlyArray<
  Readonly<{
    method: string;
    input: Readonly<Record<string, unknown>>;
    timeoutMs?: number;
    cancel?: 'before-send' | 'in-flight';
  }>
>;

type BrowserHost = Readonly<{
  run(
    plan: BrowserPlan,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<ReadonlyArray<BrowserStepResult>>;
}>;

/** 打开协议宿主页面并把计划交给页面内协议执行器。 */
export async function runBrowserPlan(
  page: import('playwright').Page,
  host: Readonly<{ url: string; runnerUrl: string }>,
  plan: BrowserPlan,
  options: Readonly<Record<string, unknown>> = {},
) {
  await page.goto(`${host.url}?runner=${encodeURIComponent(host.runnerUrl)}`);
  await page.waitForFunction(() => '__browserHost' in window);
  return page.evaluate(
    ({ plan: value, options: runnerOptions }) =>
      (window as unknown as { __browserHost: BrowserHost }).__browserHost.run(value, runnerOptions),
    { plan, options },
  );
}

/** 启动页面计划，等待外部证据后触发取消事件，再返回页面结果。 */
export async function runBrowserPlanWithCancel(
  driver: ReturnType<typeof createBrowserDriver>,
  host: Readonly<{ url: string; runnerUrl: string }>,
  plan: BrowserPlan,
  options: Readonly<Record<string, unknown>>,
  beforeCancel: () => Promise<void>,
  eventName: string,
) {
  return driver.runCase({}, async ({ page }) => {
    await page.goto(`${host.url}?runner=${encodeURIComponent(host.runnerUrl)}`);
    await page.waitForFunction(() => '__browserHost' in window);
    const pending = page.evaluate(
      ({ plan: value, options: runnerOptions }) =>
        (
          window as unknown as {
            __browserHost: {
              run(
                planValue: BrowserPlan,
                runnerOptions: Readonly<Record<string, unknown>>,
              ): Promise<ReadonlyArray<BrowserStepResult>>;
            };
          }
        ).__browserHost.run(value, runnerOptions),
      { plan, options },
    );
    await beforeCancel();
    await page.evaluate((name) => window.dispatchEvent(new Event(name)), eventName);
    return pending;
  });
}
