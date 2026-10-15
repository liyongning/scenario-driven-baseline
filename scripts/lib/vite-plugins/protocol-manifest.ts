import type { Plugin } from 'vite';
import { findRepositoryRoot } from './bundle-manifest.ts';
import { loadProjectManifest } from '../project-manifest.ts';
import { writeProtocolManifest } from '../protocol-manifest.ts';

/** 协议包构建后记录摘要，协议宿主据此拒绝托管旧产物。 */
export function protocolManifestPlugin(): Plugin {
  let root: string | undefined;
  let directory: string | undefined;
  return {
    name: 'template-protocol-manifest',
    apply: 'build',
    configResolved(config) {
      root = findRepositoryRoot(config.root);
      const manifest = loadProjectManifest(root);
      const protocol = manifest.packages.find(
        (item) => config.root === `${root}/packages/${item.directory}` && item.role === 'protocol',
      );
      if (!protocol)
        throw new Error(`vite root ${config.root} is not a registered protocol package`);
      directory = protocol.directory;
    },
    writeBundle() {
      if (!root || !directory)
        throw new Error('protocol manifest plugin was used before config resolution');
      const manifest = loadProjectManifest(root);
      const protocol = manifest.packages.find((item) => item.directory === directory);
      if (!protocol) throw new Error(`protocol package ${directory} disappeared during build`);
      writeProtocolManifest(root, manifest, protocol);
    },
  };
}
