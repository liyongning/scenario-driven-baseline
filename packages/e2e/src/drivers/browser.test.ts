import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { chromium } from 'playwright';
import { createBrowserDriver, resolvePlaceholderAssets, type BrowserLauncher } from './browser.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureConfig() {
  const root = mkdtempSync(join(tmpdir(), 'browser-driver-'));
  roots.push(root);
  mkdirSync(join(root, 'packages/e2e/host/browser'), { recursive: true });
  writeFileSync(join(root, 'packages/e2e/host/browser/image.svg'), '<svg/>');
  return {
    root,
    config: {
      placeholderAssets: [
        {
          host: 'assets.template.invalid',
          path: '/fixture.svg',
          file: 'packages/e2e/host/browser/image.svg',
          contentType: 'image/svg+xml',
        },
      ],
    },
  };
}

test(
  'SCN-BROWSER-PLATFORM-001 driver-lifecycle',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-001',
        caseId: 'driver-lifecycle',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-001',
            caseKey: 'driver-lifecycle',
            checks: ['default-context', 'override-partial', 'browser-once-per-file'],
          },
        ],
      },
    },
  },
  async (context) => {
    const contexts: Array<Record<string, unknown>> = [];
    let closed = 0;
    const browser = {
      newContext: vi.fn(async (options: Record<string, unknown>) => {
        contexts.push(options);
        return {
          route: vi.fn(async () => undefined),
          newPage: vi.fn(async () => ({})),
          close: vi.fn(async () => {
            closed += 1;
          }),
        };
      }),
      close: vi.fn(async () => undefined),
    };
    const launcher: BrowserLauncher = {
      launch: vi.fn(async () => browser as never),
    };
    const fixture = fixtureConfig();
    const driver = createBrowserDriver({
      root: fixture.root,
      config: fixture.config,
      launcher,
    });
    await driver.start();
    await driver.runCase({}, async () => undefined);
    await driver.runCase({ viewport: { width: 390, height: 844 } }, async () => undefined);
    await driver.close();

    context.expect(launcher.launch).toHaveBeenCalledOnce();
    context.expect(contexts).toEqual([
      {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        timezoneId: 'Asia/Shanghai',
        locale: 'zh-CN',
      },
      {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        timezoneId: 'Asia/Shanghai',
        locale: 'zh-CN',
      },
    ]);
    context.expect(closed).toBe(2);
    context.expect(browser.close).toHaveBeenCalledOnce();
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: ['default-context', 'override-partial', 'browser-once-per-file'],
      }),
      'scenario-evidence',
    );
  },
);

test('browser driver defaults, route fulfillment, and startup failures', async () => {
  const fixture = fixtureConfig();
  writeFileSync(join(fixture.root, 'web.config.json'), JSON.stringify(fixture.config));
  const handlers: Array<
    (route: {
      request(): { url(): string };
      fulfill(options: unknown): Promise<void>;
      continue(): Promise<void>;
    }) => Promise<void>
  > = [];
  const browserContext = {
    route: vi.fn(
      async (
        _pattern: string,
        handler: (route: {
          request(): { url(): string };
          fulfill(options: unknown): Promise<void>;
          continue(): Promise<void>;
        }) => Promise<void>,
      ) => {
        handlers.push(handler);
      },
    ),
    newPage: vi.fn(async () => ({})),
    close: vi.fn(async () => undefined),
  };
  const browser = {
    newContext: vi.fn(async () => browserContext),
    close: vi.fn(async () => undefined),
  };
  const launch = vi.spyOn(chromium, 'launch').mockResolvedValue(browser as never);
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(fixture.root);
  try {
    const driver = createBrowserDriver();
    await expect(driver.runCase({}, async () => undefined)).rejects.toThrow(/must be started/);
    await driver.start();
    await driver.runCase({}, async () => {
      const fulfilled = { fulfill: vi.fn(async () => undefined), continue: vi.fn() };
      await handlers[0]!({
        request: () => ({ url: () => 'https://assets.template.invalid/fixture.svg' }),
        ...fulfilled,
      });
      expect(fulfilled.fulfill).toHaveBeenCalledWith({
        path: expect.stringMatching(/packages\/e2e\/host\/browser\/image\.svg$/),
        contentType: 'image/svg+xml',
      });
      expect(fulfilled.continue).not.toHaveBeenCalled();

      const continued = { fulfill: vi.fn(), continue: vi.fn(async () => undefined) };
      await handlers[0]!({
        request: () => ({ url: () => 'https://assets.template.invalid/other.svg' }),
        ...continued,
      });
      expect(continued.fulfill).not.toHaveBeenCalled();
      expect(continued.continue).toHaveBeenCalledOnce();
    });
    await driver.close();
    expect(launch).toHaveBeenCalledOnce();
  } finally {
    cwd.mockRestore();
    launch.mockRestore();
  }

  expect(() =>
    resolvePlaceholderAssets(fixture.root, {
      placeholderAssets: [
        {
          host: 'assets.template.invalid',
          path: '/missing.svg',
          file: 'missing.svg',
          contentType: 'image/svg+xml',
        },
      ],
    }),
  ).toThrow(/占位资源本地文件不存在/);
});
