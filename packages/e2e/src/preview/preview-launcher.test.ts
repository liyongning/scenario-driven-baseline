import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { getTrade, listTrades } from '../../../openapi/testing/engine/generated/operations.ts';
import openApiAdapter from '../../../openapi/testing/adapter.ts';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';
import {
  loadPreviewDataset,
  parsePreviewDatasetArgument,
  startLocalPreview,
  type PreviewDatasetAdapterLoader,
} from './preview-launcher.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const repositoryRoot = process.cwd();
const datasetRoot = join(repositoryRoot, 'packages/e2e/tests/fixtures/_datasets');
const fixtureConfig = {
  placeholderAssets: [
    {
      host: 'assets.template.invalid',
      path: '/fixture.svg',
      file: 'packages/e2e/host/browser/fixture-image.svg',
      contentType: 'image/svg+xml',
    },
  ],
  proxyPrefixes: ['/api'],
  defaultDataset: 'platform-openapi-primary',
};

function datasetFixture(
  name: string,
  value: unknown,
  config: unknown = fixtureConfig,
  files: Readonly<Record<string, string>> = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'preview-launcher-'));
  roots.push(root);
  mkdirSync(join(root, 'packages/e2e/tests/fixtures/_datasets', name), { recursive: true });
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify({ packages: [] }));
  writeFileSync(join(root, 'web.config.json'), JSON.stringify(config));
  writeFileSync(
    join(root, 'packages/e2e/tests/fixtures/_datasets', name, 'manifest.json'),
    JSON.stringify(value),
  );
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

function validDataset(entries: ReadonlyArray<unknown>) {
  return {
    formatVersion: 1,
    protocol: 'openapi',
    contractCarrier: 'engine',
    description: '测试数据集',
    entries,
  };
}

test(
  'SCN-BROWSER-PLATFORM-013 preview-launcher-rules',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-013',
        caseId: 'preview-launcher-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-013',
            caseKey: 'preview-launcher-rules',
            checks: [
              'default-dataset',
              'valid-loaded-unchanged',
              'contract-rejected',
              'unknown-dataset',
              'replace-after-validate',
              'missing-local-resource',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    context.expect(parsePreviewDatasetArgument(['node', 'preview-local'])).toBeUndefined();
    context
      .expect(parsePreviewDatasetArgument(['node', 'preview-local', '--dataset', 'named']))
      .toBe('named');

    const configuredDefault = (
      JSON.parse(
        readFileSync(join(repositoryRoot, 'packages/e2e/host/web.config.json'), 'utf8'),
      ) as {
        defaultDataset: string;
      }
    ).defaultDataset;
    const defaultDataset = await loadPreviewDataset({
      root: repositoryRoot,
      adapterLoader: async () => openApiAdapter,
    });
    context.expect(defaultDataset.name).toBe(configuredDefault);
    context
      .expect((await loadPreviewDataset({ root: repositoryRoot })).name)
      .toBe(configuredDefault);

    const named = await loadPreviewDataset({
      root: repositoryRoot,
      datasetName: 'platform-openapi-alternate',
      adapterLoader: async () => openApiAdapter,
    });
    context.expect(named.name).toBe('platform-openapi-alternate');
    context
      .expect(named.entries)
      .toEqual(
        JSON.parse(
          readFileSync(join(datasetRoot, 'platform-openapi-alternate/manifest.json'), 'utf8'),
        ).entries,
      );

    const missingDataset = await loadPreviewDataset({
      root: repositoryRoot,
      datasetName: 'does-not-exist',
      adapterLoader: async () => openApiAdapter,
    }).catch((error: unknown) => error);
    context.expect(String(missingDataset)).toContain('does-not-exist');
    context.expect(String(missingDataset)).toContain('platform-openapi-primary');
    context.expect(String(missingDataset)).toContain('platform-openapi-alternate');

    const sortedDatasetsRoot = mkdtempSync(join(tmpdir(), 'preview-launcher-'));
    roots.push(sortedDatasetsRoot);
    writeFileSync(join(sortedDatasetsRoot, 'web.config.json'), JSON.stringify(fixtureConfig));
    for (const name of ['platform-openapi-primary', 'zeta', 'alpha'])
      mkdirSync(join(sortedDatasetsRoot, 'packages/e2e/tests/fixtures/_datasets', name), {
        recursive: true,
      });
    await context
      .expect(
        loadPreviewDataset({
          root: sortedDatasetsRoot,
          datasetName: 'missing',
          adapterLoader: async () => openApiAdapter,
        }),
      )
      .rejects.toThrow(/missing.*platform-openapi-primary.*alpha.*zeta/);

    const noDatasetRoot = mkdtempSync(join(tmpdir(), 'preview-launcher-'));
    roots.push(noDatasetRoot);
    writeFileSync(join(noDatasetRoot, 'web.config.json'), JSON.stringify(fixtureConfig));
    await context
      .expect(
        loadPreviewDataset({
          root: noDatasetRoot,
          datasetName: 'missing-root',
          adapterLoader: async () => openApiAdapter,
        }),
      )
      .rejects.toThrow(/missing-root.*可用数据集：$/);

    const missingManifestRoot = mkdtempSync(join(tmpdir(), 'preview-launcher-'));
    roots.push(missingManifestRoot);
    mkdirSync(join(missingManifestRoot, 'packages/e2e/tests/fixtures/_datasets/missing'), {
      recursive: true,
    });
    writeFileSync(join(missingManifestRoot, 'web.config.json'), JSON.stringify(fixtureConfig));
    await context
      .expect(
        loadPreviewDataset({
          root: missingManifestRoot,
          datasetName: 'missing',
          adapterLoader: async () => openApiAdapter,
        }),
      )
      .rejects.toThrow(/无法读取预览数据集 missing/);

    const invalidJsonRoot = mkdtempSync(join(tmpdir(), 'preview-launcher-'));
    roots.push(invalidJsonRoot);
    const invalidJsonDirectory = join(
      invalidJsonRoot,
      'packages/e2e/tests/fixtures/_datasets/invalid-json',
    );
    mkdirSync(invalidJsonDirectory, { recursive: true });
    writeFileSync(join(invalidJsonRoot, 'web.config.json'), JSON.stringify(fixtureConfig));
    writeFileSync(join(invalidJsonDirectory, 'manifest.json'), '{');
    await context
      .expect(
        loadPreviewDataset({
          root: invalidJsonRoot,
          datasetName: 'invalid-json',
          adapterLoader: async () => openApiAdapter,
        }),
      )
      .rejects.toThrow(/invalid-json.*不是合法 JSON/);

    const validTrade = {
      code: 0,
      message: 'ok',
      data: {
        trade_no: 'T-1',
        status: 'CREATED',
        amount: 1,
        merchant_id: 1,
        failure_reason: null,
      },
    };
    const extraFieldRoot = datasetFixture(
      'bad-extra',
      validDataset([
        { operationId: 'getTrade', responses: [{ body: { ...validTrade, extra: true } }] },
      ]),
    );
    await context
      .expect(
        loadPreviewDataset({
          root: extraFieldRoot,
          datasetName: 'bad-extra',
          adapterLoader: async () => openApiAdapter,
        }),
      )
      .rejects.toThrow(/bad-extra.*getTrade.*extra/i);

    const badCodeRoot = datasetFixture(
      'bad-code',
      validDataset([
        { operationId: 'getTrade', responses: [{ body: { ...validTrade, code: 99999 } }] },
      ]),
    );
    await context
      .expect(
        loadPreviewDataset({
          root: badCodeRoot,
          datasetName: 'bad-code',
          adapterLoader: async () => openApiAdapter,
        }),
      )
      .rejects.toThrow(/bad-code.*getTrade.*code/i);

    const badShapeRoot = datasetFixture('bad-shape', {
      formatVersion: 1,
      protocol: 'openapi',
      entries: { getTrade: [] },
    });
    await context
      .expect(
        loadPreviewDataset({
          root: badShapeRoot,
          datasetName: 'bad-shape',
          adapterLoader: async () => openApiAdapter,
        }),
      )
      .rejects.toThrow(/bad-shape.*entries/i);

    const validationBodies: unknown[] = [];
    const replacementAdapter: PreviewDatasetAdapterLoader = async () => ({
      resolveDeclaration: () => undefined,
      deriveObligations: () => ({ obligations: [], discoveries: [] }),
      responseValidator: () => (body) => {
        validationBodies.push(body);
        return [];
      },
      checkFixture: () => [],
      scanCalls: () => [],
    });
    const replacementRoot = datasetFixture(
      'resources',
      validDataset([
        {
          operationId: 'getTrade',
          responses: [
            {
              body: {
                code: 0,
                message: 'ok',
                data: { image: 'https://assets.template.invalid/fixture.svg?size=2' },
              },
            },
          ],
        },
      ]),
      fixtureConfig,
      { 'packages/e2e/host/browser/fixture-image.svg': '<svg/>' },
    );
    const replaced = await loadPreviewDataset({
      root: replacementRoot,
      datasetName: 'resources',
      adapterLoader: replacementAdapter,
    });
    context.expect(validationBodies).toEqual([
      {
        code: 0,
        message: 'ok',
        data: { image: 'https://assets.template.invalid/fixture.svg?size=2' },
      },
    ]);
    context
      .expect((replaced.entries[0]!.responses[0]!.body as { data: { image: string } }).data.image)
      .toBe('/__preview-assets/0/fixture.svg?size=2');

    const unmanagedRoot = datasetFixture(
      'unmanaged-resource',
      validDataset([
        {
          operationId: 'getTrade',
          responses: [
            {
              body: {
                code: 0,
                message: 'ok',
                data: { image: 'https://cdn.example.com/image.png' },
              },
            },
          ],
        },
      ]),
    );
    const unmanaged = await loadPreviewDataset({
      root: unmanagedRoot,
      datasetName: 'unmanaged-resource',
      adapterLoader: replacementAdapter,
    });
    context
      .expect((unmanaged.entries[0]!.responses[0]!.body as { data: { image: string } }).data.image)
      .toBe('https://cdn.example.com/image.png');

    const unknownOperationRoot = datasetFixture(
      'unknown-operation',
      validDataset([{ operationId: 'missingOperation', responses: [{ body: {} }] }]),
    );
    await context
      .expect(
        loadPreviewDataset({
          root: unknownOperationRoot,
          datasetName: 'unknown-operation',
          adapterLoader: async () => ({
            ...openApiAdapter,
            responseValidator: () => undefined,
          }),
        }),
      )
      .rejects.toThrow(/unknown-operation.*missingOperation.*无法解析/);

    const missingRoot = datasetFixture(
      'missing-resource',
      validDataset([
        {
          operationId: 'getTrade',
          responses: [
            {
              body: {
                code: 0,
                message: 'ok',
                data: { image: 'https://assets.template.invalid/missing.svg' },
              },
            },
          ],
        },
      ]),
    );
    await context
      .expect(
        loadPreviewDataset({
          root: missingRoot,
          datasetName: 'missing-resource',
          adapterLoader: replacementAdapter,
        }),
      )
      .rejects.toThrow(/missing-resource.*assets\.template\.invalid\/missing\.svg/);

    const missingFileRoot = datasetFixture(
      'missing-file',
      validDataset([
        {
          operationId: 'getTrade',
          responses: [
            {
              body: {
                code: 0,
                message: 'ok',
                data: { image: 'https://assets.template.invalid/fixture.svg' },
              },
            },
          ],
        },
      ]),
    );
    await context
      .expect(
        loadPreviewDataset({
          root: missingFileRoot,
          datasetName: 'missing-file',
          adapterLoader: replacementAdapter,
        }),
      )
      .rejects.toThrow(/missing-file.*本地文件不存在/);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: [
          'default-dataset',
          'valid-loaded-unchanged',
          'contract-rejected',
          'unknown-dataset',
          'replace-after-validate',
          'missing-local-resource',
        ],
      }),
      'scenario-evidence',
    );
  },
);

test('local preview serves Vite, shared proxy, and configured local assets', async () => {
  const preview = await startLocalPreview({
    root: repositoryRoot,
    datasetName: 'platform-openapi-primary',
    routes: routesFromOpenApiOperations([getTrade, listTrades], [getTrade, listTrades]),
    adapterLoader: async () => openApiAdapter,
  });
  try {
    const page = await fetch(preview.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="app"></div>');

    const response = await fetch(`${preview.url}api/api/v1/trades/P-1`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: 0,
      data: { trade_no: 'P-1', status: 'PROCESSING' },
    });

    const asset = await fetch(`${preview.url}__preview-assets/0/fixture.svg`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('image/svg+xml');
  } finally {
    await preview.close();
    await preview.close();
  }
});

test('local preview accepts an explicit host', async () => {
  const preview = await startLocalPreview({
    root: repositoryRoot,
    datasetName: 'platform-openapi-primary',
    routes: routesFromOpenApiOperations([getTrade, listTrades], [getTrade, listTrades]),
    adapterLoader: async () => openApiAdapter,
    host: '127.0.0.1',
  });
  try {
    expect(new URL(preview.url).hostname).toBe('127.0.0.1');
  } finally {
    await preview.close();
  }
});
