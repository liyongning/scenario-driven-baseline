import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  declarationRoot,
  exampleCallerSource,
  exampleDeclarationSource,
  repositoryProtocolSource,
} from './declaration-fixture.ts';
import {
  bindingForProduct,
  loadProjectManifest,
  packageByDirectory,
  packagesByRole,
} from '../../../../scripts/lib/project-manifest.ts';
import { testEnvironmentsByClass } from '../../../../scripts/lib/test-environments.ts';

/** 模板自身事实核验：只读真实仓库已提交的协议产物与清单，不依赖调用方工作目录。 */
export const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
export const generated = join(repositoryRoot, 'packages/protocol/src/generated');
export const tradeFile = 'generated/idl/infra/trade/v1/trade.ts';
const repositoryManifest = loadProjectManifest(repositoryRoot);
const sdkProduct = packagesByRole(repositoryManifest, 'product').find(
  (item) => item.form === 'sdk',
)!;
/** 义务运行环境由 SDK 产品绑定派生：integration 加上该绑定声明的平台。 */
export const requiredIn = [
  ...testEnvironmentsByClass(repositoryManifest, ['integration']),
  ...bindingForProduct(repositoryManifest, sdkProduct.directory).platforms,
];
export const businessErrorNames = [
  'ErrGatewayProxyInvalidParameter',
  'ErrGatewayProxyUnauthorized',
  'ErrGatewayProxyNotFound',
  'ErrInfraTradeQueryTradeUnauthorized',
  'ErrInfraTradeQueryTradeInvalidParameter',
  'ErrInfraTradeQueryTradeNotFound',
  'ErrInfraTradeQueryTradeUnavailable',
];

export async function copyGenerated(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await cp(generated, join(root, 'generated'), { recursive: true });
  return { root, file: join(root, tradeFile) };
}

/** 受控临时根中的包目录由清单推导，测试不写死包名与目录。 */
export function controlled(root: string) {
  const manifest = loadProjectManifest(root);
  const product = packagesByRole(manifest, 'product').find((item) => item.form === 'sdk');
  if (!product) throw new Error('fixture has no sdk product package');
  const protocol = packageByDirectory(
    manifest,
    bindingForProduct(manifest, product.directory).protocol,
  );
  return {
    declaration: `packages/${product.directory}/src/consumed-operations.ts`,
    caller: `packages/${product.directory}/src/caller.ts`,
    generated: `packages/${protocol.directory}/src/generated`,
    protocolSrc: `packages/${protocol.directory}/src`,
  };
}

/**
 * 示例协议义务的受控输入：声明、调用与错误码表由夹具在用例内提供，generated 取自仓库协议包
 * （不在示例删除白名单内），因此示例删除后仍能派生同样的义务（ENG-06）。
 */
export function exampleInventoryRoot(prefix = 'template-example-contract-') {
  return declarationRoot({
    generatedFromRepository: true,
    declaration: exampleDeclarationSource,
    caller: exampleCallerSource,
    protocolFiles: {
      'errors/business-codes.ts': repositoryProtocolSource('errors/business-codes.ts'),
    },
    prefix,
  });
}

/** 受控临时根内被用例改写的示例协议 generated 文件。 */
export function inventoryTradeFile(root: string): string {
  return join(root, controlled(root).generated, 'idl/infra/trade/v1/trade.ts');
}

export function customMethodFile(
  name: string,
  options: Readonly<{
    factory?: string;
    meta?: string;
    cast?: string;
    extra?: string;
    request?: string;
    response?: string;
  }> = {},
) {
  return [
    "import { createMethod, defineMethodSpec } from '../../../../std';",
    '',
    `export interface ${name}Request {`,
    options.request ?? '  user_id?: string;',
    '}',
    `export interface ${name}Response {`,
    options.response ?? '  trade_no?: string;',
    '}',
    `export const ${name} = ${options.factory ?? 'createMethod'}(`,
    options.meta ?? `  { name: '${name}' }`,
    `)${options.cast ?? ''};`,
    options.extra ?? '',
    '',
  ].join('\n');
}
