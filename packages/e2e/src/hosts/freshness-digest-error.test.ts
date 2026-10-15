import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkParsedBundle: vi.fn(() => []),
  productDigest: vi.fn(() => 'short'),
}));
vi.mock('../../../../scripts/lib/bundle.ts', () => mocks);

import { bundleManifestPath } from '../../../../scripts/lib/bundle-manifest.ts';
import { createEngineeringFormRoot } from '../../tests/tooling/engineering-form-fixture.ts';
import { assertProductBundleFresh } from './freshness.ts';

test('product freshness rejects an invalid internal digest', () => {
  const root = createEngineeringFormRoot();
  try {
    const path = bundleManifestPath(root.root, 'web-product');
    mkdirSync(join(root.root, 'artifacts/build/web-product'), { recursive: true });
    writeFileSync(path, '{}\n');
    expect(() => assertProductBundleFresh(root.root, 'web-product')).toThrow(/产品摘要计算失败/);
  } finally {
    root.cleanup();
  }
});
