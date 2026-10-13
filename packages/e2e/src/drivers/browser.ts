import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from 'playwright';
import { loadWebConfig, type WebConfig } from '../hosts/web-config.ts';

export type BrowserLauncher = Readonly<{
  launch(): Promise<Browser>;
}>;

export type BrowserCaseOptions = BrowserContextOptions;

export type BrowserCase = Readonly<{
  context: BrowserContext;
  page: Page;
  config: WebConfig;
}>;

const defaultContext = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  timezoneId: 'Asia/Shanghai',
  locale: 'zh-CN',
} as const;

/** 在创建上下文前解析占位资源，缺失文件立即失败并指出绝对路径。 */
export function resolvePlaceholderAssets(root: string, config: WebConfig) {
  return config.placeholderAssets.map((rule) => {
    const file = resolve(root, rule.file);
    if (!existsSync(file)) throw new Error(`占位资源本地文件不存在: ${file}`);
    return { ...rule, file };
  });
}

/** 浏览器驱动只管理文件级生命周期、上下文默认值与占位资源兑现。 */
export function createBrowserDriver(
  options: Readonly<{
    root?: string;
    config?: WebConfig;
    launcher?: BrowserLauncher;
  }> = {},
) {
  const root = resolve(options.root ?? process.cwd());
  const config = options.config ?? loadWebConfig(root);
  const launcher = options.launcher ?? { launch: () => chromium.launch() };
  let browser: Browser | undefined;
  let startPromise: Promise<void> | undefined;

  async function start(): Promise<void> {
    startPromise ??= launcher.launch().then((value) => {
      browser = value;
    });
    await startPromise;
  }

  async function runCase<T>(
    contextOptions: BrowserCaseOptions,
    body: (value: BrowserCase) => Promise<T>,
  ): Promise<T> {
    if (!browser) throw new Error('browser driver must be started before runCase');
    const routes = resolvePlaceholderAssets(root, config);
    const context = await browser.newContext({ ...defaultContext, ...contextOptions });
    try {
      for (const rule of routes) {
        await context.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.host === rule.host && url.pathname === rule.path)
            await route.fulfill({ path: rule.file, contentType: rule.contentType });
          else await route.continue();
        });
      }
      const page = await context.newPage();
      return await body({ context, page, config });
    } finally {
      await context.close();
    }
  }

  async function close(): Promise<void> {
    await browser?.close();
    browser = undefined;
    startPromise = undefined;
  }

  return { start, runCase, close };
}
