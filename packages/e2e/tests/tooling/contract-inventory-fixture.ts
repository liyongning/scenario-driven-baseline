import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadProjectManifest,
  packageByRole,
  testProjectsByClass,
} from '../../../../scripts/lib/project-manifest.ts';

/** 模板自身事实核验：只读真实仓库已提交的协议产物与清单，不依赖调用方工作目录。 */
export const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
export const generated = join(repositoryRoot, 'packages/protocol/src/generated');
export const tradeFile = 'generated/idl/infra/trade/v1/trade.ts';
/** 义务运行环境由清单派生：路由、字段与共享方法要求全部 integration 与 platform 项目。 */
export const requiredIn = testProjectsByClass(loadProjectManifest(repositoryRoot), [
  'integration',
  'platform',
]);
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
  const product = packageByRole(manifest, 'product');
  const protocol = packageByRole(manifest, 'protocol');
  return {
    declaration: `packages/${product.directory}/src/consumed-operations.ts`,
    caller: `packages/${product.directory}/src/caller.ts`,
    generated: `packages/${protocol.directory}/src/generated`,
    protocolSrc: `packages/${protocol.directory}/src`,
  };
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
