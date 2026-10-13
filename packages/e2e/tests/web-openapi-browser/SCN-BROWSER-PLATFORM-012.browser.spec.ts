import { getTrade, listTrades } from '@daqian/template-openapi/generated/operations';
import { vi } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createProtocolHost } from '../../src/hosts/protocol-host.ts';
import { createPreviewShadowFromDataset } from '../../src/preview/preview-launcher.ts';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';
import { runBrowserPlan, useBrowserDriver } from './browser-case-support.ts';
import { accessIdentity, securitySchemes } from './openapi-wire.ts';

const root = process.cwd();
const driver = useBrowserDriver();
const routes = routesFromOpenApiOperations([getTrade, listTrades], [getTrade, listTrades]);

defineCase(
  {
    ownerId: 'SCN-BROWSER-PLATFORM-012',
    caseId: 'local-preview-page',
    fixtureCase: 'local-preview-page',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-BROWSER-PLATFORM-012',
        caseKey: 'local-preview-page',
        checks: [
          'dataset-drives-ui',
          'sequence-repeat-last',
          'same-origin-proxy',
          'unscripted-logged-only',
          'via-launcher-no-count-evidence',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const first = await createPreviewShadowFromDataset({
      root,
      datasetName: 'platform-openapi-primary',
      routes,
    });
    const second = await createPreviewShadowFromDataset({
      root,
      datasetName: 'platform-openapi-alternate',
      routes,
    });
    const firstHost = await createProtocolHost({
      root,
      bindingName: 'web-openapi-browser',
      shadowUrl: first.server.url,
    });
    const secondHost = await createProtocolHost({
      root,
      bindingName: 'web-openapi-browser',
      shadowUrl: second.server.url,
    });
    const warnings: string[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((message) => {
      warnings.push(String(message));
    });
    try {
      const observed = await driver.runCase({}, async ({ page }) => {
        const requestOrigins: string[] = [];
        page.on('request', (request) => {
          if (request.url().includes('/__shadow/api/v1/trades')) {
            requestOrigins.push(new URL(request.url()).origin);
          }
        });
        const firstResults = await runBrowserPlan(
          page,
          firstHost,
          [
            { method: 'getTrade', input: { path: { trade_no: 'P-1' } } },
            { method: 'getTrade', input: { path: { trade_no: 'P-1' } } },
            { method: 'getTrade', input: { path: { trade_no: 'P-1' } } },
          ],
          {
            gatewayBaseUrl: `${firstHost.url.replace(/\/$/, '')}/__shadow`,
            securitySchemes,
            identity: accessIdentity,
          },
        );
        const alternate = await runBrowserPlan(
          page,
          secondHost,
          [{ method: 'getTrade', input: { path: { trade_no: 'P-1' } } }],
          {
            gatewayBaseUrl: `${secondHost.url.replace(/\/$/, '')}/__shadow`,
            securitySchemes,
            identity: accessIdentity,
          },
        );
        const unscripted = await runBrowserPlan(
          page,
          firstHost,
          [{ method: 'listTrades', input: { path: { merchant_id: 1001 } } }],
          {
            gatewayBaseUrl: `${firstHost.url.replace(/\/$/, '')}/__shadow`,
            securitySchemes,
            identity: accessIdentity,
          },
        );
        const unregistered = await page.evaluate(
          async (url) => {
            const response = await fetch(url);
            return { status: response.status, body: await response.json() };
          },
          `${firstHost.url.replace(/\/$/, '')}/__shadow/api/v1/not-registered`,
        );
        return { firstResults, alternate, unscripted, unregistered, requestOrigins };
      });

      await checkpoint('dataset-drives-ui', () => {
        expect(observed.firstResults.map((result) => result.kind)).toEqual([
          'success',
          'success',
          'success',
        ]);
        expect(observed.firstResults[0]).toEqual({
          kind: 'success',
          data: expect.objectContaining({ trade_no: 'P-1', status: 'PROCESSING' }),
        });
        expect(observed.alternate).toEqual([
          {
            kind: 'success',
            data: expect.objectContaining({ trade_no: 'P-1', status: 'SUCCEEDED' }),
          },
        ]);
      });
      await checkpoint('sequence-repeat-last', () => {
        expect(observed.firstResults[1]).toEqual({
          kind: 'success',
          data: expect.objectContaining({ trade_no: 'P-1', status: 'SUCCEEDED' }),
        });
        expect(observed.firstResults[2]).toEqual(observed.firstResults[1]);
      });
      await checkpoint('same-origin-proxy', () => {
        expect(observed.requestOrigins.length).toBeGreaterThan(0);
        expect(new Set(observed.requestOrigins)).toEqual(
          new Set([new URL(firstHost.url).origin, new URL(secondHost.url).origin]),
        );
        expect(first.server.url).not.toBe(firstHost.url);
      });
      await checkpoint('unscripted-logged-only', () => {
        expect(observed.unscripted).toEqual([{ kind: 'transport-failure', reason: 'HTTP_STATUS' }]);
        expect(observed.unregistered).toMatchObject({ status: 404 });
        expect(warnings.join('\n')).toContain('未编排');
        expect(warnings.join('\n')).toContain('未注册');
      });
      await checkpoint('via-launcher-no-count-evidence', () => {
        expect(first.datasetName).toBe('platform-openapi-primary');
        expect(second.datasetName).toBe('platform-openapi-alternate');
        expect(first.server.verify()).toEqual([]);
        expect(second.server.verify()).toEqual([]);
      });
    } finally {
      warn.mockRestore();
      await Promise.all([firstHost.close(), secondHost.close()]);
      await Promise.all([first.server.close(), second.server.close()]);
    }
  },
  { timeoutMs: 60_000 },
);
