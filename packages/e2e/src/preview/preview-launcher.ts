import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import express from 'express';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import {
  loadProjectManifest,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import {
  loadProtocolAdapter,
  type ProtocolAdapter,
} from '../../../../scripts/lib/protocol-adapters.ts';
import { createSharedProxy } from '../hosts/proxy.ts';
import { loadWebConfig, type PlaceholderAssetRule, type WebConfig } from '../hosts/web-config.ts';
import { createPreviewShadowServer, type PreviewEntry } from '../shadow/preview-server.ts';
import type { RunningShadowServer } from '../shadow/server.ts';
import type { ShadowRoute } from '../shadow/routes.ts';

type DatasetManifest = Readonly<{
  formatVersion: 1;
  protocol: string;
  contractCarrier?: 'product' | 'engine';
  description?: string;
  entries: ReadonlyArray<PreviewEntry>;
}>;

export type PreviewDataset = Readonly<{
  name: string;
  protocol: string;
  entries: ReadonlyArray<PreviewEntry>;
}>;

export type PreviewDatasetAdapterLoader = (protocolDirectory: string) => Promise<ProtocolAdapter>;

export type PreviewShadow = Readonly<{
  datasetName: string;
  server: RunningShadowServer;
}>;

const datasetRoot = 'packages/e2e/tests/fixtures/_datasets';

/** 从预览命令参数中读取显式数据集名；缺省由配置提供默认值。 */
export function parsePreviewDatasetArgument(argv: ReadonlyArray<string>): string | undefined {
  const index = argv.indexOf('--dataset');
  return index < 0 ? undefined : argv[index + 1];
}

function datasetDirectory(root: string, name: string): string {
  return join(root, datasetRoot, name);
}

function availableDatasets(root: string, defaultName: string): string[] {
  let names: string[];
  try {
    names = readdirSync(join(root, datasetRoot), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    names = [];
  }
  const rank = (name: string) => Number(name !== defaultName);
  return names.sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}

function readManifest(
  directory: string,
  name: string,
): { text: string; manifest: DatasetManifest } {
  const path = join(directory, 'manifest.json');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const issue = new Error(`无法读取预览数据集 ${name}: ${String(error)}`) as Error & {
      cause: unknown;
    };
    issue.cause = error;
    throw issue;
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    const issue = new Error(
      `预览数据集 ${name} 的 manifest.json 不是合法 JSON: ${String(error)}`,
    ) as Error & { cause: unknown };
    issue.cause = error;
    throw issue;
  }
  const schema = JSON.parse(
    readFileSync(new URL('../../tests/fixtures/dataset.schema.json', import.meta.url), 'utf8'),
  ) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(value))
    throw new Error(`预览数据集 ${name} 不符合 dataset schema: ${ajv.errorsText(validate.errors)}`);
  return { text, manifest: value as DatasetManifest };
}

function defaultAdapterLoader(
  root: string,
  manifest: ProjectManifest,
): PreviewDatasetAdapterLoader {
  return (protocolDirectory) =>
    loadProtocolAdapter(manifest, protocolDirectory, {
      root,
    });
}

function responseIssues(manifest: DatasetManifest, adapter: ProtocolAdapter): string[] {
  const issues: string[] = [];
  manifest.entries.forEach((entry, entryIndex) => {
    const validator = adapter.responseValidator(entry.operationId, { manifest });
    if (!validator) {
      issues.push(`entry ${entryIndex + 1} ${entry.operationId}: 协议无法解析 operationId`);
      return;
    }
    entry.responses.forEach((response, responseIndex) => {
      const status = response.status ?? 200;
      issues.push(
        ...validator(response.body, status).map(
          (issue) =>
            `entry ${entryIndex + 1} ${entry.operationId} response ${responseIndex + 1}: ${issue}`,
        ),
      );
    });
  });
  return issues;
}

function placeholderRule(
  config: WebConfig,
  parsed: URL,
): Readonly<{ index: number; rule: PlaceholderAssetRule }> | undefined {
  const index = config.placeholderAssets.findIndex((rule) => rule.host === parsed.hostname);
  return index < 0 ? undefined : { index, rule: config.placeholderAssets[index]! };
}

function replaceValue(
  value: unknown,
  input: Readonly<{
    root: string;
    datasetName: string;
    config: WebConfig;
    path: string;
    issues: string[];
  }>,
): unknown {
  if (typeof value === 'string') {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return value;
    }
    const matched = placeholderRule(input.config, parsed);
    if (!matched) return value;
    if (matched.rule.path !== parsed.pathname) {
      input.issues.push(`${input.path}: 占位资源 ${value} 找不到对应本地资源`);
      return value;
    }
    if (!existsSync(resolve(input.root, matched.rule.file))) {
      input.issues.push(`${input.path}: 占位资源 ${value} 的本地文件不存在 ${matched.rule.file}`);
      return value;
    }
    return `/__preview-assets/${matched.index}${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  if (Array.isArray(value))
    return value.map((item, index) =>
      replaceValue(item, { ...input, path: `${input.path}[${index}]` }),
    );
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceValue(item, { ...input, path: `${input.path}.${key}` }),
      ]),
    );
  }
  return value;
}

function replacePlaceholderAssets(
  manifest: DatasetManifest,
  options: Readonly<{ root: string; datasetName: string; config: WebConfig }>,
): ReadonlyArray<PreviewEntry> {
  const issues: string[] = [];
  const entries = replaceValue(manifest.entries, {
    ...options,
    path: 'entries',
    issues,
  }) as ReadonlyArray<PreviewEntry>;
  if (issues.length > 0)
    throw new Error(`预览数据集 ${options.datasetName} 校验失败: ${issues.join('; ')}`);
  return entries;
}

/** 在启动任何服务前加载并校验预览数据集，再按配置替换占位资源地址。 */
export async function loadPreviewDataset(
  options: Readonly<{
    root: string;
    datasetName?: string;
    config?: WebConfig;
    adapterLoader?: PreviewDatasetAdapterLoader;
  }>,
): Promise<PreviewDataset> {
  const root = resolve(options.root);
  const config = options.config ?? loadWebConfig(root);
  const name = options.datasetName ?? config.defaultDataset;
  const directory = datasetDirectory(root, name);
  if (!existsSync(directory)) {
    const available = availableDatasets(root, config.defaultDataset);
    throw new Error(`未知预览数据集 ${name}；可用数据集：${available.join(', ')}`);
  }
  const loaded = readManifest(directory, name);
  const adapterLoader = options.adapterLoader
    ? options.adapterLoader
    : defaultAdapterLoader(root, loadProjectManifest(root));
  const adapter = await adapterLoader(loaded.manifest.protocol);
  const issues = [
    ...responseIssues(loaded.manifest, adapter),
    ...(await adapter.checkFixture(loaded.manifest, { manifest: loaded.text })),
  ];
  if (issues.length > 0) throw new Error(`预览数据集 ${name} 校验失败: ${issues.join('; ')}`);
  return {
    name,
    protocol: loaded.manifest.protocol,
    entries: replacePlaceholderAssets(loaded.manifest, { root, datasetName: name, config }),
  };
}

/** 经预览启动器构造预览 Shadow；调用方不得直接导入预览构造模块。 */
export async function createPreviewShadowFromDataset(
  options: Readonly<{
    root: string;
    datasetName?: string;
    routes: ReadonlyArray<ShadowRoute>;
    config?: WebConfig;
    adapterLoader?: PreviewDatasetAdapterLoader;
  }>,
): Promise<PreviewShadow> {
  const dataset = await loadPreviewDataset(options);
  const server = await createPreviewShadowServer({
    routes: options.routes,
    entries: dataset.entries,
    scenarioId: dataset.name,
    mode: 'preview',
  }).start();
  return { datasetName: dataset.name, server };
}

export type LocalPreview = Readonly<{
  url: string;
  datasetName: string;
  shadow: RunningShadowServer;
  close(): Promise<void>;
}>;

function bindServer(server: Server, host: string): Promise<number> {
  return new Promise<number>((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address() as AddressInfo;
      resolvePort(address.port);
    });
  });
}

/** 启动本地预览：先校验数据集，再用同一个代理同时提供 Vite 页面与预览 Shadow。 */
export async function startLocalPreview(
  options: Readonly<{
    root: string;
    datasetName?: string;
    routes: ReadonlyArray<ShadowRoute>;
    config?: WebConfig;
    adapterLoader?: PreviewDatasetAdapterLoader;
    host?: string;
    createVite?: (options: Parameters<typeof createViteServer>[0]) => Promise<ViteDevServer>;
  }>,
): Promise<LocalPreview> {
  const root = resolve(options.root);
  const config = options.config ?? loadWebConfig(root);
  const preview = await createPreviewShadowFromDataset({ ...options, config });
  const vite = await (options.createVite ?? createViteServer)({
    root: join(root, 'packages/web'),
    appType: 'spa',
    server: { middlewareMode: true },
  });
  const app = express();
  config.placeholderAssets.forEach((rule, index) => {
    app.use(`/__preview-assets/${index}`, (_request, response) => {
      response.sendFile(resolve(root, rule.file));
    });
  });
  app.use('/api', createSharedProxy({ target: preview.server.url, stripPrefix: '/api' }));
  app.use(vite.middlewares);
  const server = createHttpServer(app);
  const port = await bindServer(server, options.host ?? '127.0.0.1');
  let closed = false;
  return {
    url: `http://${options.host ?? '127.0.0.1'}:${port}/`,
    datasetName: preview.datasetName,
    shadow: preview.server,
    async close() {
      if (closed) return;
      closed = true;
      await Promise.all([
        vite.close(),
        new Promise<void>((resolveClose) => server.close(() => resolveClose())),
        preview.server.close(),
      ]);
    },
  };
}
