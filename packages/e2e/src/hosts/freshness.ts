import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { checkParsedBundle, productDigest } from '../../../../scripts/lib/bundle.ts';
import { bundleManifestPath } from '../../../../scripts/lib/bundle-manifest.ts';
import {
  loadProjectManifest,
  type ManifestPackage,
} from '../../../../scripts/lib/project-manifest.ts';
import {
  protocolManifestPath,
  protocolSourceDigest,
} from '../../../../scripts/lib/protocol-manifest.ts';

function packageByDirectory(root: string, directory: string): ManifestPackage {
  const manifest = loadProjectManifest(root);
  const pkg = manifest.packages.find((item) => item.directory === directory);
  if (!pkg) throw new Error(`project.manifest.json 未登记包 ${directory}`);
  return pkg;
}

export function assertProductBundleFresh(root: string, productDirectory: string): void {
  const manifest = loadProjectManifest(root);
  const product = packageByDirectory(root, productDirectory);
  const path = bundleManifestPath(root, productDirectory);
  if (!existsSync(path))
    throw new Error(`${relative(root, path)} 不存在，请先执行 pnpm build 再启动应用宿主`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`${relative(root, path)} 不是有效 JSON，请重新执行 pnpm build`);
  }
  const issues = checkParsedBundle(root, manifest, product, value);
  if (issues.length > 0)
    throw new Error(`应用产物已过期或缺失：${issues.join('; ')}；请先执行 pnpm build`);
  if (productDigest(root, manifest, product).length !== 64) throw new Error('产品摘要计算失败');
}

export function assertProtocolBundleFresh(root: string, protocolDirectory: string): void {
  const manifest = loadProjectManifest(root);
  const protocol = packageByDirectory(root, protocolDirectory);
  const path = protocolManifestPath(root, protocolDirectory);
  if (!existsSync(path))
    throw new Error(`${relative(root, path)} 不存在，请先执行 pnpm build 再启动协议宿主`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`${relative(root, path)} 不是有效 JSON，请重新执行 pnpm build`);
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    (value as { protocol?: unknown }).protocol !== protocolDirectory ||
    typeof (value as { sourceDigest?: unknown }).sourceDigest !== 'string'
  )
    throw new Error(`${relative(root, path)} 格式无效，请重新执行 pnpm build`);
  const current = protocolSourceDigest(root, manifest, protocol);
  if ((value as { sourceDigest: string }).sourceDigest !== current)
    throw new Error(`协议包 ${protocolDirectory} 产物已过期，请先执行 pnpm build`);
}
