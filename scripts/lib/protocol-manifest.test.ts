import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createEngineeringFormRoot } from '../../packages/e2e/tests/tooling/engineering-form-fixture.ts';
import { loadProjectManifest } from './project-manifest.ts';
import {
  protocolManifestPath,
  protocolSourceDigest,
  writeProtocolManifest,
} from './protocol-manifest.ts';
import { protocolManifestPlugin } from './vite-plugins/protocol-manifest.ts';

function hookHandler<T extends (...args: never[]) => unknown>(hook: unknown): T {
  if (typeof hook === 'function') return hook as T;
  if (hook && typeof hook === 'object' && 'handler' in hook && typeof hook.handler === 'function')
    return hook.handler as T;
  throw new Error('hook has no callable handler');
}

function protocolPackage(root: string) {
  const manifest = loadProjectManifest(root);
  const protocol = manifest.packages.find((item) => item.directory === 'sdk-protocol');
  if (!protocol) throw new Error('fixture protocol package is missing');
  return { manifest, protocol };
}

describe('protocol build manifest', () => {
  test('digests handwritten sources, excludes tests, and writes the build manifest', () => {
    const fixture = createEngineeringFormRoot(undefined, {
      'packages/sdk-protocol/src/runtime.ts': 'export const runtime = 1;\n',
      'packages/sdk-protocol/src/runtime.test.ts': 'export const testOnly = 1;\n',
    });
    try {
      const { manifest, protocol } = protocolPackage(fixture.root);
      const before = protocolSourceDigest(fixture.root, manifest, protocol);
      expect(before).toMatch(/^[a-f0-9]{64}$/);

      writeFileSync(join(fixture.root, 'packages/sdk-protocol/src/runtime.test.ts'), 'changed\n');
      expect(protocolSourceDigest(fixture.root, manifest, protocol)).toBe(before);
      writeFileSync(
        join(fixture.root, 'packages/sdk-protocol/src/runtime.ts'),
        'export const runtime = 2;\n',
      );
      expect(protocolSourceDigest(fixture.root, manifest, protocol)).not.toBe(before);

      expect(protocolManifestPath(fixture.root, protocol.directory)).toBe(
        join(fixture.root, 'artifacts/build/sdk-protocol/protocol-manifest.json'),
      );
      const written = writeProtocolManifest(fixture.root, manifest, protocol);
      expect(written).toEqual({
        formatVersion: 1,
        protocol: 'sdk-protocol',
        sourceDigest: protocolSourceDigest(fixture.root, manifest, protocol),
      });
      expect(
        JSON.parse(
          readFileSync(
            join(fixture.root, 'artifacts/build/sdk-protocol/protocol-manifest.json'),
            'utf8',
          ),
        ),
      ).toEqual(written);
    } finally {
      fixture.cleanup();
    }
  });

  test('Vite plugin resolves a protocol package and writes after the bundle', () => {
    const fixture = createEngineeringFormRoot(undefined, {
      'packages/sdk-protocol/src/runtime.ts': 'export const runtime = 1;\n',
    });
    try {
      const plugin = protocolManifestPlugin();
      const configResolved = hookHandler<(config: { root: string }) => void>(plugin.configResolved);
      const writeBundle = hookHandler<() => void>(plugin.writeBundle);
      configResolved({ root: join(fixture.root, 'packages/sdk-protocol') });
      writeBundle();
      expect(plugin.name).toBe('template-protocol-manifest');
      expect(plugin.apply).toBe('build');
      expect(
        readFileSync(
          join(fixture.root, 'artifacts/build/sdk-protocol/protocol-manifest.json'),
          'utf8',
        ),
      ).toContain('"protocol": "sdk-protocol"');
    } finally {
      fixture.cleanup();
    }
  });

  test('Vite plugin rejects invalid ordering, non-protocol roots, and removed packages', () => {
    const fixture = createEngineeringFormRoot(undefined, {
      'packages/sdk-protocol/src/runtime.ts': 'export const runtime = 1;\n',
    });
    try {
      const uninitialized = protocolManifestPlugin();
      expect(() => hookHandler<() => void>(uninitialized.writeBundle)()).toThrow(
        /before config resolution/,
      );

      const wrongRoot = protocolManifestPlugin();
      const wrongConfigResolved = hookHandler<(config: { root: string }) => void>(
        wrongRoot.configResolved,
      );
      expect(() =>
        wrongConfigResolved({ root: join(fixture.root, 'packages/sdk-product') }),
      ).toThrow(/not a registered protocol package/);

      const removed = protocolManifestPlugin();
      const configResolved = hookHandler<(config: { root: string }) => void>(
        removed.configResolved,
      );
      const writeBundle = hookHandler<() => void>(removed.writeBundle);
      configResolved({ root: join(fixture.root, 'packages/sdk-protocol') });
      const manifest = JSON.parse(
        readFileSync(join(fixture.root, 'project.manifest.json'), 'utf8'),
      ) as {
        packages: Array<{ directory: string }>;
        bindings: Array<{ product: string; protocol: string }>;
      };
      manifest.packages = manifest.packages.filter((item) => item.directory !== 'sdk-protocol');
      manifest.bindings = manifest.bindings.map((binding) => ({
        ...binding,
        protocol: binding.product === 'sdk-product' ? 'web-protocol' : binding.protocol,
      }));
      writeFileSync(join(fixture.root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
      const packageJson = JSON.parse(
        readFileSync(join(fixture.root, 'packages/sdk-product/package.json'), 'utf8'),
      ) as { dependencies: Record<string, string> };
      packageJson.dependencies = { '@sample/web-protocol': 'workspace:*' };
      writeFileSync(
        join(fixture.root, 'packages/sdk-product/package.json'),
        JSON.stringify(packageJson, null, 2),
      );
      expect(() => writeBundle()).toThrow(/disappeared during build/);
    } finally {
      fixture.cleanup();
    }
  });
});
