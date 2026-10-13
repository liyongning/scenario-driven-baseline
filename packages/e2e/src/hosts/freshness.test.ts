import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { productDigest, writeBundleManifest } from '../../../../scripts/lib/bundle.ts';
import { bundleManifestPath } from '../../../../scripts/lib/bundle-manifest.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import {
  protocolManifestPath,
  writeProtocolManifest,
} from '../../../../scripts/lib/protocol-manifest.ts';
import { createEngineeringFormRoot } from '../../tests/tooling/engineering-form-fixture.ts';
import { assertProductBundleFresh, assertProtocolBundleFresh } from './freshness.ts';

const roots: Array<ReturnType<typeof createEngineeringFormRoot>> = [];

afterEach(() => {
  for (const fixture of roots.splice(0)) fixture.cleanup();
});

function fixture() {
  const root = createEngineeringFormRoot(undefined, {
    'packages/web-product/dist/index.html': '<script src="./assets/index.js"></script>\n',
    'packages/web-product/dist/assets/index.js': 'console.log("web");\n',
  });
  roots.push(root);
  writeFreshnessArtifacts(root.root);
  return root;
}

function writeFreshnessArtifacts(root: string) {
  const manifest = loadProjectManifest(root);
  const product = manifest.packages.find((item) => item.directory === 'web-product')!;
  const output = 'assets/index.js';
  writeBundleManifest(root, manifest, product, {
    formatVersion: 1,
    product: product.directory,
    entry: 'packages/web-product/src/main.ts',
    productDigest: productDigest(root, manifest, product),
    modules: [
      {
        source: 'packages/web-product/src/main.ts',
        dependency: false,
        outputs: [output],
      },
    ],
    outputs: [
      {
        file: output,
        sha256: createHash('sha256')
          .update(readFileSync(join(root, 'packages/web-product/dist', output)))
          .digest('hex'),
      },
    ],
  });
  const protocol = manifest.packages.find((item) => item.directory === 'web-protocol')!;
  writeProtocolManifest(root, manifest, protocol);
}

test('product bundle freshness accepts current output and reports every startup failure', () => {
  const root = fixture();
  expect(() => assertProductBundleFresh(root.root, 'web-product')).not.toThrow();
  expect(() => assertProductBundleFresh(root.root, 'missing')).toThrow(/未登记包/);

  const path = bundleManifestPath(root.root, 'web-product');
  rmSync(path);
  expect(() => assertProductBundleFresh(root.root, 'web-product')).toThrow(/不存在/);

  mkdirSync(join(root.root, 'artifacts/build/web-product'), { recursive: true });
  writeFileSync(path, '{invalid json\n');
  expect(() => assertProductBundleFresh(root.root, 'web-product')).toThrow(/不是有效 JSON/);

  writeFileSync(path, '{}\n');
  expect(() => assertProductBundleFresh(root.root, 'web-product')).toThrow(/产物已过期或缺失/);
});

test('protocol bundle freshness validates JSON shape and source digest', () => {
  const root = fixture();
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).not.toThrow();
  expect(() => assertProtocolBundleFresh(root.root, 'missing')).toThrow(/未登记包/);

  const path = protocolManifestPath(root.root, 'web-protocol');
  rmSync(path);
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).toThrow(/不存在/);

  mkdirSync(join(root.root, 'artifacts/build/web-protocol'), { recursive: true });
  writeFileSync(path, '{invalid json\n');
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).toThrow(/不是有效 JSON/);

  writeFileSync(path, 'null\n');
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).toThrow(/格式无效/);
  writeFileSync(path, '"scalar"\n');
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).toThrow(/格式无效/);
  writeFileSync(path, '{}\n');
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).toThrow(/格式无效/);
  writeFileSync(path, '{"protocol":"web-protocol"}\n');
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).toThrow(/格式无效/);
  writeFileSync(path, '{"formatVersion":1,"protocol":"web-protocol","sourceDigest":"stale"}\n');
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).toThrow(/产物已过期/);

  const manifest = loadProjectManifest(root.root);
  const protocol = manifest.packages.find((item) => item.directory === 'web-protocol')!;
  writeProtocolManifest(root.root, manifest, protocol);
  expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).not.toThrow();
});

test(
  'SCN-BROWSER-PLATFORM-007 freshness-host-rules',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-007',
        caseId: 'freshness-host-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-007',
            caseKey: 'freshness-host-rules',
            checks: [
              'fresh-accepted',
              'source-change-rejected',
              'manifest-missing-rejected',
              'protocol-host-stale-rejected',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const checks = [
      'fresh-accepted',
      'source-change-rejected',
      'manifest-missing-rejected',
      'protocol-host-stale-rejected',
    ];
    const executed: string[] = [];
    const before = context.expect.getState().assertionCalls;
    const checkpoint = async (name: string, assertion: () => void) => {
      assertion();
      executed.push(name);
    };
    const root = fixture();

    await checkpoint('fresh-accepted', () => {
      context.expect(() => assertProductBundleFresh(root.root, 'web-product')).not.toThrow();
      context.expect(() => assertProtocolBundleFresh(root.root, 'web-protocol')).not.toThrow();
    });

    await checkpoint('source-change-rejected', () => {
      const productSource = join(root.root, 'packages/web-product/src/main.ts');
      const originalProductSource = readFileSync(productSource, 'utf8');
      writeFileSync(productSource, 'export const changedProduct = true;\n');
      context
        .expect(() => assertProductBundleFresh(root.root, 'web-product'))
        .toThrow(/过期|stale/);
      writeFileSync(productSource, originalProductSource);
      context.expect(() => assertProductBundleFresh(root.root, 'web-product')).not.toThrow();

      const protocolSource = join(root.root, 'packages/web-protocol/src/index.ts');
      const originalProtocolSource = readFileSync(protocolSource, 'utf8');
      writeFileSync(protocolSource, 'export const changedProtocol = true;\n');
      context
        .expect(() => assertProductBundleFresh(root.root, 'web-product'))
        .toThrow(/过期|stale/);
      writeFileSync(protocolSource, originalProtocolSource);
      context.expect(() => assertProductBundleFresh(root.root, 'web-product')).not.toThrow();
    });

    await checkpoint('manifest-missing-rejected', () => {
      rmSync(bundleManifestPath(root.root, 'web-product'));
      context
        .expect(() => assertProductBundleFresh(root.root, 'web-product'))
        .toThrow(/先执行 pnpm build/);
      writeFreshnessArtifacts(root.root);
      context.expect(() => assertProductBundleFresh(root.root, 'web-product')).not.toThrow();
    });

    await checkpoint('protocol-host-stale-rejected', () => {
      writeFileSync(
        join(root.root, 'packages/web-protocol/src/index.ts'),
        'export const changedProtocol = true;\n',
      );
      context
        .expect(() => assertProtocolBundleFresh(root.root, 'web-protocol'))
        .toThrow(/产物已过期.*pnpm build/);
    });

    context.expect(executed.sort()).toEqual([...checks].sort());
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);
