import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadProjectManifest, packagesByRole } from './lib/project-manifest.ts';
import {
  parsePreviewDatasetArgument,
  startLocalPreview,
} from '../packages/e2e/src/preview/preview-launcher.ts';
import type { ShadowRoute } from '../packages/e2e/src/shadow/routes.ts';

type Operation = Readonly<{
  meta: Readonly<{ id: string; method: string; path: string }>;
}>;

/* v8 ignore start -- 真实清单发现与启动由本地预览演练承担。 */
function isOperation(value: unknown): value is Operation {
  if (!value || typeof value !== 'object') return false;
  const meta = (value as { meta?: unknown }).meta;
  if (!meta || typeof meta !== 'object') return false;
  const candidate = meta as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.method === 'string' &&
    typeof candidate.path === 'string'
  );
}

/** 从清单登记的 OpenAPI 协议包发现产品契约路由；预览启动前由调用方使用。 */
export async function previewRoutes(root: string) {
  const manifest = loadProjectManifest(root);
  const protocol = packagesByRole(manifest, 'protocol').find((pkg) =>
    existsSync(resolve(root, 'packages', pkg.directory, 'testing/shadow-routes.ts')),
  );
  if (!protocol) throw new Error('没有登记可构造预览路由的协议包');
  const operationsModule = (await import(
    pathToFileURL(resolve(root, 'packages', protocol.directory, 'src/generated/operations.ts')).href
  )) as Record<string, unknown>;
  const routesModule = (await import(
    pathToFileURL(resolve(root, 'packages', protocol.directory, 'testing/shadow-routes.ts')).href
  )) as {
    discoverOpenApiRoutes(operations: ReadonlyArray<Operation>): ReadonlyArray<ShadowRoute>;
  };
  return routesModule.discoverOpenApiRoutes(Object.values(operationsModule).filter(isOperation));
}
/* v8 ignore stop */

/* v8 ignore start -- 真实启动、信号退出与地址输出由本地预览演练承担。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const main = async () => {
    const datasetName = parsePreviewDatasetArgument(process.argv);
    const preview = await startLocalPreview({
      root: process.cwd(),
      ...(datasetName === undefined ? {} : { datasetName }),
      routes: await previewRoutes(process.cwd()),
    });
    console.log(`本地预览已启动：${preview.url}?token=preview-token&merchant=1001`);
    const stop = async () => {
      await preview.close();
      process.exitCode = 0;
    };
    process.once('SIGINT', () => void stop());
    process.once('SIGTERM', () => void stop());
  };
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
