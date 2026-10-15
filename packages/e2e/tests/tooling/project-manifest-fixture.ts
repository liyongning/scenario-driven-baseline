import type { ManifestPackage, TestProject } from '../../../../scripts/lib/project-manifest.ts';

export type MutableManifest = {
  packages: ManifestPackage[];
  bindings: Array<{
    name: string;
    product: string;
    protocol: string;
    platforms: string[];
  }>;
  requiredCommands: string[];
  testProjects: TestProject[];
  fingerprints: { sourceRoots: string[]; buildInputs: string[]; protocolInputs: string[] };
  quality?: { coverageExclusions: Array<{ path: string; reason: string }>; maxLinesExemptions: [] };
  release?: { registry: string; tagPrefix: string };
};

export const baseManifest = (): MutableManifest => ({
  packages: [
    {
      directory: 'sample-product',
      name: '@sample/product',
      role: 'product',
      form: 'sdk',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'sample-protocol',
      name: '@sample/protocol',
      role: 'protocol',
      protocolKind: 'idl',
      private: false,
      allowedDirectories: ['src', 'testing'],
      moduleRoots: ['src', 'testing'],
    },
    {
      directory: 'sample-test',
      name: '@sample/test',
      role: 'test',
      private: true,
      allowedDirectories: ['src', 'host', 'tests'],
      moduleRoots: ['src', 'host', 'tests'],
    },
  ],
  bindings: [
    {
      name: 'sample-product-protocol',
      product: 'sample-product',
      protocol: 'sample-protocol',
      platforms: ['platform'],
    },
  ],
  requiredCommands: ['check:fast'],
  testProjects: [
    { name: 'product-unit', class: 'unit', config: 'packages/sample-product/vitest.config.ts' },
    { name: 'protocol-unit', class: 'unit', config: 'packages/sample-protocol/vitest.config.ts' },
    { name: 'integration', class: 'integration', config: 'packages/sample-test/vitest.config.ts' },
    { name: 'platform', class: 'platform', config: 'packages/sample-test/vitest.config.weapp.ts' },
  ],
  fingerprints: {
    sourceRoots: ['sample-src'],
    buildInputs: ['build.config.ts'],
    protocolInputs: ['proto-gen.lock'],
  },
  quality: { coverageExclusions: [], maxLinesExemptions: [] },
});
