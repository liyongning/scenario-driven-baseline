import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import express, { type RequestHandler } from 'express';
import { createServer as createViteServer } from 'vite';
import { createTrade, getTrade } from '../../../openapi/testing/engine/generated/operations.ts';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { createBrowserDriver, resolvePlaceholderAssets } from '../../src/drivers/browser.ts';
import { createAppHost } from '../../src/hosts/app-host.ts';
import { createProtocolHost } from '../../src/hosts/protocol-host.ts';
import { assertProtocolBundleFresh } from '../../src/hosts/freshness.ts';
import { waitForCalls } from '../../src/harness.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';
import { protocolRunnerForBinding } from '../../src/hosts/protocol-host.ts';
import { useBrowserDriver, runBrowserPlan } from './browser-case-support.ts';
import { accessIdentity, securitySchemes } from './openapi-wire.ts';

const root = process.cwd();
const driver = useBrowserDriver();

defineCase(
  {
    ownerId: 'SCN-BROWSER-PLATFORM-001',
    caseId: 'browser-context',
    fixtureCase: 'browser-context',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-BROWSER-PLATFORM-001',
        caseKey: 'browser-context',
        checks: ['default-context', 'override-partial', 'case-isolation'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const server = createHttpServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body>browser context</body></html>');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('context server did not bind');
    const url = `http://127.0.0.1:${address.port}/`;
    try {
      const first = await driver.runCase({}, async ({ page }) => {
        await page.goto(url);
        return page.evaluate(() => {
          document.cookie = 'browser-driver=first; path=/';
          localStorage.setItem('browser-driver', 'first');
          return {
            viewport: { width: innerWidth, height: innerHeight },
            dpr: devicePixelRatio,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: navigator.language,
          };
        });
      });
      const second = await driver.runCase({}, async ({ page }) => {
        await page.goto(url);
        return page.evaluate(() => ({
          cookie: document.cookie,
          stored: localStorage.getItem('browser-driver'),
        }));
      });
      const third = await driver.runCase(
        { viewport: { width: 390, height: 844 } },
        async ({ page }) => {
          await page.goto(url);
          return page.evaluate(() => ({
            viewport: { width: innerWidth, height: innerHeight },
            dpr: devicePixelRatio,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: navigator.language,
          }));
        },
      );

      await checkpoint('default-context', () => {
        expect(first).toEqual({
          viewport: { width: 1440, height: 900 },
          dpr: 1,
          timezone: 'Asia/Shanghai',
          locale: 'zh-CN',
        });
      });
      await checkpoint('case-isolation', () => {
        expect(second).toEqual({ cookie: '', stored: null });
      });
      await checkpoint('override-partial', () => {
        expect(third).toEqual({
          viewport: { width: 390, height: 844 },
          dpr: 1,
          timezone: 'Asia/Shanghai',
          locale: 'zh-CN',
        });
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-BROWSER-PLATFORM-003',
    caseId: 'protocol-host-roundtrip',
    fixtureCase: 'protocol-host-roundtrip',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-BROWSER-PLATFORM-003',
        caseKey: 'protocol-host-roundtrip',
        checks: ['real-fetch-through-proxy', 'plan-step-roundtrip', 'dist-only'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const server = await createShadowServer({
      routes: routesFromOpenApiOperations([getTrade], [getTrade], { contractCarrier: 'engine' }),
      environmentClass: 'platform',
      scenarios: [
        {
          id: 'protocol-host-roundtrip',
          routes: {
            getTrade: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { code: 0, message: 'ok', data: trade() } }],
            },
          },
        },
      ],
    }).start();
    const host = await createProtocolHost({
      root,
      bindingName: 'web-openapi-browser',
      shadowUrl: server.url,
    });
    const scripts: string[] = [];
    try {
      const result = await driver.runCase({}, async ({ page }) => {
        page.on('request', (request) => {
          if (request.resourceType() === 'script') scripts.push(request.url());
        });
        return runBrowserPlan(
          page,
          host,
          [{ method: 'getTrade', input: { path: { trade_no: 'T-1' } } }],
          {
            gatewayBaseUrl: `${host.url.replace(/\/$/, '')}/__shadow`,
            securitySchemes,
            identity: accessIdentity,
            operations: { getTrade },
          },
        );
      });
      await checkpoint('real-fetch-through-proxy', () => {
        expect(result).toEqual([{ kind: 'success', data: trade() }]);
        expect(server.records()).toHaveLength(1);
        expect(server.verify()).toEqual([]);
      });
      await checkpoint('plan-step-roundtrip', () => expect(result).toHaveLength(1));
      await checkpoint('dist-only', () => {
        expect(scripts.some((url) => /packages\/openapi\/dist\/index\.(?:js|cjs)/.test(url))).toBe(
          true,
        );
        expect(scripts.some((url) => url.includes('/packages/openapi/src/'))).toBe(false);
      });
    } finally {
      await host.close();
      await server.close();
    }
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-BROWSER-PLATFORM-004',
    caseId: 'app-host-page',
    fixtureCase: 'app-host-page',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-BROWSER-PLATFORM-004',
        caseKey: 'app-host-page',
        checks: ['printed-url', 'page-served'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const host = await createAppHost({ root, productDirectory: 'web' });
    try {
      const pageState = await driver.runCase({}, async ({ page }) => {
        await page.goto(`${host.url}?token=browser-token&merchant=1001`);
        return {
          title: await page.title(),
          hasRoot: (await page.locator('#app').count()) === 1,
        };
      });
      await checkpoint('printed-url', () =>
        expect(host.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/),
      );
      await checkpoint('page-served', () => {
        expect(pageState).toEqual({ title: '模板 Web 应用', hasRoot: true });
      });
    } finally {
      await host.close();
    }
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-BROWSER-PLATFORM-006',
    caseId: 'browser-network-error-defenses',
    fixtureCase: 'browser-network-error-defenses',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-BROWSER-PLATFORM-006',
        caseKey: 'browser-network-error-defenses',
        checks: ['primary-single-arrival', 'fallback-single-arrival', 'unprotected-proxy-resend'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const primary = await runNetworkErrorCase(driver, 'partial', 'shared');
    const fallback = await runNetworkErrorCase(driver, 'disconnect', 'shared');
    const comparison = await runNetworkErrorCase(driver, 'disconnect', 'raw');

    await checkpoint('primary-single-arrival', () => {
      expect(primary.result).toEqual([{ kind: 'transport-failure', reason: 'NETWORK_ERROR' }]);
      expect(primary.count).toBe(1);
    });
    await checkpoint('fallback-single-arrival', () => {
      expect(fallback.result).toEqual([{ kind: 'transport-failure', reason: 'NETWORK_ERROR' }]);
      expect(fallback.count).toBe(1);
    });
    await checkpoint('unprotected-proxy-resend', () => expect(comparison.count).toBe(2));
  },
  { timeoutMs: 45_000 },
);

defineCase(
  {
    ownerId: 'SCN-BROWSER-PLATFORM-008',
    caseId: 'placeholder-assets',
    fixtureCase: 'placeholder-assets',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-BROWSER-PLATFORM-008',
        caseKey: 'placeholder-assets',
        checks: [
          'placeholder-served-locally',
          'no-external-request',
          'missing-local-resource',
          'no-example-dependency',
        ],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const assetFixture = fixture as Readonly<{ image: string }>;
    const server = await createShadowServer({
      routes: [],
      environmentClass: 'platform',
      scenarios: [{ id: 'placeholder-assets', routes: {} }],
    }).start();
    const host = await createProtocolHost({
      root,
      bindingName: 'web-openapi-browser',
      shadowUrl: server.url,
    });
    try {
      const width = await driver.runCase({}, async ({ page }) => {
        await page.goto(`${host.url}?runner=${encodeURIComponent(host.runnerUrl)}`);
        await page.waitForFunction(() => '__browserHost' in window);
        return page.evaluate(
          ({ source }) =>
            (
              window as unknown as {
                __browserHost: { renderImage(source: string): Promise<number> };
              }
            ).__browserHost.renderImage(source),
          { source: assetFixture.image },
        );
      });
      await checkpoint('placeholder-served-locally', () => expect(width).toBeGreaterThan(0));
      await checkpoint('no-external-request', () => {
        expect(new URL(assetFixture.image).hostname).toBe('assets.template.invalid');
        expect(width).toBeGreaterThan(0);
      });
      await checkpoint('missing-local-resource', () => {
        expect(() =>
          resolvePlaceholderAssets(root, {
            placeholderAssets: [
              {
                host: 'assets.template.invalid',
                path: '/missing.svg',
                file: 'packages/e2e/host/browser/missing.svg',
                contentType: 'image/svg+xml',
              },
            ],
          }),
        ).toThrow(/missing\.svg/);
      });
      await checkpoint('no-example-dependency', () => {
        const source = readFileSync(
          fileURLToPath(new URL('browser-platform.browser.spec.ts', import.meta.url)),
          'utf8',
        );
        expect(source).toContain("from '../../src/hosts/protocol-host.ts'");
        expect(source).not.toMatch(/packages\/web(?:\/|')|tests\/example(?:\/|')/u);
      });
    } finally {
      await host.close();
      await server.close();
    }
  },
  { timeoutMs: 30_000 },
);

async function runNetworkErrorCase(
  browserDriver: ReturnType<typeof createBrowserDriver>,
  fault: 'partial' | 'disconnect',
  proxy: 'shared' | 'raw',
) {
  const expectedCount = proxy === 'raw' && fault === 'disconnect' ? 2 : 1;
  const server = await createShadowServer({
    routes: routesFromOpenApiOperations([createTrade], [createTrade], {
      contractCarrier: 'engine',
    }),
    environmentClass: 'platform',
    scenarios: [
      {
        id: `network-${proxy}-${fault}`,
        routes: {
          createTrade: {
            expectedRequests: Array.from({ length: expectedCount }, () => ({ recordOnly: true })),
            steps: Array.from({ length: expectedCount }, () =>
              fault === 'partial' ? { partialThenDisconnect: true } : { disconnect: true },
            ),
          },
        },
      },
    ],
  }).start();
  const host =
    proxy === 'shared'
      ? await createProtocolHost({
          root,
          bindingName: 'web-openapi-browser',
          shadowUrl: server.url,
        })
      : await createRawProtocolHost(server.url);
  try {
    const result = await browserDriver.runCase({}, async ({ page }) =>
      runBrowserPlan(
        page,
        host,
        [
          {
            method: 'createTrade',
            input: { body: { merchant_id: 1001, amount: 1, channel: 'WEB' } },
          },
        ],
        {
          gatewayBaseUrl: `${host.url.replace(/\/$/, '')}/__shadow`,
          securitySchemes,
          identity: accessIdentity,
          operations: { createTrade },
        },
      ),
    );
    const records = await waitForCalls(
      () => server.records(),
      (items) => items.length >= expectedCount,
      { timeoutMs: 5_000, intervalMs: 20 },
    );
    if (expectedCount === 1) await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      result,
      count: records.length === expectedCount ? server.records().length : records.length,
    };
  } finally {
    await host.close();
    await server.close();
  }
}

async function createRawProtocolHost(shadowUrl: string) {
  const manifest = loadProjectManifest(root);
  const runnerPath = protocolRunnerForBinding(root, manifest, 'web-openapi-browser');
  assertProtocolBundleFresh(root, 'openapi');
  const vite = await createViteServer({
    root: `${root}/packages/e2e/host/browser`,
    appType: 'spa',
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const app = express();
  app.use('/__shadow', unprotectedProxy(shadowUrl));
  app.use(vite.middlewares);
  const server = createHttpServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('raw protocol host did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    runnerUrl: `/@fs/${runnerPath.split('/').map(encodeURIComponent).join('/')}`,
    async close() {
      await Promise.all([
        vite.close(),
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
      ]);
    },
  };
}

function unprotectedProxy(target: string): RequestHandler {
  const targetUrl = new URL(target);
  let upstreamFailures = 0;
  return (request, response) => {
    const upstream = httpRequest(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        method: request.method,
        path: request.originalUrl.slice('/__shadow'.length),
        headers: request.headers,
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );
    upstream.once('error', () => {
      upstreamFailures += 1;
      if (upstreamFailures === 1) response.socket?.destroy();
      else {
        response.writeHead(502, { 'content-length': '2', connection: 'close' });
        response.end('{}');
      }
    });
    request.pipe(upstream);
  };
}

function trade() {
  return { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 };
}
