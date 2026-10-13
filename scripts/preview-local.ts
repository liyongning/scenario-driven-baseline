import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createTrade, getTrade, listTrades } from '../packages/openapi/src/generated/operations.ts';
import { discoverOpenApiRoutes } from '../packages/openapi/testing/shadow-routes.ts';
import {
  parsePreviewDatasetArgument,
  startLocalPreview,
} from '../packages/e2e/src/preview/preview-launcher.ts';

/* v8 ignore start -- 真实启动、信号退出与地址输出由本地预览演练承担。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const datasetName = parsePreviewDatasetArgument(process.argv);
  const preview = await startLocalPreview({
    root: process.cwd(),
    ...(datasetName === undefined ? {} : { datasetName }),
    routes: discoverOpenApiRoutes([createTrade, getTrade, listTrades]),
  });
  console.log(`本地预览已启动：${preview.url}?token=preview-token&merchant=1001`);
  const stop = async () => {
    await preview.close();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}
/* v8 ignore stop */
