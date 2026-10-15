import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { digestFiles } from './fingerprints.ts';
import type { ManifestPackage, ProjectManifest } from './project-manifest.ts';
import { readSourceInventory } from './source-inventory.ts';

export type ProtocolBuildManifest = Readonly<{
  formatVersion: 1;
  protocol: string;
  sourceDigest: string;
}>;

export function protocolManifestPath(root: string, protocolDirectory: string): string {
  return join(root, 'artifacts', 'build', protocolDirectory, 'protocol-manifest.json');
}

/** 协议产物摘要只覆盖协议包手写源码，不包含 testing 与生成代码。 */
export function protocolSourceDigest(
  root: string,
  manifest: ProjectManifest,
  protocol: ManifestPackage,
): string {
  const prefix = `packages/${protocol.directory}/src/`;
  const files = readSourceInventory(root, manifest)
    .files.filter((file) => file.path.startsWith(prefix) && file.class !== 'test')
    .map((file) => join(root, file.path));
  return digestFiles(root, files);
}

export function writeProtocolManifest(
  root: string,
  manifest: ProjectManifest,
  protocol: ManifestPackage,
): ProtocolBuildManifest {
  const value: ProtocolBuildManifest = {
    formatVersion: 1,
    protocol: protocol.directory,
    sourceDigest: protocolSourceDigest(root, manifest, protocol),
  };
  const path = protocolManifestPath(root, protocol.directory);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return value;
}
