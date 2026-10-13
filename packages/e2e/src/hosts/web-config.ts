import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

export type PlaceholderAssetRule = Readonly<{
  host: string;
  path: string;
  file: string;
  contentType: string;
}>;

export type WebConfig = Readonly<{
  placeholderAssets: ReadonlyArray<PlaceholderAssetRule>;
  /** `dev:remote` 允许转发到 DEV_REMOTE_TARGET 的同源前缀。 */
  proxyPrefixes: ReadonlyArray<string>;
  /** `preview:local` 未传 `--dataset` 时使用的数据集名称。 */
  defaultDataset: string;
}>;

const schemaUrl = new URL('../../host/web.config.schema.json', import.meta.url);

function configPath(root: string): string {
  const direct = join(root, 'web.config.json');
  return existsSync(direct) ? direct : join(root, 'packages/e2e/host/web.config.json');
}

/** 读取并严格校验浏览器宿主配置；错误定位到具体 JSON 字段。 */
export function loadWebConfig(root = process.cwd()): WebConfig {
  const path = configPath(resolve(root));
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    cause.message = `无法读取 ${path}: ${cause.message}`;
    throw cause;
  }
  const schema = JSON.parse(readFileSync(schemaUrl, 'utf8')) as object;
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validate(value))
    throw new Error(
      `${path} 不符合 schema: ${(validate.errors ?? [])
        .map((error) => {
          const property = (error.params as { additionalProperty?: string }).additionalProperty;
          return `${error.instancePath || '/'}${property ? ` ${property}` : ''} ${error.message ?? ''}`.trim();
        })
        .join('; ')}`,
    );
  return value as WebConfig;
}
