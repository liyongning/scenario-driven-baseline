import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { collectFiles } from './fingerprints.ts';
import type { ManifestPackage, ProjectManifest } from './project-manifest.ts';

/** 分析用 TS program：把各包包名映射到包内源码根，协议包解析到 `src` 而不是 `dist`。 */
export function analysisProgram(
  root: string,
  manifest: ProjectManifest,
  generatedRoot: string,
  product: ManifestPackage,
  protocol: ManifestPackage,
) {
  const productSrc = resolve(root, 'packages', product.directory, 'src');
  const protocolSrc = resolve(root, 'packages', protocol.directory, 'src');
  const paths: Record<string, string[]> = {
    [`${protocol.name}/generated/*`]: [relative(root, generatedRoot) + '/*'],
    [protocol.name]: [relative(root, join(protocolSrc, 'index.ts'))],
    [`${protocol.name}/*`]: [relative(root, protocolSrc) + '/*'],
    [product.name]: [relative(root, join(productSrc, 'index.ts'))],
    [`${product.name}/*`]: [relative(root, productSrc) + '/*'],
  };
  const sources = (directory: string) =>
    collectFiles(directory, (path) => path.endsWith('.ts') && !path.endsWith('.d.ts'));
  return ts.createProgram([...sources(productSrc), ...sources(protocolSrc)], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    baseUrl: root,
    paths,
  });
}
